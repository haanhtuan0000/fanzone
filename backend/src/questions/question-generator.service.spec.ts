import { Test, TestingModule } from '@nestjs/testing';
import { QuestionGeneratorService } from './question-generator.service';
import { QuestionsService } from './questions.service';

describe('QuestionGeneratorService', () => {
  let service: QuestionGeneratorService;

  const mockQuestionsService = {
    createQuestion: jest.fn(),
  };

  const teams = { home: 'Vietnam', away: 'Thailand' };
  const fixtureId = 100;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionGeneratorService,
        { provide: QuestionsService, useValue: mockQuestionsService },
      ],
    }).compile();

    service = module.get<QuestionGeneratorService>(QuestionGeneratorService);

    // Reset the cooldown map between tests by creating a fresh instance
    // Access the private map to clear it for test isolation
    (service as any).lastQuestionTime = new Map();

    mockQuestionsService.createQuestion.mockImplementation((data) => ({
      id: 'q-1',
      ...data,
    }));
  });

  describe('generateFromEvent', () => {
    it('should generate GOAL category question with 3 options for goal event', async () => {
      const event = { type: 'Goal', player: { name: 'Nguyen' }, time: { elapsed: 45 } };

      await service.generateFromEvent(fixtureId, event, teams);

      expect(mockQuestionsService.createQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          fixtureId: 100,
          category: 'GOAL',
          text: 'Ai ghi ban tiep theo?',
          options: expect.arrayContaining([
            expect.objectContaining({ name: 'Vietnam' }),
            expect.objectContaining({ name: 'Thailand' }),
            expect.objectContaining({ name: 'Khong co ban nao' }),
          ]),
        }),
      );

      const callArg = mockQuestionsService.createQuestion.mock.calls[0][0];
      expect(callArg.options).toHaveLength(3);
    });

    it('should generate CARD category question for yellow card event', async () => {
      const event = { type: 'Card', detail: 'Yellow Card', player: { name: 'Tran' } };

      await service.generateFromEvent(fixtureId, event, teams);

      expect(mockQuestionsService.createQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          fixtureId: 100,
          category: 'CARD',
          rewardCoins: 75,
          options: expect.arrayContaining([
            expect.objectContaining({ name: 'Vietnam player' }),
            expect.objectContaining({ name: 'Thailand player' }),
            expect.objectContaining({ name: 'Khong ai' }),
          ]),
        }),
      );
    });

    it('should generate SUBSTITUTION question with yes/no options for subst event', async () => {
      const event = { type: 'Subst', player: { name: 'Le' } };

      await service.generateFromEvent(fixtureId, event, teams);

      expect(mockQuestionsService.createQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          fixtureId: 100,
          category: 'SUBSTITUTION',
          rewardCoins: 100,
          options: [
            expect.objectContaining({ name: 'Co' }),
            expect.objectContaining({ name: 'Khong' }),
          ],
        }),
      );

      const callArg = mockQuestionsService.createQuestion.mock.calls[0][0];
      expect(callArg.options).toHaveLength(2);
    });

    it('should generate VAR question with yes/no options for var event', async () => {
      const event = { type: 'Var' };

      await service.generateFromEvent(fixtureId, event, teams);

      expect(mockQuestionsService.createQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          fixtureId: 100,
          category: 'VAR',
          rewardCoins: 75,
          options: [
            expect.objectContaining({ name: 'Co' }),
            expect.objectContaining({ name: 'Khong' }),
          ],
        }),
      );
    });

    it('should return null for unknown event type', async () => {
      const event = { type: 'unknown_event' };

      const result = await service.generateFromEvent(fixtureId, event, teams);

      expect(result).toBeNull();
      expect(mockQuestionsService.createQuestion).not.toHaveBeenCalled();
    });

    it('should respect 60s cooldown between questions for the same fixture', async () => {
      const event = { type: 'Goal' };

      // First call should succeed
      const result1 = await service.generateFromEvent(fixtureId, event, teams);
      expect(result1).not.toBeNull();
      expect(mockQuestionsService.createQuestion).toHaveBeenCalledTimes(1);

      // Second call within cooldown should return null
      const result2 = await service.generateFromEvent(fixtureId, event, teams);
      expect(result2).toBeNull();
      expect(mockQuestionsService.createQuestion).toHaveBeenCalledTimes(1); // Still 1

      // Simulate cooldown passing by manipulating the internal map
      (service as any).lastQuestionTime.set(fixtureId, Date.now() - 61000);

      // Third call after cooldown should succeed
      const result3 = await service.generateFromEvent(fixtureId, event, teams);
      expect(result3).not.toBeNull();
      expect(mockQuestionsService.createQuestion).toHaveBeenCalledTimes(2);
    });

    it('should allow questions for different fixtures without cooldown conflict', async () => {
      const event = { type: 'Goal' };

      await service.generateFromEvent(100, event, teams);
      await service.generateFromEvent(200, event, teams);

      expect(mockQuestionsService.createQuestion).toHaveBeenCalledTimes(2);
    });

    it('should set correct opensAt and closesAt (30s window)', async () => {
      const event = { type: 'Goal' };
      const beforeCall = Date.now();

      await service.generateFromEvent(fixtureId, event, teams);

      const callArg = mockQuestionsService.createQuestion.mock.calls[0][0];
      const opensAt = new Date(callArg.opensAt).getTime();
      const closesAt = new Date(callArg.closesAt).getTime();
      const afterCall = Date.now();

      // opensAt should be approximately now
      expect(opensAt).toBeGreaterThanOrEqual(beforeCall - 100);
      expect(opensAt).toBeLessThanOrEqual(afterCall + 100);

      // closesAt should be approximately 30s after now
      expect(closesAt - opensAt).toBeGreaterThanOrEqual(29000);
      expect(closesAt - opensAt).toBeLessThanOrEqual(31000);
    });

    it('should return null for card event that is not Yellow Card', async () => {
      const event = { type: 'Card', detail: 'Red Card' };

      const result = await service.generateFromEvent(fixtureId, event, teams);

      expect(result).toBeNull();
      expect(mockQuestionsService.createQuestion).not.toHaveBeenCalled();
    });
  });
});
