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
    questionsService = {
      hasOpenQuestion: jest.fn().mockResolvedValue(false),
      hasPendingQuestion: jest.fn().mockResolvedValue(false),
      createQuestion: jest.fn().mockResolvedValue(createMockQuestion()),
      openQuestion: jest.fn().mockResolvedValue(createMockQuestion({ status: 'OPEN' })),
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

    it('skips if Redis says phase already generated (double-generation guard)', async () => {
      redis.get.mockResolvedValue('EARLY_H1');

      const result = await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      expect(result).toEqual([]);
      expect(questionsService.createQuestion).not.toHaveBeenCalled();
    });

    it('sets Redis key after generation to prevent duplicates', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);

      await engine.onPhaseChange(fixtureId, 'MID_H1', teams, 20, score);

      expect(redis.set).toHaveBeenCalledWith(
        `phase:${fixtureId}:last-generated`, 'MID_H1', 14400,
      );
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

    it('returns empty when no templates available', async () => {
      templateService.selectForPhaseWithCategories.mockResolvedValue([]);
      templateService.selectForPhase.mockResolvedValue([]);

      const result = await engine.onPhaseChange(fixtureId, 'LATE_H2', teams, 80, score);

      expect(result).toEqual([]);
    });

    it('records used template in Redis sliding window', async () => {
      const tpl = createMockTemplate({ id: 'tpl-abc' });
      templateService.selectForPhaseWithCategories.mockResolvedValue([tpl]);

      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      // Should record template ID in Redis window via set (JSON.stringify)
      const setCalls = redis.set.mock.calls;
      const windowCall = setCalls.find((c: any[]) => c[0].includes('window:fixture'));
      expect(windowCall).toBeTruthy();
      expect(windowCall[1]).toContain('tpl-abc');
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
  });

  // ═══ cleanup ═══

  describe('cleanup', () => {
    it('clears in-memory state and Redis keys', async () => {
      redis.get.mockResolvedValue(null);
      redis.lrange.mockResolvedValue([]);
      templateService.selectForPhaseWithCategories.mockResolvedValue([createMockTemplate()]);
      await engine.onPhaseChange(fixtureId, 'EARLY_H1', teams, 5, score);

      await engine.cleanup(fixtureId);

      expect(redis.del).toHaveBeenCalledWith(expect.stringContaining(`${fixtureId}`));
      expect(redis.del).toHaveBeenCalledWith(`phase:${fixtureId}:last-generated`);
    });
  });
});
