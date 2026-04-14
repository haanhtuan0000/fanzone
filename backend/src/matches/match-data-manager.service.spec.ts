import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MatchDataManager } from './match-data-manager.service';
import { ApiFootballService } from '../common/api-football/api-football.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { QuestionResolverService } from '../questions/question-resolver.service';
import { QuestionGeneratorService } from '../questions/question-generator.service';
import { QuestionsService } from '../questions/questions.service';
import { ScheduleTracker } from './schedule-tracker';
import { PollBudgetService } from './poll-budget.service';
import { createMockPrisma, createMockRedis, createMockWebsocket } from '../test/mock-factories';

describe('MatchDataManager', () => {
  let manager: MatchDataManager;
  let prisma: ReturnType<typeof createMockPrisma>;
  let redis: ReturnType<typeof createMockRedis>;
  let ws: ReturnType<typeof createMockWebsocket>;
  let apiFootball: any;
  let questionResolver: any;
  let questionGenerator: any;
  let questionsService: any;
  let scheduleTracker: any;
  let budget: any;

  beforeEach(async () => {
    prisma = createMockPrisma();
    redis = createMockRedis();
    ws = createMockWebsocket();
    apiFootball = {
      getLiveFixtures: jest.fn().mockResolvedValue([]),
      getFixtureStatistics: jest.fn().mockResolvedValue([]),
      getFixtureEvents: jest.fn().mockResolvedValue([]),
      getFixtureLineups: jest.fn().mockResolvedValue([]),
      isRateLimited: jest.fn().mockReturnValue(false),
    };
    questionResolver = {
      lockExpiredQuestions: jest.fn().mockResolvedValue(undefined),
      onHalfTime: jest.fn().mockResolvedValue(undefined),
      onFullTime: jest.fn().mockResolvedValue(undefined),
      tryResolveFromEvent: jest.fn().mockResolvedValue(false),
      resolveTimedOut: jest.fn().mockResolvedValue(undefined),
      voidQuestion: jest.fn().mockResolvedValue(undefined),
    };
    questionGenerator = {
      generateForPhase: jest.fn().mockResolvedValue([]),
      generateCatchUp: jest.fn().mockResolvedValue([]),
      generateFromEvent: jest.fn().mockResolvedValue(null),
      determinePhase: jest.fn().mockReturnValue('EARLY_H1'),
      cleanupFixture: jest.fn().mockResolvedValue(undefined),
    };
    questionsService = {
      hasOpenQuestion: jest.fn().mockResolvedValue(false),
      hasPendingQuestion: jest.fn().mockResolvedValue(false),
      openNextPending: jest.fn().mockResolvedValue(null),
    };
    scheduleTracker = {
      refresh: jest.fn().mockResolvedValue(undefined),
      minutesUntilNextKickoff: jest.fn().mockResolvedValue(0),
    };
    budget = {
      canMakeCall: jest.fn().mockReturnValue(true),
      recordCall: jest.fn(),
      isThrottled: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchDataManager,
        { provide: ApiFootballService, useValue: apiFootball },
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: WebsocketGateway, useValue: ws },
        { provide: QuestionResolverService, useValue: questionResolver },
        { provide: QuestionGeneratorService, useValue: questionGenerator },
        { provide: QuestionsService, useValue: questionsService },
        { provide: ScheduleTracker, useValue: scheduleTracker },
        { provide: PollBudgetService, useValue: budget },
        { provide: ConfigService, useValue: { get: () => 'false' } },
      ],
    }).compile();

    manager = module.get<MatchDataManager>(MatchDataManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
    const hb = (manager as any).heartbeat;
    if (hb) clearInterval(hb);
    (manager as any).heartbeat = null;
  });

  // ═══ recoverMatchStates ═══

  describe('recoverMatchStates', () => {
    it('recovers fixtures with active questions from last 4 hours', async () => {
      prisma.question.groupBy.mockResolvedValue([
        { fixtureId: 111 },
        { fixtureId: 222 },
      ]);
      prisma.question.findFirst.mockResolvedValue({ matchPhase: 'MID_H1', matchMinute: 25 });
      redis.getJson.mockResolvedValue({ period: '1H', elapsed: 25, homeScore: 1, awayScore: 0 });

      await (manager as any).recoverMatchStates();

      const states = (manager as any).matchStates as Map<number, any>;
      expect(states.size).toBe(2);
      expect(states.get(111)?.hasActiveQuestions).toBe(true);
      expect(states.get(222)?.hasActiveQuestions).toBe(true);
    });

    it('uses Redis cache for score/period when available', async () => {
      prisma.question.groupBy.mockResolvedValue([{ fixtureId: 111 }]);
      prisma.question.findFirst.mockResolvedValue({ matchPhase: 'MID_H2', matchMinute: 65 });
      redis.getJson.mockResolvedValue({ period: '2H', elapsed: 68, homeScore: 2, awayScore: 1 });

      await (manager as any).recoverMatchStates();

      const state = (manager as any).matchStates.get(111);
      expect(state.period).toBe('2H');
      expect(state.elapsed).toBe(68);
      expect(state.score).toEqual({ home: 2, away: 1 });
    });

    it('uses current elapsed for lastPhase, not stale question matchPhase', async () => {
      prisma.question.groupBy.mockResolvedValue([{ fixtureId: 111 }]);
      // Latest question was from EARLY_H1, but match is now at 65' (MID_H2)
      prisma.question.findFirst.mockResolvedValue({ matchPhase: 'EARLY_H1', matchMinute: 5 });
      redis.getJson.mockResolvedValue({ period: '2H', elapsed: 65, homeScore: 1, awayScore: 0 });
      questionGenerator.determinePhase.mockReturnValue('MID_H2');

      await (manager as any).recoverMatchStates();

      const state = (manager as any).matchStates.get(111);
      // lastPhase should be MID_H2 (from current elapsed), NOT EARLY_H1 (from stale question)
      expect(state.lastPhase).toBe('MID_H2');
    });

    it('falls back to defaults when Redis cache empty', async () => {
      prisma.question.groupBy.mockResolvedValue([{ fixtureId: 111 }]);
      prisma.question.findFirst.mockResolvedValue({ matchPhase: 'EARLY_H1', matchMinute: 5 });
      redis.getJson.mockResolvedValue(null);

      await (manager as any).recoverMatchStates();

      const state = (manager as any).matchStates.get(111);
      expect(state.period).toBe('2H'); // default
      expect(state.score).toEqual({ home: 0, away: 0 });
    });

    it('does NOT use matchMinute as elapsed fallback (prevents kickoffTime error)', async () => {
      prisma.question.groupBy.mockResolvedValue([{ fixtureId: 111 }]);
      // Latest question at matchMinute=28, but Redis cache expired — no real elapsed
      prisma.question.findFirst.mockResolvedValue({ matchPhase: 'MID_H1', matchMinute: 28 });
      redis.getJson.mockResolvedValue(null); // cache expired

      await (manager as any).recoverMatchStates();

      const state = (manager as any).matchStates.get(111);
      // elapsed should be 0, NOT 28 (matchMinute is not the match clock)
      expect(state.elapsed).toBe(0);
    });

    it('uses API elapsed from Redis, not matchMinute, when cache exists', async () => {
      prisma.question.groupBy.mockResolvedValue([{ fixtureId: 111 }]);
      prisma.question.findFirst.mockResolvedValue({ matchPhase: 'MID_H1', matchMinute: 28 });
      redis.getJson.mockResolvedValue({ period: '2H', elapsed: 70, homeScore: 1, awayScore: 0 });

      await (manager as any).recoverMatchStates();

      const state = (manager as any).matchStates.get(111);
      // elapsed should be 70 from API cache, not 28 from matchMinute
      expect(state.elapsed).toBe(70);
    });

    it('clears Redis cooldown keys for recovered fixtures', async () => {
      prisma.question.groupBy.mockResolvedValue([{ fixtureId: 111 }, { fixtureId: 222 }]);
      prisma.question.findFirst.mockResolvedValue({ matchPhase: 'EARLY_H1', matchMinute: 5 });
      redis.getJson.mockResolvedValue(null);

      await (manager as any).recoverMatchStates();

      expect(redis.del).toHaveBeenCalledWith('fixture:111:question-check');
      expect(redis.del).toHaveBeenCalledWith('fixture:222:question-check');
    });

    it('handles empty result (no active fixtures)', async () => {
      prisma.question.groupBy.mockResolvedValue([]);

      await (manager as any).recoverMatchStates();

      const states = (manager as any).matchStates as Map<number, any>;
      expect(states.size).toBe(0);
    });

    it('filters to questions created in last 4 hours', async () => {
      prisma.question.groupBy.mockResolvedValue([]);

      await (manager as any).recoverMatchStates();

      expect(prisma.question.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: expect.any(Date) },
          }),
        }),
      );
    });
  });

  // ═══ ensureQuestionsExist ═══

  describe('ensureQuestionsExist', () => {
    const teams = { home: 'Arsenal', away: 'Chelsea' };
    const sc = { home: 0, away: 0 };

    it('generates questions on cold start (totalGenerated=0)', async () => {
      redis.get.mockResolvedValue(null);
      prisma.question.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      (manager as any).matchStates.set(111, { hasActiveQuestions: false });

      await (manager as any).ensureQuestionsExist(111, '1H', 10, teams, sc);

      expect(questionGenerator.generateForPhase).toHaveBeenCalledWith(111, 10, teams, sc, '1H');
    });

    it('sets hasActiveQuestions=true when active questions exist', async () => {
      redis.get.mockResolvedValue(null);
      prisma.question.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
      (manager as any).matchStates.set(111, { hasActiveQuestions: false });

      await (manager as any).ensureQuestionsExist(111, '1H', 10, teams, sc);

      expect((manager as any).matchStates.get(111).hasActiveQuestions).toBe(true);
      expect(questionGenerator.generateForPhase).not.toHaveBeenCalled();
    });

    it('generates fresh when all resolved but under cap', async () => {
      redis.get.mockResolvedValue(null);
      prisma.question.count.mockResolvedValueOnce(0).mockResolvedValueOnce(8);
      (manager as any).matchStates.set(111, { hasActiveQuestions: false });

      await (manager as any).ensureQuestionsExist(111, '2H', 60, teams, sc);

      expect(questionGenerator.generateForPhase).toHaveBeenCalled();
    });

    it('marks inactive when all resolved and at cap (15)', async () => {
      redis.get.mockResolvedValue(null);
      prisma.question.count.mockResolvedValueOnce(0).mockResolvedValueOnce(15);
      (manager as any).matchStates.set(111, { hasActiveQuestions: true });

      await (manager as any).ensureQuestionsExist(111, '2H', 80, teams, sc);

      expect((manager as any).matchStates.get(111).hasActiveQuestions).toBe(false);
      expect(questionGenerator.generateForPhase).not.toHaveBeenCalled();
    });

    it('respects 60s Redis cooldown', async () => {
      redis.get.mockResolvedValue('1'); // cooldown active

      await (manager as any).ensureQuestionsExist(111, '1H', 10, teams, sc);

      expect(prisma.question.count).not.toHaveBeenCalled();
    });

    it('skips generation when all resolved but phase already in generated Set (Redis guard)', async () => {
      redis.get.mockResolvedValueOnce(null); // cooldown check — not active
      redis.sismember.mockResolvedValueOnce(true); // phase Set says MID_H1 already generated
      prisma.question.count.mockResolvedValueOnce(0).mockResolvedValueOnce(8); // activeCount=0, totalGenerated=8
      (manager as any).matchStates.set(111, { hasActiveQuestions: false });
      questionGenerator.determinePhase.mockReturnValue('MID_H1');

      await (manager as any).ensureQuestionsExist(111, '1H', 20, teams, sc);

      expect(questionGenerator.generateForPhase).not.toHaveBeenCalled();
      expect((manager as any).matchStates.get(111).hasActiveQuestions).toBe(false);
    });

    it('generates when all resolved and phase NOT in generated Set', async () => {
      redis.get.mockResolvedValueOnce(null); // cooldown — not active
      redis.sismember.mockResolvedValueOnce(false); // phase Set says MID_H1 not generated
      prisma.question.count.mockResolvedValueOnce(0).mockResolvedValueOnce(6);
      (manager as any).matchStates.set(111, { hasActiveQuestions: false });
      questionGenerator.determinePhase.mockReturnValue('MID_H1');

      await (manager as any).ensureQuestionsExist(111, '1H', 20, teams, sc);

      expect(questionGenerator.generateForPhase).toHaveBeenCalled();
    });

    it('sets Redis cooldown key after check', async () => {
      redis.get.mockResolvedValue(null);
      prisma.question.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
      (manager as any).matchStates.set(111, { hasActiveQuestions: false });

      await (manager as any).ensureQuestionsExist(111, '1H', 10, teams, sc);

      expect(redis.set).toHaveBeenCalledWith('fixture:111:question-check', '1', 60);
    });
  });

  // ═══ openReadyPending ═══

  describe('openReadyPending', () => {
    it('opens PENDING question when no OPEN exists', async () => {
      (manager as any).matchStates.set(111, { fixtureId: 111 });
      questionsService.hasOpenQuestion.mockResolvedValue(false);
      questionsService.openNextPending.mockResolvedValue({
        id: 'q-1', text: 'Test question here', category: 'GOAL',
      });

      await (manager as any).openReadyPending();

      expect(questionsService.openNextPending).toHaveBeenCalledWith(111);
      expect(ws.emitToMatch).toHaveBeenCalledWith(111, 'new_question', expect.objectContaining({
        fixtureId: 111, questionId: 'q-1',
      }));
    });

    it('skips when OPEN question already exists', async () => {
      (manager as any).matchStates.set(111, { fixtureId: 111 });
      questionsService.hasOpenQuestion.mockResolvedValue(true);

      await (manager as any).openReadyPending();

      expect(questionsService.openNextPending).not.toHaveBeenCalled();
    });

    it('does not broadcast when no pending is ready', async () => {
      (manager as any).matchStates.set(111, { fixtureId: 111 });
      questionsService.hasOpenQuestion.mockResolvedValue(false);
      questionsService.openNextPending.mockResolvedValue(null);

      await (manager as any).openReadyPending();

      expect(ws.emitToMatch).not.toHaveBeenCalled();
    });

    it('processes all fixtures in matchStates', async () => {
      (manager as any).matchStates.set(111, { fixtureId: 111 });
      (manager as any).matchStates.set(222, { fixtureId: 222 });
      questionsService.hasOpenQuestion.mockResolvedValue(false);
      questionsService.openNextPending.mockResolvedValue(null);

      await (manager as any).openReadyPending();

      expect(questionsService.hasOpenQuestion).toHaveBeenCalledTimes(2);
    });
  });

  // ═══ pollFixtures — key scenarios ═══

  describe('pollFixtures', () => {
    const makeFixture = (id: number, period: string, elapsed: number, home: string, away: string) => ({
      fixture: { id, status: { short: period, elapsed } },
      teams: { home: { name: home, id: id * 10 }, away: { name: away, id: id * 10 + 1 } },
      goals: { home: 0, away: 0 },
      league: { id: 39, name: 'Premier League' },
    });

    it('creates state and generates questions for new match', async () => {
      const fixture = makeFixture(111, '1H', 5, 'Arsenal', 'Chelsea');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('EARLY_H1');

      await (manager as any).pollFixtures();

      const states = (manager as any).matchStates as Map<number, any>;
      expect(states.has(111)).toBe(true);
      expect(questionGenerator.generateCatchUp).toHaveBeenCalledWith(
        111, 5, { home: 'Arsenal', away: 'Chelsea' }, { home: 0, away: 0 }, '1H',
      );
    });

    it('does not regenerate for existing match (no phase change)', async () => {
      // Pre-populate state
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '1H', elapsed: 5, lastPhase: 'EARLY_H1',
        teams: { home: 'Arsenal', away: 'Chelsea' }, score: { home: 0, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0, lastSeenInApi: Date.now(),
      });

      const fixture = makeFixture(111, '1H', 10, 'Arsenal', 'Chelsea');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('EARLY_H1');
      // ensureQuestionsExist cooldown active — prevents it from calling generateForPhase
      redis.get.mockResolvedValue('1');

      await (manager as any).pollFixtures();

      // No generation because phase hasn't changed and cooldown blocks ensureQuestionsExist
      expect(questionGenerator.generateForPhase).not.toHaveBeenCalled();
    });

    it('detects period transition 1H→HT and calls handlePeriodTransition', async () => {
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '1H', elapsed: 45, lastPhase: 'LATE_H1',
        teams: { home: 'Arsenal', away: 'Chelsea' }, score: { home: 1, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0, lastSeenInApi: Date.now(),
      });

      const fixture = makeFixture(111, 'HT', 45, 'Arsenal', 'Chelsea');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('HALF_TIME');

      await (manager as any).pollFixtures();

      expect(questionResolver.onHalfTime).toHaveBeenCalledWith(
        111, { home: 'Arsenal', away: 'Chelsea' }, { home: 0, away: 0 },
      );
      expect(questionGenerator.generateForPhase).toHaveBeenCalled();
    });

    it('periodTransitioned flag prevents internal phase generation on same tick', async () => {
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '1H', elapsed: 44, lastPhase: 'LATE_H1',
        teams: { home: 'Arsenal', away: 'Chelsea' }, score: { home: 0, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0, lastSeenInApi: Date.now(),
      });

      const fixture = makeFixture(111, 'HT', 45, 'Arsenal', 'Chelsea');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('HALF_TIME');

      await (manager as any).pollFixtures();

      // generateForPhase called from handlePeriodTransition
      // but NOT called again from internal phase check (periodTransitioned=true)
      // One call from HT period transition only
      const genCalls = questionGenerator.generateForPhase.mock.calls;
      expect(genCalls.length).toBe(1);
    });

    it('detects internal phase change and generates', async () => {
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '1H', elapsed: 14, lastPhase: 'EARLY_H1',
        teams: { home: 'Arsenal', away: 'Chelsea' }, score: { home: 0, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0, lastSeenInApi: Date.now(),
      });

      const fixture = makeFixture(111, '1H', 20, 'Arsenal', 'Chelsea');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('MID_H1');

      await (manager as any).pollFixtures();

      expect(questionGenerator.generateForPhase).toHaveBeenCalledWith(
        111, 20, expect.any(Object), expect.any(Object), '1H',
      );
    });

    it('triggers onFullTime when match disappears for 5+ minutes (forwards last known period)', async () => {
      const fiveMinAgo = Date.now() - 310_000;
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '2H', elapsed: 90, lastPhase: 'LATE_H2',
        teams: { home: 'Arsenal', away: 'Chelsea' }, score: { home: 2, away: 1 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0, lastSeenInApi: fiveMinAgo,
      });

      apiFootball.getLiveFixtures.mockResolvedValue([]); // empty — match disappeared

      await (manager as any).pollFixtures();

      // Forward the LAST KNOWN period ('2H'), not literal 'FT'. This lets the resolver's
      // completeness guard distinguish disappear-during-2H (likely real FT) from
      // disappear-during-HT (NOT a real FT — H2 never played).
      expect(questionResolver.onFullTime).toHaveBeenCalledWith(
        111, { home: 'Arsenal', away: 'Chelsea' }, { home: 2, away: 1 }, undefined, '2H',
      );
      expect((manager as any).matchStates.has(111)).toBe(false);
    });

    it('disappear-during-HT forwards period=HT (not FT) so resolver can VOID H2 questions', async () => {
      const fiveMinAgo = Date.now() - 310_000;
      (manager as any).matchStates.set(112, {
        fixtureId: 112, period: 'HT', elapsed: 45, lastPhase: 'HALF_TIME',
        teams: { home: 'Manchester United', away: 'Leeds' }, score: { home: 0, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0, lastSeenInApi: fiveMinAgo,
      });

      apiFootball.getLiveFixtures.mockResolvedValue([]);

      await (manager as any).pollFixtures();

      // Critical: must NOT pass 'FT' here — H2 never played.
      expect(questionResolver.onFullTime).toHaveBeenCalledWith(
        112, { home: 'Manchester United', away: 'Leeds' }, { home: 0, away: 0 }, undefined, 'HT',
      );
    });

    it('detects stale elapsed (stuck for 5+ min while still appearing live) and triggers FT', async () => {
      // Match still appears in API but elapsed has been stuck at 84' for 6 minutes
      const sixMinAgo = Date.now() - 6 * 60_000;
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '2H', elapsed: 84, lastPhase: 'LATE_H2',
        teams: { home: 'Crystal Palace', away: 'Newcastle' }, score: { home: 1, away: 1 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0,
        lastSeenInApi: Date.now(), // still appearing in API
        lastElapsedChange: sixMinAgo, // but elapsed hasn't changed in 6 min
      });

      // API returns the match with same elapsed (84' frozen)
      const fixture = makeFixture(111, '2H', 84, 'Crystal Palace', 'Newcastle');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('LATE_H2');

      await (manager as any).pollFixtures();

      // Should be detected as stuck and treated as finished.
      // We forward the LAST KNOWN period ('2H'), not 'FT', so the resolver's completeness
      // guard can decide whether H2-dependent questions are safe to resolve.
      // Note: score gets updated from API (0-0 from makeFixture) before stale check.
      expect(questionResolver.onFullTime).toHaveBeenCalledWith(
        111, { home: 'Crystal Palace', away: 'Newcastle' }, { home: 0, away: 0 }, undefined, '2H',
      );
      expect((manager as any).matchStates.has(111)).toBe(false);
    });

    it('does not flag stale when elapsed changes recently (4 min stuck = OK)', async () => {
      const fourMinAgo = Date.now() - 4 * 60_000;
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '2H', elapsed: 84, lastPhase: 'LATE_H2',
        teams: { home: 'A', away: 'B' }, score: { home: 0, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0,
        lastSeenInApi: Date.now(),
        lastElapsedChange: fourMinAgo, // stuck 4 min — under threshold
      });

      const fixture = makeFixture(111, '2H', 84, 'A', 'B');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('LATE_H2');

      await (manager as any).pollFixtures();

      // Should NOT trigger FT yet
      expect(questionResolver.onFullTime).not.toHaveBeenCalled();
      expect((manager as any).matchStates.has(111)).toBe(true);
    });

    it('does NOT trigger stale FT during HT (half-time has no clock progress)', async () => {
      // At HT, elapsed stays at 45 for ~15 min — that's normal, not stale
      const tenMinAgo = Date.now() - 10 * 60_000;
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: 'HT', elapsed: 45, lastPhase: 'HALF_TIME',
        teams: { home: 'A', away: 'B' }, score: { home: 1, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0,
        lastSeenInApi: Date.now(),
        lastElapsedChange: tenMinAgo, // stuck 10 min, but at HT
      });

      const fixture = makeFixture(111, 'HT', 45, 'A', 'B');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('HALF_TIME');

      await (manager as any).pollFixtures();

      // Should NOT trigger FT — HT is a normal break period
      expect(questionResolver.onFullTime).not.toHaveBeenCalled();
      expect((manager as any).matchStates.has(111)).toBe(true);
    });

    it('rejects elapsed going backwards within same period (clock cannot decrease)', async () => {
      // Match is at 90', API returns 84' (impossible — clock can't go back)
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '2H', elapsed: 90, lastPhase: 'LATE_H2',
        teams: { home: 'A', away: 'B' }, score: { home: 0, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0,
        lastSeenInApi: Date.now(),
        lastElapsedChange: Date.now(),
      });

      const fixture = makeFixture(111, '2H', 84, 'A', 'B'); // ← API says 84
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('LATE_H2');

      await (manager as any).pollFixtures();

      const state = (manager as any).matchStates.get(111);
      // State should keep 90', not regress to 84
      expect(state.elapsed).toBe(90);
    });

    it('accepts elapsed going forward (normal advancement)', async () => {
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '2H', elapsed: 80, lastPhase: 'LATE_H2',
        teams: { home: 'A', away: 'B' }, score: { home: 0, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0,
        lastSeenInApi: Date.now(),
        lastElapsedChange: Date.now(),
      });

      const fixture = makeFixture(111, '2H', 85, 'A', 'B'); // ← forward
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('LATE_H2');

      await (manager as any).pollFixtures();

      expect((manager as any).matchStates.get(111).elapsed).toBe(85);
    });

    it('accepts elapsed reset across period boundary (1H 45 → 2H 46)', async () => {
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '1H', elapsed: 45, lastPhase: 'LATE_H1',
        teams: { home: 'A', away: 'B' }, score: { home: 0, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0,
        lastSeenInApi: Date.now(),
        lastElapsedChange: Date.now(),
      });

      // Different period — even if elapsed value is lower, should accept
      const fixture = makeFixture(111, '2H', 46, 'A', 'B');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('EARLY_H2');

      await (manager as any).pollFixtures();

      expect((manager as any).matchStates.get(111).elapsed).toBe(46);
    });

    it('backwards elapsed does not reset staleness timer', async () => {
      const tenMinAgo = Date.now() - 10 * 60_000;
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '2H', elapsed: 90, lastPhase: 'LATE_H2',
        teams: { home: 'A', away: 'B' }, score: { home: 0, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0,
        lastSeenInApi: Date.now(),
        lastElapsedChange: tenMinAgo, // stuck for 10 min
      });

      // API returns 84 (going backwards) — should NOT reset staleness timer
      const fixture = makeFixture(111, '2H', 84, 'A', 'B');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('LATE_H2');

      await (manager as any).pollFixtures();

      // Should be marked as FT because staleness timer wasn't reset
      expect(questionResolver.onFullTime).toHaveBeenCalled();
    });

    it('updates lastElapsedChange when elapsed changes', async () => {
      const oneMinAgo = Date.now() - 60_000;
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '2H', elapsed: 80, lastPhase: 'LATE_H2',
        teams: { home: 'A', away: 'B' }, score: { home: 0, away: 0 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0,
        lastSeenInApi: Date.now(),
        lastElapsedChange: oneMinAgo,
      });

      // API returns match with new elapsed (81)
      const fixture = makeFixture(111, '2H', 81, 'A', 'B');
      apiFootball.getLiveFixtures.mockResolvedValue([fixture]);
      questionGenerator.determinePhase.mockReturnValue('LATE_H2');

      const before = Date.now();
      await (manager as any).pollFixtures();
      const after = Date.now();

      const state = (manager as any).matchStates.get(111);
      // lastElapsedChange should be updated to ~now
      expect(state.lastElapsedChange).toBeGreaterThanOrEqual(before);
      expect(state.lastElapsedChange).toBeLessThanOrEqual(after);
    });

    it('does not trigger onFullTime within 5-minute grace period', async () => {
      const twoMinAgo = Date.now() - 120_000;
      (manager as any).matchStates.set(111, {
        fixtureId: 111, period: '2H', elapsed: 90, lastPhase: 'LATE_H2',
        teams: { home: 'Arsenal', away: 'Chelsea' }, score: { home: 2, away: 1 },
        lineupsLoaded: false, lineupRetries: 0, hasActiveQuestions: true,
        lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0, lastSeenInApi: twoMinAgo,
      });

      apiFootball.getLiveFixtures.mockResolvedValue([]);

      await (manager as any).pollFixtures();

      expect(questionResolver.onFullTime).not.toHaveBeenCalled();
      expect((manager as any).matchStates.has(111)).toBe(true);
    });

    it('skips pollFixtures when budget exhausted', async () => {
      budget.canMakeCall.mockReturnValue(false);

      await (manager as any).pollFixtures();

      expect(apiFootball.getLiveFixtures).not.toHaveBeenCalled();
    });
  });
});
