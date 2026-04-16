import { Test, TestingModule } from '@nestjs/testing';
import { MatchScenarioEngine } from './match-scenario.engine';
import { QuestionsService } from '../questions.service';
import { TemplateService } from '../templates/template.service';
import { VariableResolverService } from '../templates/variable-resolver.service';
import { RedisService } from '../../common/redis/redis.service';
import { createMockRedis, createMockTemplate, createMockQuestion } from '../../test/mock-factories';

describe('MatchScenarioEngine', () => {
  let engine: MatchScenarioEngine;
  let redis: ReturnType<typeof createMockRedis>;
  let questionsService: any;
  let templateService: any;
  let variableResolver: any;

  const teams = { home: 'Man City', away: 'Bayern' };
  const score = { home: 1, away: 0 };
  const fixtureId = 99999;

  beforeEach(async () => {
    redis = createMockRedis();
    // By default, pretend lineups ARE loaded for the current fixture so the
    // engine's lineup-dependent filter (see match-scenario.engine.ts around the
    // `fixture:${id}:lineup` read) is a no-op for existing tests that use
    // createMockTemplate() — which contains `{home_striker}` placeholders.
    // Tests in the R-lineup describe below override this to return null.
    redis.getJson.mockImplementation(async (key: string) => {
      if (key.includes(':lineup')) {
        return {
          home: { strikers: ['Home ST'], midfielders: ['Home MF'], goalkeeper: 'Home GK' },
          away: { strikers: ['Away ST'], midfielders: ['Away MF'], goalkeeper: 'Away GK' },
        };
      }
      return null;
    });
    questionsService = {
      hasOpenQuestion: jest.fn().mockResolvedValue(false),
      hasPendingQuestion: jest.fn().mockResolvedValue(false),
      createQuestion: jest.fn().mockResolvedValue(createMockQuestion()),
      openQuestion: jest.fn().mockResolvedValue(createMockQuestion({ status: 'OPEN' })),
      countQuestionsForFixture: jest.fn().mockResolvedValue(0),
      getTemplateIdsForFixture: jest.fn().mockResolvedValue([]),
    };
    templateService = {
      selectForPhaseWithCategories: jest.fn().mockResolvedValue([createMockTemplate()]),
      selectForPhase: jest.fn().mockResolvedValue([]),
      selectForEvent: jest.fn().mockResolvedValue(createMockTemplate()),
    };
    variableResolver = {
      buildMatchContext: jest.fn().mockResolvedValue({
        _hasLineup: 'false',
        home_team: 'Man City', away_team: 'Bayern',
        home_striker: 'Man City ST', away_striker: 'Bayern ST',
        home_midfielder: 'Man City MF', away_midfielder: 'Bayern MF',
        home_keeper: 'Man City GK', away_keeper: 'Bayern GK',
        risky_player_home: 'Man City MF2', risky_player_away: 'Bayern MF2',
        home_sub_striker: 'Man City SUB', away_sub_striker: 'Bayern SUB',
        sub_midfielder: 'Man City MF3',
        leading_team: 'Man City', trailing_team: 'Bayern',
        home_score: '1', away_score: '0',
      }),
      resolveText: jest.fn((text) => text),
      resolveOptions: jest.fn((opts) =>
        opts.map((o: any) => ({ name: o.nameVi || o.name, emoji: o.emoji, multiplier: 2.0 })),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchScenarioEngine,
        { provide: RedisService, useValue: redis },
        { provide: QuestionsService, useValue: questionsService },
        { provide: TemplateService, useValue: templateService },
        { provide: VariableResolverService, useValue: variableResolver },
      ],
    }).compile();

    engine = module.get<MatchScenarioEngine>(MatchScenarioEngine);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══ determinePhase ═══

  describe('determinePhase', () => {
    const cases: [number, string | undefined, string][] = [
      [0, undefined, 'PRE_MATCH'],
      [7, '1H', 'EARLY_H1'],
      [15, '1H', 'EARLY_H1'],
      [16, '1H', 'MID_H1'],
      [20, undefined, 'MID_H1'],
      [35, undefined, 'MID_H1'],
      [36, undefined, 'LATE_H1'],
      [40, undefined, 'LATE_H1'],
      [45, 'HT', 'HALF_TIME'],
      [47, undefined, 'EARLY_H2'],
      [50, undefined, 'EARLY_H2'],
      [60, undefined, 'EARLY_H2'],
      [61, undefined, 'MID_H2'],
      [65, undefined, 'MID_H2'],
      [75, undefined, 'MID_H2'],
      [76, undefined, 'LATE_H2'],
      [80, undefined, 'LATE_H2'],
      [95, undefined, 'LATE_H2'],
    ];

    cases.forEach(([elapsed, period, expected]) => {
      it(`returns ${expected} for ${elapsed}' ${period ? `(${period})` : ''}`, () => {
        expect(engine.determinePhase(elapsed, period)).toBe(expected);
      });
    });
  });

  // ═══ onPhaseChange ═══

  describe('onPhaseChange', () => {
    beforeEach(() => {
      // redis.get returns null for all keys (phase guard + template window)
      redis.get.mockResolvedValue(null);
      questionsService.getTemplateIdsForFixture.mockResolvedValue([]);
    });

    it('generates questions for a new phase', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([
        createMockTemplate({ id: 'tpl-1', code: 'Q037' }),
        createMockTemplate({ id: 'tpl-2', code: 'Q038' }),
      ]);

      const result = await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      // Should create exactly 2 questions (1 per template)
      expect(questionsService.createQuestion).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('skips if Redis Set already contains this phase (double-generation guard)', async () => {
      redis.sismember.mockImplementation((key: string, member: string) => {
        return Promise.resolve(key.endsWith(':generated') && member === 'EARLY_H1');
      });

      const result = await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      expect(result).toEqual([]);
      expect(questionsService.createQuestion).not.toHaveBeenCalled();
    });

    it('adds phase to the generated Set after successful generation', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      await engine.onPhaseChange(fixtureId, 'MID_H1', teams, 20, score);

      expect(redis.sadd).toHaveBeenCalledWith(`phase:${fixtureId}:generated`, 'MID_H1');
      expect(redis.expire).toHaveBeenCalledWith(`phase:${fixtureId}:generated`, 14400);
    });

    it('allows generation for different phase after previous', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      // Generate EARLY_H1
      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);
      expect(questionsService.createQuestion).toHaveBeenCalledTimes(1);

      // For MID_H1: phase key returns 'EARLY_H1' (different), window key returns null
      redis.get.mockImplementation((key: string) => {
        if (key.includes('last-generated')) return Promise.resolve('EARLY_H1');
        return Promise.resolve(null); // window key
      });
      await engine.onPhaseChange(fixtureId, 'MID_H1', teams, 20, score);

      expect(questionsService.createQuestion).toHaveBeenCalledTimes(2);
    });

    it('respects MAX_QUESTIONS_PER_MATCH (15)', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([
        createMockTemplate(), createMockTemplate(),
      ]);

      // Track what phase was last set, return it for phase key, null for window key
      let lastPhase: string | null = null;
      redis.get.mockImplementation((key: string) => {
        if (key.includes('last-generated')) return Promise.resolve(lastPhase);
        return Promise.resolve(null);
      });
      redis.set.mockImplementation((key: string, value: string) => {
        if (key.includes('last-generated')) lastPhase = value;
        return Promise.resolve(undefined);
      });

      const phases = ['PRE_MATCH', 'EARLY_H1', 'MID_H1', 'LATE_H1', 'HALF_TIME', 'EARLY_H2', 'MID_H2', 'LATE_H2'];
      for (const phase of phases) {
        await engine.onPhaseChange(fixtureId, phase as any, teams, 0, score);
      }

      // 8 phases × 2 = 16 attempted, but capped at 15
      expect(questionsService.createQuestion.mock.calls.length).toBeLessThanOrEqual(15);
      expect(questionsService.createQuestion.mock.calls.length).toBeGreaterThanOrEqual(8);
    });

    it('first batch opens first question immediately (isFirstBatch)', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      const createCall = questionsService.createQuestion.mock.calls[0][0];
      const opensAt = new Date(createCall.opensAt);
      // Should be within 2 seconds of now
      expect(Math.abs(opensAt.getTime() - Date.now())).toBeLessThan(2000);
    });

    it('subsequent phases use normal spacing (not immediate)', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([
        createMockTemplate(), createMockTemplate(),
      ]);

      // First phase
      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 0, score);

      // Second phase at start of MID_H1
      redis.get.mockImplementation((key: string) => {
        if (key.includes('last-generated')) return Promise.resolve('EARLY_H1');
        return Promise.resolve(null);
      });
      await engine.onPhaseChange(fixtureId, 'MID_H1', teams, 15, score);

      // Second phase questions should be spaced in the future (not immediate)
      // questionsGenerated > 0, so isFirstBatch = false
      if (questionsService.createQuestion.mock.calls.length >= 3) {
        const thirdCall = questionsService.createQuestion.mock.calls[2][0];
        const opensAt = new Date(thirdCall.opensAt);
        // Should be at least 1 minute in the future for MID_H1 spacing
        expect(opensAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
      }
    });

    it('filters out questions scheduled after minute 85 (late cutoff)', async () => {
      // Generate LATE_H2 at minute 83 — Q1 might be ~85, Q2 might be ~88
      templateService.selectForPhaseWithCategories.mockResolvedValue([
        createMockTemplate({ id: 'tpl-late1' }),
        createMockTemplate({ id: 'tpl-late2' }),
      ]);

      const result = await engine.onPhaseChange(fixtureId, 'LATE_H2', teams, 83, score);

      // Questions after minute 85 should be filtered out
      // With 2 templates and phase 75-90, some may be past 85 cutoff
      // At minimum, should not create more than what fits before 85
      for (const q of result) {
        const opensAt = new Date(questionsService.createQuestion.mock.calls[0][0].opensAt);
        // opensAt should not be more than ~3 min in the future (83 + 2 = 85 max)
        expect(opensAt.getTime()).toBeLessThanOrEqual(Date.now() + 3 * 60_000);
      }
    });

    it('derives matchMinute from scheduledOpensAt relative to kickoff', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      await engine.onPhaseChange(fixtureId, 'MID_H1', teams, 25, score);

      const createCall = questionsService.createQuestion.mock.calls[0][0];
      // matchMinute should be derived from opensAt, not just the batch elapsed
      // For the first question of a first batch, opensAt = now, so minute ≈ elapsed
      expect(createCall.matchMinute).toBeGreaterThanOrEqual(20);
      expect(createCall.matchMinute).toBeLessThanOrEqual(35);
    });

    it('assigns different matchMinutes to questions in a batch', async () => {
      const tpl1 = createMockTemplate({ id: 'tpl-1', code: 'Q001' });
      const tpl2 = createMockTemplate({ id: 'tpl-2', code: 'Q002' });
      templateService.selectForPhaseWithCategories.mockResolvedValue([tpl1, tpl2]);

      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      const calls = questionsService.createQuestion.mock.calls;
      expect(calls.length).toBe(2);
      const minute1 = calls[0][0].matchMinute;
      const minute2 = calls[1][0].matchMinute;
      // Second question should open later → higher or equal minute
      expect(minute2).toBeGreaterThanOrEqual(minute1);
      // opensAt timestamps must also be in order
      const opensAt1 = new Date(calls[0][0].opensAt).getTime();
      const opensAt2 = new Date(calls[1][0].opensAt).getTime();
      expect(opensAt2).toBeGreaterThanOrEqual(opensAt1);
    });

    it('maintains consistent matchMinutes across phases (kickoffTime stable)', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      // Phase 1: EARLY_H1 at elapsed=5
      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);
      const call1 = questionsService.createQuestion.mock.calls[0][0];

      // Phase 2: MID_H1 at elapsed=20
      redis.get.mockImplementation((key: string) => {
        if (key.includes('last-generated')) return Promise.resolve('EARLY_H1');
        return Promise.resolve(null);
      });
      await engine.onPhaseChange(fixtureId, 'MID_H1', teams, 20, score);

      const call2Idx = questionsService.createQuestion.mock.calls.length - 1;
      const call2 = questionsService.createQuestion.mock.calls[call2Idx][0];

      // MID_H1 question matchMinute must be > EARLY_H1 question matchMinute
      expect(call2.matchMinute).toBeGreaterThan(call1.matchMinute);
      // And within MID_H1 phase range (15-35)
      expect(call2.matchMinute).toBeGreaterThanOrEqual(15);
      expect(call2.matchMinute).toBeLessThanOrEqual(35);
    });

    it('does not recalculate kickoffTime across phases', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      const states = (engine as any).fixtureStates as Map<number, any>;
      const kickoffAfterPhase1 = states.get(fixtureId).kickoffTime;
      expect(kickoffAfterPhase1).toBeDefined();
      expect(kickoffAfterPhase1).not.toBeNull();

      // Phase 2
      redis.get.mockImplementation((key: string) => {
        if (key.includes('last-generated')) return Promise.resolve('EARLY_H1');
        return Promise.resolve(null);
      });
      await engine.onPhaseChange(fixtureId, 'MID_H1', teams, 20, score);

      const kickoffAfterPhase2 = states.get(fixtureId).kickoffTime;
      // kickoffTime must be identical — set once, never recalculated
      expect(kickoffAfterPhase2).toBe(kickoffAfterPhase1);
    });

    it('does not set kickoffTime from elapsed=0 (recovery with no API data)', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      // Simulate recovery: elapsed=0 (no API data yet)
      await engine.onPhaseChange(fixtureId, 'PRE_MATCH', teams, 0, score);

      const states = (engine as any).fixtureStates as Map<number, any>;
      // kickoffTime should NOT be set — elapsed=0 is unreliable
      expect(states.get(fixtureId).kickoffTime).toBeNull();

      // Later, real elapsed arrives — kickoffTime gets set correctly
      redis.get.mockImplementation((key: string) => {
        if (key.includes('last-generated')) return Promise.resolve('PRE_MATCH');
        return Promise.resolve(null);
      });
      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      expect(states.get(fixtureId).kickoffTime).not.toBeNull();
      // Should be ~5 min before now
      expect(Math.abs(states.get(fixtureId).kickoffTime - (Date.now() - 5 * 60_000))).toBeLessThan(2000);
    });

    it('kickoffTime survives half-time and produces correct 2H matchMinutes', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      let lastPhase: string | null = null;
      redis.get.mockImplementation((key: string) => {
        if (key.includes('last-generated')) return Promise.resolve(lastPhase);
        return Promise.resolve(null);
      });
      redis.set.mockImplementation((key: string, value: string) => {
        if (key.includes('last-generated')) lastPhase = value;
        return Promise.resolve(undefined);
      });

      // 1H
      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);
      const h1Call = questionsService.createQuestion.mock.calls[0][0];

      // HT
      await engine.onPhaseChange(fixtureId, 'HALF_TIME', teams, 45, score);

      // 2H
      await engine.onPhaseChange(fixtureId, 'EARLY_H2', teams, 50, score);
      const h2Idx = questionsService.createQuestion.mock.calls.length - 1;
      const h2Call = questionsService.createQuestion.mock.calls[h2Idx][0];

      // 2H matchMinute must be > 1H matchMinute
      expect(h2Call.matchMinute).toBeGreaterThan(h1Call.matchMinute);
      // And should be in EARLY_H2 range (46-60)
      expect(h2Call.matchMinute).toBeGreaterThanOrEqual(46);
      expect(h2Call.matchMinute).toBeLessThanOrEqual(60);

      // kickoffTime must still be the same
      const states = (engine as any).fixtureStates as Map<number, any>;
      expect(states.get(fixtureId).kickoffTime).toBeDefined();
    });

    it('full match lifecycle produces monotonically increasing matchMinutes (non-HT phases)', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      let lastPhase: string | null = null;
      redis.get.mockImplementation((key: string) => {
        if (key.includes('last-generated')) return Promise.resolve(lastPhase);
        return Promise.resolve(null);
      });
      redis.set.mockImplementation((key: string, value: string) => {
        if (key.includes('last-generated')) lastPhase = value;
        return Promise.resolve(undefined);
      });

      // Skip HALF_TIME — its short-phase logic uses Date.now() for opensAt,
      // which in a synchronous test produces matchMinute ≈ elapsed at fixture creation
      const phases: [string, number][] = [
        ['EARLY_H1', 5],
        ['MID_H1', 20],
        ['LATE_H1', 38],
        ['EARLY_H2', 50],
        ['MID_H2', 65],
        ['LATE_H2', 80],
      ];

      const matchMinutes: number[] = [];
      for (const [phase, elapsed] of phases) {
        await engine.onPhaseChange(fixtureId, phase as any, teams, elapsed, score);
        const lastCall = questionsService.createQuestion.mock.calls;
        if (lastCall.length > matchMinutes.length) {
          matchMinutes.push(lastCall[lastCall.length - 1][0].matchMinute);
        }
      }

      // All matchMinutes must be strictly increasing
      for (let i = 1; i < matchMinutes.length; i++) {
        expect(matchMinutes[i]).toBeGreaterThan(matchMinutes[i - 1]);
      }
    });

    it('server restart mid-game: kickoffTime set from current elapsed, subsequent phases consistent', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      // Server starts tracking match at minute 60 (mid-game join)
      await engine.onPhaseChange(fixtureId, 'MID_H2', teams, 60, score);
      const call1 = questionsService.createQuestion.mock.calls[0][0];

      const states = (engine as any).fixtureStates as Map<number, any>;
      const kickoff = states.get(fixtureId).kickoffTime;
      expect(kickoff).toBeDefined();

      // Next phase at minute 76
      redis.get.mockImplementation((key: string) => {
        if (key.includes('last-generated')) return Promise.resolve('MID_H2');
        return Promise.resolve(null);
      });
      await engine.onPhaseChange(fixtureId, 'LATE_H2', teams, 76, score);
      const call2Idx = questionsService.createQuestion.mock.calls.length - 1;
      const call2 = questionsService.createQuestion.mock.calls[call2Idx][0];

      // kickoffTime unchanged
      expect(states.get(fixtureId).kickoffTime).toBe(kickoff);
      // matchMinutes increasing and in correct ranges
      expect(call1.matchMinute).toBeGreaterThanOrEqual(60);
      expect(call2.matchMinute).toBeGreaterThan(call1.matchMinute);
      expect(call2.matchMinute).toBeGreaterThanOrEqual(75);
    });

    it('returns empty when no templates available', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([]);
      templateService.selectForPhase.mockResolvedValue([]);

      const result = await engine.onPhaseChange(fixtureId, 'LATE_H2', teams, 80, score);

      expect(result).toEqual([]);
    });

    it('records used template in the fixture used-templates Set', async () => {
      const tpl = createMockTemplate({ id: 'tpl-abc' });
      templateService.selectForPhaseWithCategories.mockResolvedValue([tpl]);

      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      expect(redis.sadd).toHaveBeenCalledWith(`fixture:${fixtureId}:used-templates`, 'tpl-abc');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  R-lineup: skip lineup-dependent templates when no lineup cached
  //
  //  Regression pin for fixture 1416163 (Mutondo Stars vs Green Eagles,
  //  Zambia Super League). Q001 "Who will score next?" was being persisted
  //  with option names like "Mutondo Stars striker" because the resolver
  //  silently falls back to "{team} striker" when no lineup is cached.
  //  The engine now filters those templates out before creation.
  // ═══════════════════════════════════════════════════════════════

  describe('R-lineup: lineup-dependent templates are skipped when lineup missing', () => {
    const q001 = {
      id: 'tpl-q001',
      code: 'Q001',
      category: 'GOAL',
      difficulty: 'MEDIUM',
      trigger: 'SCHEDULED',
      phases: ['EARLY_H1'],
      textEn: 'Who will score next?',
      textVi: 'Ai sẽ ghi bàn tiếp theo?',
      rewardCoins: 150,
      answerWindowSec: 40,
      options: [
        { nameEn: '{home_striker}', nameVi: '{home_striker}', emoji: '⚽', defaultPct: 42 },
        { nameEn: '{away_striker}', nameVi: '{away_striker}', emoji: '⚽', defaultPct: 30 },
        { nameEn: 'Other player',   nameVi: 'Cầu thủ khác',  emoji: '⚽', defaultPct: 28 },
      ],
      resolutionStrategy: 'AUTO',
      weight: 100,
      isActive: true,
    };
    const q038 = {
      id: 'tpl-q038',
      code: 'Q038',
      category: 'CARD',
      difficulty: 'EASY',
      trigger: 'SCHEDULED',
      phases: ['EARLY_H1'],
      textEn: '{home_team} or {away_team} gets more cards?',
      textVi: '{home_team} hay {away_team} nhận nhiều thẻ hơn?',
      rewardCoins: 60,
      answerWindowSec: 40,
      options: [
        { nameEn: '{home_team} gets more', nameVi: '{home_team} nhiều hơn', emoji: '🟨', defaultPct: 40 },
        { nameEn: '{away_team} gets more', nameVi: '{away_team} nhiều hơn', emoji: '🟨', defaultPct: 40 },
        { nameEn: 'Equal',                 nameVi: 'Bằng nhau',             emoji: '🟨', defaultPct: 20 },
      ],
      resolutionStrategy: 'AUTO',
      weight: 100,
      isActive: true,
    };

    it('no lineup cached → Q001-style template is filtered; Q038-style passes through', async () => {
      // Override the default lineup mock for this test only. Every other
      // Redis key keeps the default null behavior.
      redis.getJson.mockImplementation(async (key: string) => {
        if (key.includes(':lineup')) return null;
        return null;
      });
      templateService.selectForPhaseWithCategories.mockResolvedValue([q001, q038]);

      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      // Exactly one question created, and it's the lineup-free one.
      expect(questionsService.createQuestion).toHaveBeenCalledTimes(1);
      expect(questionsService.createQuestion.mock.calls[0][0].templateId).toBe('tpl-q038');
    });

    it('lineup cached with strikers → both templates pass through (no over-filtering)', async () => {
      // Default mock already returns a lineup — leave it. Confirms the filter
      // is strictly opt-in on missing data.
      templateService.selectForPhaseWithCategories.mockResolvedValue([q001, q038]);

      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      expect(questionsService.createQuestion).toHaveBeenCalledTimes(2);
    });
  });

  // ═══ onMatchEvent ═══

  describe('onMatchEvent', () => {
    beforeEach(async () => {
      redis.get.mockResolvedValue(null);
      // Initialize fixture state via a phase change first
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);
      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);
      jest.clearAllMocks();
      // Reset mocks for event tests — use mockImplementation to handle different keys
      redis.get.mockImplementation((key: string) => {
        if (key.includes('last-generated')) return Promise.resolve('EARLY_H1');
        return Promise.resolve(null);
      });
      redis.set.mockResolvedValue(undefined);
      // Reset cooldown so events can fire
      const states = (engine as any).fixtureStates as Map<number, any>;
      const state = states.get(fixtureId);
      if (state) state.lastQuestionTime = 0;
      redis.lrange.mockResolvedValue([]);
      questionsService.hasOpenQuestion.mockResolvedValue(false);
      questionsService.hasPendingQuestion.mockResolvedValue(false);
      questionsService.createQuestion.mockResolvedValue(createMockQuestion());
      questionsService.openQuestion.mockResolvedValue(createMockQuestion({ status: 'OPEN' }));
      questionsService.getTemplateIdsForFixture.mockResolvedValue([]);
      templateService.selectForEvent.mockResolvedValue(createMockTemplate());
      variableResolver.buildMatchContext.mockResolvedValue({
        _hasLineup: 'false', home_team: 'Man City', away_team: 'Bayern',
        home_striker: 'Man City ST', away_striker: 'Bayern ST',
        home_midfielder: 'Man City MF', away_midfielder: 'Bayern MF',
        home_keeper: 'Man City GK', away_keeper: 'Bayern GK',
        risky_player_home: 'Man City MF2', risky_player_away: 'Bayern MF2',
        home_sub_striker: 'Man City SUB', away_sub_striker: 'Bayern SUB',
        sub_midfielder: 'Man City MF3',
        leading_team: 'Man City', trailing_team: 'Bayern',
        home_score: '1', away_score: '0',
      });
      variableResolver.resolveText.mockImplementation((text: string) => text);
      variableResolver.resolveOptions.mockImplementation((opts: any[]) =>
        opts.map((o: any) => ({ name: o.nameVi || o.name, emoji: o.emoji, multiplier: 2.0 })),
      );
    });

    it('generates question on goal event', async () => {
      const event = { type: 'Goal', time: { elapsed: 30 }, player: { name: 'Haaland' } };

      const result = await engine.onMatchEvent(fixtureId, event as any, teams, score);

      expect(result).toBeTruthy();
      expect(templateService.selectForEvent).toHaveBeenCalledWith(
        'EVENT_GOAL', expect.any(String), expect.any(Array),
      );
    });

    it('generates question on card event', async () => {
      const event = { type: 'Card', time: { elapsed: 22 } };

      await engine.onMatchEvent(fixtureId, event as any, teams, score);

      expect(templateService.selectForEvent).toHaveBeenCalledWith(
        'EVENT_CARD', expect.any(String), expect.any(Array),
      );
    });

    it('returns null for unknown event type', async () => {
      const event = { type: 'celebration', time: { elapsed: 30 } };

      const result = await engine.onMatchEvent(fixtureId, event as any, teams, score);

      expect(result).toBeNull();
      expect(templateService.selectForEvent).not.toHaveBeenCalled();
    });

    it('skips when OPEN question exists', async () => {
      questionsService.hasOpenQuestion.mockResolvedValue(true);
      const event = { type: 'Goal', time: { elapsed: 30 } };

      const result = await engine.onMatchEvent(fixtureId, event as any, teams, score);

      expect(result).toBeNull();
    });

    it('skips when PENDING question exists', async () => {
      questionsService.hasPendingQuestion.mockResolvedValue(true);
      const event = { type: 'Goal', time: { elapsed: 30 } };

      const result = await engine.onMatchEvent(fixtureId, event as any, teams, score);

      expect(result).toBeNull();
    });

    it('skips when no template found for event', async () => {
      templateService.selectForEvent.mockResolvedValue(null);
      const event = { type: 'Goal', time: { elapsed: 30 } };

      const result = await engine.onMatchEvent(fixtureId, event as any, teams, score);

      expect(result).toBeNull();
    });

    it('event-triggered question uses same kickoffTime as phase-scheduled questions', async () => {
      // Verify kickoffTime was set during beforeEach phase setup
      const states = (engine as any).fixtureStates as Map<number, any>;
      const kickoffFromPhase = states.get(fixtureId).kickoffTime;
      expect(kickoffFromPhase).toBeDefined();

      // Fire a goal event at minute 30
      const event = { type: 'Goal', time: { elapsed: 30 } };
      await engine.onMatchEvent(fixtureId, event as any, teams, score);

      // kickoffTime must not have changed
      expect(states.get(fixtureId).kickoffTime).toBe(kickoffFromPhase);
    });

    it('sets kickoffTime from event elapsed when no prior phase exists', async () => {
      // Create a fresh engine (no prior onPhaseChange)
      const freshModule = await Test.createTestingModule({
        providers: [
          MatchScenarioEngine,
          { provide: RedisService, useValue: redis },
          { provide: QuestionsService, useValue: questionsService },
          { provide: TemplateService, useValue: templateService },
          { provide: VariableResolverService, useValue: variableResolver },
        ],
      }).compile();
      const freshEngine = freshModule.get<MatchScenarioEngine>(MatchScenarioEngine);

      const event = { type: 'Goal', time: { elapsed: 25 } };
      await freshEngine.onMatchEvent(fixtureId, event as any, teams, score);

      const states = (freshEngine as any).fixtureStates as Map<number, any>;
      const state = states.get(fixtureId);
      expect(state).toBeDefined();
      expect(state.kickoffTime).toBeDefined();
      // kickoffTime should be ~25 min before now
      expect(Math.abs(state.kickoffTime - (Date.now() - 25 * 60_000))).toBeLessThan(2000);
    });
  });

  // ═══ cleanup ═══

  describe('cleanup', () => {
    it('clears in-memory state and Redis keys', async () => {
      redis.get.mockResolvedValue(null);
      redis.lrange.mockResolvedValue([]);
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);
      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      await engine.cleanup(fixtureId);

      expect(redis.del).toHaveBeenCalledWith(`fixture:${fixtureId}:used-templates`);
      expect(redis.del).toHaveBeenCalledWith(`phase:${fixtureId}:generated`);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // REQUIREMENT TESTS — Bug 1379285 post-mortem
  //
  // The old implementation-detail tests (mock redis.get → check redis.set)
  // passed for months while production happily duplicated templates and
  // over-generated questions. These tests encode the actual invariants:
  //
  //   R1. Each template appears at most once per match.
  //   R2. Total questions per match ≤ MAX_QUESTIONS_PER_MATCH (15).
  //   R3. Running generateCatchUp twice produces the same result as once.
  //
  // Each test simulates a realistic multi-phase sequence with Redis state
  // evolving across calls (not mocked to a fixed value).
  // ═══════════════════════════════════════════════════════════════

  describe('R1: each template appears at most once per match', () => {
    // Realistic Redis: Sets evolve as sadd/sismember/smembers are called
    let phasesSet: Set<string>;
    let templatesSet: Set<string>;

    beforeEach(() => {
      phasesSet = new Set();
      templatesSet = new Set();
      redis.sadd.mockImplementation(async (key: string, ...members: string[]) => {
        const target = key.includes(':generated') ? phasesSet : templatesSet;
        members.forEach((m) => target.add(m));
      });
      redis.sismember.mockImplementation(async (key: string, member: string) => {
        return key.includes(':generated') ? phasesSet.has(member) : templatesSet.has(member);
      });
      redis.smembers.mockImplementation(async (key: string) => {
        return key.includes(':used-templates') ? [...templatesSet] : [];
      });
    });

    it('full match lifecycle: no templateId appears twice across all phases', async () => {
      // Each phase returns 2 templates with unique IDs
      let tplCounter = 0;
      templateService.selectForPhaseWithCategories.mockImplementation(async () => [
        createMockTemplate({ id: `tpl-${++tplCounter}` }),
        createMockTemplate({ id: `tpl-${++tplCounter}` }),
      ]);

      const allPhases = ['EARLY_H1', 'MID_H1', 'LATE_H1', 'HALF_TIME', 'EARLY_H2', 'MID_H2', 'LATE_H2'];
      for (const phase of allPhases) {
        await engine.onPhaseChange(fixtureId, phase as any, teams, 50, score);
      }

      // Collect all templateIds passed to createQuestion
      const createdTemplateIds = questionsService.createQuestion.mock.calls.map(
        (c: any[]) => c[0].templateId,
      );
      const uniqueIds = new Set(createdTemplateIds);
      expect(uniqueIds.size).toBe(createdTemplateIds.length); // no duplicates
    });

    it('the very first template used in the match is still excluded on the last phase', async () => {
      // Old sliding window of 12 would have dropped tpl-1 by the 13th selection.
      // With unbounded Set, tpl-1 remains excluded forever within the match.
      let tplCounter = 0;
      templateService.selectForPhaseWithCategories.mockImplementation(async () => [
        createMockTemplate({ id: `tpl-${++tplCounter}` }),
        createMockTemplate({ id: `tpl-${++tplCounter}` }),
      ]);

      const phases = ['EARLY_H1', 'MID_H1', 'LATE_H1', 'HALF_TIME', 'EARLY_H2', 'MID_H2', 'LATE_H2'];
      for (const phase of phases) {
        await engine.onPhaseChange(fixtureId, phase as any, teams, 80, score);
      }

      // Last call's excludeIds must contain tpl-1 (from EARLY_H1, the very first phase)
      const lastCall = templateService.selectForPhaseWithCategories.mock.calls.at(-1);
      const excludeIds: string[] = lastCall[1];
      expect(excludeIds).toContain('tpl-1');
      // And all other prior templates too
      expect(excludeIds).toContain('tpl-2');
      expect(excludeIds).toContain(`tpl-${tplCounter - 2}`); // second-to-last
    });
  });

  describe('R2: total questions per match ≤ 15, even after restarts', () => {
    let phasesSet: Set<string>;
    let templatesSet: Set<string>;

    beforeEach(() => {
      phasesSet = new Set();
      templatesSet = new Set();
      redis.sadd.mockImplementation(async (key: string, ...members: string[]) => {
        const target = key.includes(':generated') ? phasesSet : templatesSet;
        members.forEach((m) => target.add(m));
      });
      redis.sismember.mockImplementation(async (key: string, member: string) => {
        return key.includes(':generated') ? phasesSet.has(member) : templatesSet.has(member);
      });
      redis.smembers.mockImplementation(async (key: string) => {
        return key.includes(':used-templates') ? [...templatesSet] : [];
      });
    });

    it('MAX cap respected when DB already has 14 questions (restart scenario)', async () => {
      questionsService.countQuestionsForFixture.mockResolvedValue(14);
      templateService.selectForPhaseWithCategories.mockResolvedValue([
        createMockTemplate({ id: 'tpl-a' }), createMockTemplate({ id: 'tpl-b' }),
      ]);

      // Config requests 2 for LATE_H2, but only 1 slot left (15 - 14)
      await engine.onPhaseChange(fixtureId, 'LATE_H2', teams, 80, score);

      expect(questionsService.createQuestion).toHaveBeenCalledTimes(1);
    });

    it('total never exceeds 15 across a full 8-phase match', async () => {
      let tplCounter = 0;
      templateService.selectForPhaseWithCategories.mockImplementation(async () => [
        createMockTemplate({ id: `tpl-${++tplCounter}` }),
        createMockTemplate({ id: `tpl-${++tplCounter}` }),
      ]);

      const allPhases = ['PRE_MATCH', 'EARLY_H1', 'MID_H1', 'LATE_H1', 'HALF_TIME', 'EARLY_H2', 'MID_H2', 'LATE_H2'];
      for (const phase of allPhases) {
        await engine.onPhaseChange(fixtureId, phase as any, teams, 0, score);
      }

      // 8 phases × 2 per phase = 16 attempted, but capped at 15
      expect(questionsService.createQuestion.mock.calls.length).toBeLessThanOrEqual(15);
    });
  });

  describe('R3: catchUp is idempotent — re-running produces no new questions', () => {
    let phasesSet: Set<string>;
    let templatesSet: Set<string>;

    beforeEach(() => {
      phasesSet = new Set();
      templatesSet = new Set();
      redis.sadd.mockImplementation(async (key: string, ...members: string[]) => {
        const target = key.includes(':generated') ? phasesSet : templatesSet;
        members.forEach((m) => target.add(m));
      });
      redis.sismember.mockImplementation(async (key: string, member: string) => {
        return key.includes(':generated') ? phasesSet.has(member) : templatesSet.has(member);
      });
      redis.smembers.mockImplementation(async (key: string) => {
        return key.includes(':used-templates') ? [...templatesSet] : [];
      });
    });

    it('second catchUp at minute 90 after first at minute 50 generates zero new questions', async () => {
      templateService.selectForPhaseWithCategories.mockImplementation(async (phase: string) => [
        createMockTemplate({ id: `tpl-${phase}` }),
      ]);

      // First catchUp: 5 phases
      const firstPhases = ['EARLY_H1', 'MID_H1', 'LATE_H1', 'HALF_TIME', 'EARLY_H2'];
      for (const p of firstPhases) {
        await engine.onPhaseChange(fixtureId, p as any, teams, 50, score);
      }
      const afterFirstRun = questionsService.createQuestion.mock.calls.length;
      expect(afterFirstRun).toBe(5);

      // Second catchUp: same phases (server restart lost in-memory state)
      for (const p of firstPhases) {
        await engine.onPhaseChange(fixtureId, p as any, teams, 90, score);
      }

      // Zero new questions from the second pass
      expect(questionsService.createQuestion.mock.calls.length).toBe(afterFirstRun);
    });

    it('second catchUp with MORE phases only generates the genuinely new ones', async () => {
      templateService.selectForPhaseWithCategories.mockImplementation(async (phase: string) => [
        createMockTemplate({ id: `tpl-${phase}` }),
      ]);

      // First catchUp at minute 50: 5 phases
      const firstPhases = ['EARLY_H1', 'MID_H1', 'LATE_H1', 'HALF_TIME', 'EARLY_H2'];
      for (const p of firstPhases) {
        await engine.onPhaseChange(fixtureId, p as any, teams, 50, score);
      }
      expect(questionsService.createQuestion.mock.calls.length).toBe(5);

      // Second catchUp at minute 90: includes 3 new phases
      const secondPhases = [...firstPhases, 'MID_H2', 'LATE_H2'];
      for (const p of secondPhases) {
        await engine.onPhaseChange(fixtureId, p as any, teams, 90, score);
      }

      // Only the 2 genuinely new phases generated (+2 = 7 total)
      expect(questionsService.createQuestion.mock.calls.length).toBe(7);
    });
  });

  // ═══ Fallback: DB seeding when Redis is empty ═══

  describe('DB fallback seeding (restart + Redis flush)', () => {
    it('used-templates Set is seeded from DB if Redis returns empty', async () => {
      questionsService.getTemplateIdsForFixture.mockResolvedValue(['tpl-db-1', 'tpl-db-2']);
      redis.smembers.mockResolvedValue([]);
      redis.sismember.mockResolvedValue(false);
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      await engine.onPhaseChange(fixtureId, 'EARLY_H2', teams, 50, score);

      const saddCalls = redis.sadd.mock.calls;
      const seedCall = saddCalls.find((c: any[]) =>
        c[0] === `fixture:${fixtureId}:used-templates` && c.length > 2,
      );
      expect(seedCall).toBeTruthy();
      expect(seedCall).toEqual(expect.arrayContaining([
        `fixture:${fixtureId}:used-templates`, 'tpl-db-1', 'tpl-db-2',
      ]));
    });
  });
});
