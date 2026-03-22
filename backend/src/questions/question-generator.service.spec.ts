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
