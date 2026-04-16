import { Test, TestingModule } from '@nestjs/testing';
import { QuestionResolverService } from './question-resolver.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ScoringService } from '../predictions/scoring.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { FeedService } from '../feed/feed.service';
import { ApiFootballService } from '../common/api-football/api-football.service';
import { createMockPrisma, createMockRedis, createMockWebsocket, createMockQuestion } from '../test/mock-factories';

describe('QuestionResolverService', () => {
  let service: QuestionResolverService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let redis: ReturnType<typeof createMockRedis>;
  let ws: ReturnType<typeof createMockWebsocket>;
  let scoringService: any;
  let feedService: any;
  let apiFootball: any;

  const fixtureId = 12345;
  const teams = { home: 'Arsenal', away: 'Chelsea' };
  const score = { home: 2, away: 1 };

  beforeEach(async () => {
    prisma = createMockPrisma();
    redis = createMockRedis();
    ws = createMockWebsocket();
    scoringService = {
      scoreQuestion: jest.fn().mockResolvedValue([]),
      voidQuestion: jest.fn().mockResolvedValue([]),
    };
    feedService = {
      createFeedEvent: jest.fn().mockResolvedValue({}),
    };
    apiFootball = {
      getFixtureStatistics: jest.fn().mockResolvedValue([]),
      getFixtureEvents: jest.fn().mockResolvedValue([]),
      isRateLimited: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ScoringService, useValue: scoringService },
        { provide: WebsocketGateway, useValue: ws },
        { provide: FeedService, useValue: feedService },
        { provide: ApiFootballService, useValue: apiFootball },
      ],
    }).compile();

    service = module.get<QuestionResolverService>(QuestionResolverService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══ lockExpiredQuestions ═══

  describe('lockExpiredQuestions', () => {
    it('locks OPEN questions with closesAt in the past', async () => {
      const expired = createMockQuestion({
        status: 'OPEN',
        closesAt: new Date(Date.now() - 5000),
      });
      prisma.question.findMany.mockResolvedValue([expired]);
      prisma.question.updateMany.mockResolvedValue({ count: 1 });
      prisma.question.findFirst.mockResolvedValue(null);

      await service.lockExpiredQuestions(fixtureId);

      expect(prisma.question.updateMany).toHaveBeenCalledWith({
        where: { id: expired.id, status: 'OPEN' },
        data: { status: 'LOCKED' },
      });
    });

    it('does nothing when no expired questions', async () => {
      prisma.question.findMany.mockResolvedValue([]);

      await service.lockExpiredQuestions(fixtureId);

      expect(prisma.question.updateMany).not.toHaveBeenCalled();
    });

    it('opens next PENDING after locking', async () => {
      const expired = createMockQuestion({ status: 'OPEN', closesAt: new Date(Date.now() - 5000) });
      const nextPending = createMockQuestion({ id: 'q-next', status: 'PENDING', opensAt: new Date(Date.now() - 1000) });

      prisma.question.findMany.mockResolvedValue([expired]);
      prisma.question.updateMany.mockResolvedValue({ count: 1 });
      prisma.question.findFirst.mockResolvedValue(nextPending);

      await service.lockExpiredQuestions(fixtureId);

      expect(prisma.question.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ fixtureId, status: 'PENDING' }),
        }),
      );
    });

    it('locks multiple expired questions but opens only ONE next', async () => {
      const expired1 = createMockQuestion({ id: 'q-exp-1', status: 'OPEN', closesAt: new Date(Date.now() - 10000) });
      const expired2 = createMockQuestion({ id: 'q-exp-2', status: 'OPEN', closesAt: new Date(Date.now() - 5000) });

      prisma.question.findMany.mockResolvedValue([expired1, expired2]);
      prisma.question.updateMany.mockResolvedValue({ count: 1 });
      prisma.question.findFirst.mockResolvedValue(null);

      await service.lockExpiredQuestions(fixtureId);

      // Both locked
      expect(prisma.question.updateMany).toHaveBeenCalledTimes(2);
      // openNextPending called only once
      expect(prisma.question.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // ═══ onFullTime ═══

  describe('onFullTime', () => {
    beforeEach(() => {
      // warmTemplateCache needs questionTemplate.findMany
      prisma.questionTemplate = { findMany: jest.fn().mockResolvedValue([]) } as any;
    });

    it('fetches all remaining OPEN/LOCKED/PENDING questions', async () => {
      prisma.question.findMany.mockResolvedValue([]);

      await service.onFullTime(fixtureId, teams, score);

      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fixtureId,
            status: { in: ['OPEN', 'LOCKED', 'PENDING'] },
          }),
        }),
      );
    });

    it('creates system feed event for full time', async () => {
      prisma.question.findMany.mockResolvedValue([]);

      await service.onFullTime(fixtureId, teams, score);

      expect(feedService.createFeedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          fixtureId,
          type: 'SYSTEM',
          message: expect.stringContaining('Arsenal'),
        }),
      );
    });

    it('fetches events and stats from API for resolution', async () => {
      prisma.question.findMany.mockResolvedValue([]);

      await service.onFullTime(fixtureId, teams, score);

      expect(apiFootball.getFixtureStatistics).toHaveBeenCalled();
      expect(apiFootball.getFixtureEvents).toHaveBeenCalled();
    });
  });

  // ═══ onHalfTime ═══

  describe('onHalfTime', () => {
    it('fetches HT stats and events from API', async () => {
      prisma.question.findMany.mockResolvedValue([]);

      await service.onHalfTime(fixtureId, teams, score);

      expect(apiFootball.getFixtureStatistics).toHaveBeenCalled();
      expect(apiFootball.getFixtureEvents).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  R-B: HT resolution defers rather than mis-resolve on unknown data
  //
  //  Before the fix, `events = []` was the default path when both cache
  //  and API had no answer — and HT resolution proceeded as if no goal
  //  had occurred. A "did a goal happen in H1?" question would then
  //  silently resolve "No" when reality was "we can't tell yet."
  //  The fix: if cache is null AND API is rate limited (or throws),
  //  return early and let the next poll retry.
  // ═══════════════════════════════════════════════════════════════

  describe('R-B: HT resolution defers when event data is unknown', () => {
    it('defers: cache is null AND API rate-limited → no question is resolved', async () => {
      // Cache lookup returns null.
      redis.getJson.mockResolvedValue(null);
      // API refuses the lookup — we have no signal either way.
      apiFootball.isRateLimited.mockReturnValue(true);

      await service.onHalfTime(fixtureId, teams, score);

      // The defer short-circuits BEFORE the resolve loop runs, so the
      // question set is never even queried.
      expect(prisma.question.findMany).not.toHaveBeenCalled();
      // And we didn't fall through to API either.
      expect(apiFootball.getFixtureEvents).not.toHaveBeenCalled();
    });

    it('proceeds: cache has events → resolves normally', async () => {
      redis.getJson.mockResolvedValue([{ type: 'Goal', time: { elapsed: 20 } }]);
      apiFootball.isRateLimited.mockReturnValue(true); // even if API is down
      prisma.question.findMany.mockResolvedValue([]);

      await service.onHalfTime(fixtureId, teams, score);

      // Resolution proceeded — we had enough data.
      expect(prisma.question.findMany).toHaveBeenCalled();
      // No wasted API call because cache answered.
      expect(apiFootball.getFixtureEvents).not.toHaveBeenCalled();
    });

    it('proceeds: cache null but API returns [] → treat as "known empty", not "unknown"', async () => {
      // The whole point of Part B: distinguish cache-null-and-cannot-fetch
      // (unknown) from cache-null-but-api-answered-empty (known empty).
      // If API answers, we know — even if the answer is no events.
      redis.getJson.mockResolvedValue(null);
      apiFootball.isRateLimited.mockReturnValue(false);
      apiFootball.getFixtureEvents.mockResolvedValue([]);
      prisma.question.findMany.mockResolvedValue([]);

      await service.onHalfTime(fixtureId, teams, score);

      // Resolution proceeded because API gave a definitive answer.
      expect(prisma.question.findMany).toHaveBeenCalled();
      expect(apiFootball.getFixtureEvents).toHaveBeenCalled();
    });
  });

  // ═══ Q008 — H2 questions must not resolve before H2 plays ═══

  describe('resolveAtFullTime — Q008 (Who scores first in 2H?)', () => {
    /** Build a Q008 question with 3 options: home, away, nobody before 65 */
    function q008Question() {
      return {
        id: 'q-008',
        fixtureId,
        templateId: 'tpl-q008',
        options: [
          { id: 'opt-home', name: 'Arsenal' },
          { id: 'opt-away', name: 'Chelsea' },
          { id: 'opt-no', name: 'Nobody before minute 65' },
        ],
      };
    }

    beforeEach(() => {
      // Make getTemplateCode return Q008 for our test question
      prisma.questionTemplate = {
        findMany: jest.fn().mockResolvedValue([{ id: 'tpl-q008', code: 'Q008' }]),
      } as any;
      // Race-safe updateMany must report 1 row updated so resolution proceeds
      prisma.question.updateMany.mockResolvedValue({ count: 1 });
    });

    it('VOIDs Q008 when called with no H2 events (H2 never played)', async () => {
      // Bug scenario: stale detection at HT triggers onFullTime.
      // No H2 events exist. Q008 should NOT resolve as "Nobody scored in H2"
      // because H2 never actually played.
      const question = q008Question();
      prisma.question.findMany.mockResolvedValue([{ ...question, status: 'OPEN' }]);
      // H1 events only (goal at 30')
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 30 }, team: { name: 'Arsenal' } },
      ]);

      await service.onFullTime(fixtureId, teams, score, undefined, undefined);

      // Should be voided, not resolved as "nobody"
      expect(scoringService.voidQuestion).toHaveBeenCalledWith(question.id);
      expect(scoringService.scoreQuestion).not.toHaveBeenCalled();
    });

    it('resolves Q008 normally when H2 events exist', async () => {
      const question = q008Question();
      prisma.question.findMany.mockResolvedValue([{ ...question, status: 'OPEN' }]);
      // Goal in H2 by Arsenal at 50'
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 50 }, team: { name: 'Arsenal' } },
      ]);

      await service.onFullTime(fixtureId, teams, score, undefined, undefined);

      // Should resolve with Arsenal as scorer
      expect(scoringService.scoreQuestion).toHaveBeenCalledWith(
        question.id, 'opt-home',
      );
    });

    it('resolves Q008 as "Nobody before 65" when H2 played but goal was after 65', async () => {
      const question = q008Question();
      prisma.question.findMany.mockResolvedValue([{ ...question, status: 'OPEN' }]);
      // H2 events exist (sub at 50'), goal after 65
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'subst', time: { elapsed: 50 } },
        { type: 'Goal', time: { elapsed: 70 }, team: { name: 'Arsenal' } },
      ]);

      await service.onFullTime(fixtureId, teams, score, undefined, undefined);

      // Should resolve with "Nobody before 65"
      expect(scoringService.scoreQuestion).toHaveBeenCalledWith(
        question.id, 'opt-no',
      );
    });

    it('resolves Q008 normally when finishedStatus is FT (real full time)', async () => {
      const question = q008Question();
      prisma.question.findMany.mockResolvedValue([{ ...question, status: 'OPEN' }]);
      // No H2 events but match really did finish
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 30 }, team: { name: 'Arsenal' } },
      ]);

      await service.onFullTime(fixtureId, teams, score, undefined, 'FT');

      // Should resolve as "Nobody" since real FT means H2 happened with no H2 goals
      expect(scoringService.scoreQuestion).toHaveBeenCalledWith(
        question.id, 'opt-no',
      );
    });
  });

  // ═══ Layer 2: centralized completeness guards ═══

  describe('onFullTime — Layer 2 completeness guards', () => {
    const tplId = (code: string) => `tpl-${code.toLowerCase()}`;

    function buildQ(code: string, options: any[]) {
      return {
        id: `q-${code.toLowerCase()}`,
        fixtureId,
        templateId: tplId(code),
        status: 'OPEN',
        options,
      };
    }

    beforeEach(() => {
      prisma.question.updateMany.mockResolvedValue({ count: 1 });
    });

    function setTemplate(code: string) {
      prisma.questionTemplate = {
        findMany: jest.fn().mockResolvedValue([{ id: tplId(code), code }]),
      } as any;
    }

    // ── H2-dependent templates ──

    it.each([
      ['Q008', [{ id: 'a', name: 'Arsenal' }, { id: 'b', name: 'Chelsea' }, { id: 'c', name: 'Nobody before 65' }]],
      ['Q032', [{ id: 'a', name: 'Striker H1' }, { id: 'b', name: 'Striker H2' }, { id: 'c', name: 'No goal' }]],
      ['Q034', [{ id: 'a', name: 'Yes H2 more' }, { id: 'b', name: 'No H1 equal/more' }]],
    ])('VOIDs %s when H2 has not played (no H2 events, fake FT)', async (code, opts) => {
      setTemplate(code);
      const q = buildQ(code, opts);
      prisma.question.findMany.mockResolvedValue([q]);
      // Only H1 events; finishedStatus=undefined (e.g. stale-FT call)
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 20 }, team: { name: 'Arsenal' } },
      ]);

      await service.onFullTime(fixtureId, teams, score, undefined, undefined);

      expect(scoringService.voidQuestion).toHaveBeenCalledWith(q.id);
      expect(scoringService.scoreQuestion).not.toHaveBeenCalled();
    });

    // ── Whole-match aggregate templates ──

    it.each([
      ['Q033', [{ id: 'a', name: '0-1' }, { id: 'b', name: '2' }, { id: 'c', name: '3' }, { id: 'd', name: '4+' }]],
      ['Q037', [{ id: 'a', name: '0-1' }, { id: 'b', name: '2-3' }, { id: 'c', name: '4-5' }, { id: 'd', name: '6+' }]],
      ['Q045', [{ id: 'a', name: '0-2' }, { id: 'b', name: '3' }, { id: 'c', name: '4' }, { id: 'd', name: '5' }]],
    ])('VOIDs %s when match did not seem complete (no events past min 80)', async (code, opts) => {
      setTemplate(code);
      const q = buildQ(code, opts);
      prisma.question.findMany.mockResolvedValue([q]);
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 50 }, team: { name: 'Arsenal' } },
      ]);

      await service.onFullTime(fixtureId, teams, score, undefined, undefined);

      expect(scoringService.voidQuestion).toHaveBeenCalledWith(q.id);
      expect(scoringService.scoreQuestion).not.toHaveBeenCalled();
    });

    it('does NOT VOID aggregate when finishedStatus is real FT even with thin events', async () => {
      setTemplate('Q033');
      const q = buildQ('Q033', [
        { id: 'a', name: '0-1' }, { id: 'b', name: '2' }, { id: 'c', name: '3' }, { id: 'd', name: '4+' },
      ]);
      prisma.question.findMany.mockResolvedValue([q]);
      // Final score 2-1 = 3 goals. Events list has all 3.
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 20 } },
        { type: 'Goal', time: { elapsed: 50 } },
        { type: 'Goal', time: { elapsed: 70 } },
      ]);

      await service.onFullTime(fixtureId, teams, { home: 2, away: 1 }, undefined, 'FT');

      expect(scoringService.scoreQuestion).toHaveBeenCalled();
      expect(scoringService.voidQuestion).not.toHaveBeenCalled();
    });
  });

  // ═══ Layer 3: per-template VOID for unsafe defaults ═══

  describe('onFullTime — Layer 3 per-template defaults', () => {
    const tplId = (code: string) => `tpl-${code.toLowerCase()}`;

    function buildQ(code: string, options: any[]) {
      return { id: `q-${code.toLowerCase()}`, fixtureId, templateId: tplId(code), status: 'OPEN', options };
    }
    function setTemplate(code: string) {
      prisma.questionTemplate = { findMany: jest.fn().mockResolvedValue([{ id: tplId(code), code }]) } as any;
    }

    beforeEach(() => {
      prisma.question.updateMany.mockResolvedValue({ count: 1 });
    });

    // Q033 — event-count mismatch with final score → VOID
    it('Q033: VOIDs when goal-event count is less than final score sum (incomplete cache)', async () => {
      setTemplate('Q033');
      const q = buildQ('Q033', [
        { id: 'a', name: '0-1' }, { id: 'b', name: '2' }, { id: 'c', name: '3' }, { id: 'd', name: '4+' },
      ]);
      prisma.question.findMany.mockResolvedValue([q]);
      // Final score says 4 goals but events array only has 1 → cache lost 3 goals → VOID
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 95 } }, // event past min 80 so L2 doesn't gate
      ]);

      await service.onFullTime(fixtureId, teams, { home: 3, away: 1 }, undefined, 'FT');

      expect(scoringService.voidQuestion).toHaveBeenCalledWith(q.id);
      expect(scoringService.scoreQuestion).not.toHaveBeenCalled();
    });

    // Q034 — goal events undercount the score → VOID
    it('Q034: VOIDs when total goal events undercount the final score', async () => {
      setTemplate('Q034');
      const q = buildQ('Q034', [{ id: 'a', name: 'Yes' }, { id: 'b', name: 'No' }]);
      prisma.question.findMany.mockResolvedValue([q]);
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 95 } }, // pass L2 but undercounts score
      ]);

      await service.onFullTime(fixtureId, teams, { home: 2, away: 2 }, undefined, 'FT');

      expect(scoringService.voidQuestion).toHaveBeenCalledWith(q.id);
    });

    // Q010 — VOID when no red event AND match incomplete
    it('Q010: VOIDs when no red card found and match did not seem complete', async () => {
      setTemplate('Q010');
      const q = buildQ('Q010', [
        { id: 'home', name: 'Arsenal' }, { id: 'away', name: 'Chelsea' }, { id: 'no', name: 'No red card' },
      ]);
      prisma.question.findMany.mockResolvedValue([q]);
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 30 } }, // no red, no late events
      ]);

      await service.onFullTime(fixtureId, teams, score, undefined, undefined);

      expect(scoringService.voidQuestion).toHaveBeenCalledWith(q.id);
    });

    it('Q010: resolves "No red" when match really finished and no red event', async () => {
      setTemplate('Q010');
      const q = buildQ('Q010', [
        { id: 'home', name: 'Arsenal' }, { id: 'away', name: 'Chelsea' }, { id: 'no', name: 'No red card' },
      ]);
      prisma.question.findMany.mockResolvedValue([q]);
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 30 } },
      ]);

      await service.onFullTime(fixtureId, teams, score, undefined, 'FT');

      expect(scoringService.scoreQuestion).toHaveBeenCalledWith(q.id, 'no');
    });

    // Q020 — VOID instead of "no penalty" when match incomplete
    it('Q020: VOIDs the no-event fall-through when match did not seem complete', async () => {
      setTemplate('Q020');
      const q = buildQ('Q020', [
        { id: 'home', name: 'Arsenal' }, { id: 'away', name: 'Chelsea' }, { id: 'no', name: 'No penalty' },
      ]);
      prisma.question.findMany.mockResolvedValue([q]);
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 30 } }, // no penalty event, no late events
      ]);

      await service.onFullTime(fixtureId, teams, score, undefined, undefined);

      expect(scoringService.voidQuestion).toHaveBeenCalledWith(q.id);
    });

    // Q027 — VOID when events never reached stoppage time AND not real FT
    it('Q027: VOIDs when no events past minute 90 and not real FT', async () => {
      setTemplate('Q027');
      const q = buildQ('Q027', [{ id: 'yes', name: 'Yes' }, { id: 'no', name: 'No' }]);
      prisma.question.findMany.mockResolvedValue([q]);
      apiFootball.getFixtureEvents.mockResolvedValue([
        { type: 'Goal', time: { elapsed: 50 } },
      ]);

      await service.onFullTime(fixtureId, teams, score, undefined, undefined);

      expect(scoringService.voidQuestion).toHaveBeenCalledWith(q.id);
    });

    // Q019 / Q042 — VAR templates VOID at FT (no verdict event came through)
    it.each(['Q019', 'Q042'])('%s: VOIDs at FT (no verdict event)', async (code) => {
      setTemplate(code);
      const q = buildQ(code, [{ id: 'a', name: 'Yes' }, { id: 'b', name: 'No' }]);
      prisma.question.findMany.mockResolvedValue([q]);
      apiFootball.getFixtureEvents.mockResolvedValue([]);

      await service.onFullTime(fixtureId, teams, score, undefined, 'FT');

      expect(scoringService.voidQuestion).toHaveBeenCalledWith(q.id);
      expect(scoringService.scoreQuestion).not.toHaveBeenCalled();
    });
  });
});
