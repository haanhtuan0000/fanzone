import { Test, TestingModule } from '@nestjs/testing';
import { QuestionGeneratorService } from './question-generator.service';
import { QuestionsService } from './questions.service';
import { MatchScenarioEngine } from './scenario/match-scenario.engine';

describe('QuestionGeneratorService', () => {
  let service: QuestionGeneratorService;

  const mockQuestionsService = {
    openQuestion: jest.fn(),
  };

  const mockScenarioEngine = {
    onMatchEvent: jest.fn(),
    onPhaseChange: jest.fn(),
    determinePhase: jest.fn(),
    cleanup: jest.fn(),
    markPhaseGenerated: jest.fn(),
  };

  const teams = { home: 'Vietnam', away: 'Thailand' };
  const fixtureId = 100;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionGeneratorService,
        { provide: QuestionsService, useValue: mockQuestionsService },
        { provide: MatchScenarioEngine, useValue: mockScenarioEngine },
      ],
    }).compile();

    service = module.get<QuestionGeneratorService>(QuestionGeneratorService);
  });

  describe('generateFromEvent', () => {
    it('should delegate to MatchScenarioEngine.onMatchEvent', async () => {
      const event = { type: 'Goal', player: { name: 'Nguyen' }, time: { elapsed: 45 } };
      const mockQuestion = { id: 'q-1', text: 'Test question' };
      mockScenarioEngine.onMatchEvent.mockResolvedValue(mockQuestion);

      const result = await service.generateFromEvent(fixtureId, event, teams);

      expect(mockScenarioEngine.onMatchEvent).toHaveBeenCalledWith(
        fixtureId,
        event,
        teams,
        undefined,
      );
      expect(result).toEqual(mockQuestion);
    });

    it('should pass score to the engine when provided', async () => {
      const event = { type: 'Goal' };
      const score = { home: 1, away: 0 };
      mockScenarioEngine.onMatchEvent.mockResolvedValue(null);

      await service.generateFromEvent(fixtureId, event, teams, score);

      expect(mockScenarioEngine.onMatchEvent).toHaveBeenCalledWith(
        fixtureId,
        event,
        teams,
        score,
      );
    });

    it('should return null when engine returns null (cooldown or no template)', async () => {
      const event = { type: 'unknown_event' };
      mockScenarioEngine.onMatchEvent.mockResolvedValue(null);

      const result = await service.generateFromEvent(fixtureId, event, teams);

      expect(result).toBeNull();
    });
  });

  describe('generateForPhase', () => {
    it('should determine phase and delegate to engine.onPhaseChange', async () => {
      mockScenarioEngine.determinePhase.mockReturnValue('MID_H1');
      mockScenarioEngine.onPhaseChange.mockResolvedValue([{ id: 'q-1' }]);

      const result = await service.generateForPhase(fixtureId, 25, teams);

      expect(mockScenarioEngine.determinePhase).toHaveBeenCalledWith(25, undefined);
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(
        fixtureId,
        'MID_H1',
        teams,
        25,
        undefined,
      );
      expect(result).toEqual([{ id: 'q-1' }]);
    });

    it('should pass score and period info', async () => {
      const score = { home: 2, away: 1 };
      mockScenarioEngine.determinePhase.mockReturnValue('HALF_TIME');
      mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

      await service.generateForPhase(fixtureId, 45, teams, score, 'HT');

      expect(mockScenarioEngine.determinePhase).toHaveBeenCalledWith(45, 'HT');
    });
  });

  describe('generateCatchUp', () => {
    // Background for these tests:
    // Production data on fixture 1532900 (Bangkok United vs Gamba Osaka)
    // showed catch-up firing EVERY past phase back-to-back when a match was
    // discovered late, creating 12 questions in 13 wall-clock minutes. With
    // 30-60s template answer windows, each question closed within a minute
    // of being born — `predictionCount=0` across the board. The invariants
    // below encode the rule that matters: catch-up is allowed to produce
    // questions ONLY for the phase whose answer window is still live.

    describe('R4: catch-up generates ONLY the current phase', () => {
      it('discovery at minute 65 (MID_H2) generates MID_H2 and no earlier phase', async () => {
        mockScenarioEngine.determinePhase.mockReturnValue('MID_H2');
        mockScenarioEngine.onPhaseChange.mockResolvedValue([{ id: 'q-1' }]);

        await service.generateCatchUp(fixtureId, 65, teams, { home: 1, away: 0 }, '2H');

        // Exactly one onPhaseChange call, and it's for the current phase.
        expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledTimes(1);
        expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(
          fixtureId, 'MID_H2', teams, 65, { home: 1, away: 0 },
        );
      });

      it('discovery at minute 80 (LATE_H2) generates LATE_H2 only', async () => {
        mockScenarioEngine.determinePhase.mockReturnValue('LATE_H2');
        mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

        await service.generateCatchUp(fixtureId, 80, teams);

        expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledTimes(1);
        expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(
          fixtureId, 'LATE_H2', teams, 80, undefined,
        );
      });

      it('discovery at minute 5 (EARLY_H1) still generates EARLY_H1 — the current phase IS the first', async () => {
        // Guard against the opposite regression: my fix only suppresses
        // STRICTLY EARLIER phases, not the current one.
        mockScenarioEngine.determinePhase.mockReturnValue('EARLY_H1');
        mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

        await service.generateCatchUp(fixtureId, 5, teams);

        expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledTimes(1);
        expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(
          fixtureId, 'EARLY_H1', teams, 5, undefined,
        );
      });

      it('PRE_MATCH is never called retroactively when discovery happens after kickoff', async () => {
        mockScenarioEngine.determinePhase.mockReturnValue('MID_H1');
        mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

        await service.generateCatchUp(fixtureId, 25, teams);

        expect(mockScenarioEngine.onPhaseChange).not.toHaveBeenCalledWith(
          fixtureId, 'PRE_MATCH', expect.anything(), expect.anything(), expect.anything(),
        );
      });
    });

    describe('R5: skipped past phases are sealed so no later tick re-fires them', () => {
      it('catch-up at MID_H2 marks EARLY_H1..EARLY_H2 as already-generated', async () => {
        // Without this, a later poll (or a server-wake after Render sleeps)
        // would see those phases un-generated and belatedly try to create
        // their questions — reproducing the exact "same template at +17min"
        // pattern visible in pre-fix production data.
        mockScenarioEngine.determinePhase.mockReturnValue('MID_H2');
        mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

        await service.generateCatchUp(fixtureId, 65, teams, undefined, '2H');

        const sealed = mockScenarioEngine.markPhaseGenerated.mock.calls.map(
          (c) => c[1],
        );
        expect(sealed).toEqual([
          'EARLY_H1', 'MID_H1', 'LATE_H1', 'HALF_TIME', 'EARLY_H2',
        ]);
        // Sanity: the current phase is NOT sealed by us — `onPhaseChange`
        // handles that internally (seal + generate), and the FUTURE phase
        // LATE_H2 must stay unsealed so it can generate when its time comes.
        expect(sealed).not.toContain('MID_H2');
        expect(sealed).not.toContain('LATE_H2');
      });

      it('at minute 5 (EARLY_H1) nothing is sealed — there are no past phases to skip', async () => {
        mockScenarioEngine.determinePhase.mockReturnValue('EARLY_H1');
        mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

        await service.generateCatchUp(fixtureId, 5, teams);

        expect(mockScenarioEngine.markPhaseGenerated).not.toHaveBeenCalled();
      });
    });

    it('generates only PRE_MATCH when match has not started', async () => {
      // PRE_MATCH path: nothing to seal, nothing before it.
      mockScenarioEngine.determinePhase.mockReturnValue('PRE_MATCH');
      mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

      await service.generateCatchUp(fixtureId, 0, teams);

      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledTimes(1);
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(
        fixtureId, 'PRE_MATCH', teams, 0, undefined,
      );
      expect(mockScenarioEngine.markPhaseGenerated).not.toHaveBeenCalled();
    });
  });

  describe('cleanupFixture', () => {
    it('should delegate to engine.cleanup', async () => {
      mockScenarioEngine.cleanup.mockResolvedValue(undefined);

      await service.cleanupFixture(fixtureId);

      expect(mockScenarioEngine.cleanup).toHaveBeenCalledWith(fixtureId);
    });
  });

  describe('openQuestion', () => {
    it('should delegate to questionsService.openQuestion', async () => {
      const mockQuestion = { id: 'q-1', status: 'OPEN' };
      mockQuestionsService.openQuestion.mockResolvedValue(mockQuestion);

      const result = await service.openQuestion('q-1');

      expect(mockQuestionsService.openQuestion).toHaveBeenCalledWith('q-1');
      expect(result).toEqual(mockQuestion);
    });
  });
});
