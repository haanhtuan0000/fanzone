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
    // Requirement: when a match is discovered mid-game, generate questions
    // for ALL phases from EARLY_H1 through current phase. This ensures
    // users have a full pipeline of questions, not just 1-2.

    it('generates ALL phases from EARLY_H1 through current when discovered at MID_H2', async () => {
      mockScenarioEngine.determinePhase.mockReturnValue('MID_H2');
      mockScenarioEngine.onPhaseChange.mockResolvedValue([{ id: 'q-1' }]);

      await service.generateCatchUp(fixtureId, 65, teams, { home: 1, away: 0 }, '2H');

      // EARLY_H1, MID_H1, LATE_H1, HALF_TIME, EARLY_H2, MID_H2 = 6 phases
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledTimes(6);
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(fixtureId, 'EARLY_H1', teams, 65, { home: 1, away: 0 });
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(fixtureId, 'MID_H1', teams, 65, { home: 1, away: 0 });
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(fixtureId, 'LATE_H1', teams, 65, { home: 1, away: 0 });
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(fixtureId, 'HALF_TIME', teams, 65, { home: 1, away: 0 });
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(fixtureId, 'EARLY_H2', teams, 65, { home: 1, away: 0 });
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(fixtureId, 'MID_H2', teams, 65, { home: 1, away: 0 });
    });

    it('generates ALL phases through LATE_H2 when discovered at minute 80', async () => {
      mockScenarioEngine.determinePhase.mockReturnValue('LATE_H2');
      mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

      await service.generateCatchUp(fixtureId, 80, teams);

      // EARLY_H1, MID_H1, LATE_H1, HALF_TIME, EARLY_H2, MID_H2, LATE_H2 = 7 phases
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledTimes(7);
    });

    it('generates only EARLY_H1 when discovered at minute 5 (early in match)', async () => {
      mockScenarioEngine.determinePhase.mockReturnValue('EARLY_H1');
      mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

      await service.generateCatchUp(fixtureId, 5, teams);

      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledTimes(1);
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(fixtureId, 'EARLY_H1', teams, 5, undefined);
    });

    it('generates only PRE_MATCH when match has not started', async () => {
      mockScenarioEngine.determinePhase.mockReturnValue('PRE_MATCH');
      mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

      await service.generateCatchUp(fixtureId, 0, teams);

      // PRE_MATCH only — no other phases retroactively
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledTimes(1);
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(fixtureId, 'PRE_MATCH', teams, 0, undefined);
    });

    it('skips PRE_MATCH when discovered after kickoff (started match)', async () => {
      mockScenarioEngine.determinePhase.mockReturnValue('MID_H1');
      mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

      await service.generateCatchUp(fixtureId, 25, teams);

      // PRE_MATCH should NOT be called
      expect(mockScenarioEngine.onPhaseChange).not.toHaveBeenCalledWith(
        fixtureId, 'PRE_MATCH', expect.anything(), expect.anything(), expect.anything(),
      );
      // Should call EARLY_H1 and MID_H1
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledTimes(2);
    });

    it('generates LATE_H1 + HALF_TIME when joining at HT', async () => {
      mockScenarioEngine.determinePhase.mockReturnValue('HALF_TIME');
      mockScenarioEngine.onPhaseChange.mockResolvedValue([]);

      await service.generateCatchUp(fixtureId, 45, teams, undefined, 'HT');

      // EARLY_H1, MID_H1, LATE_H1, HALF_TIME = 4 phases
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledTimes(4);
      expect(mockScenarioEngine.onPhaseChange).toHaveBeenCalledWith(fixtureId, 'HALF_TIME', teams, 45, undefined);
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
