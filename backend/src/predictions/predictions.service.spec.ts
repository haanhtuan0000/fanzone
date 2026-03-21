import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { PredictionsService } from './predictions.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';

describe('PredictionsService', () => {
  let service: PredictionsService;

  const mockPrisma = {
    question: {
      findUnique: jest.fn(),
    },
    prediction: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockRedis = {
    hincrby: jest.fn(),
    hgetall: jest.fn(),
  };

  const userId = 'user-1';
  const questionId = 'question-1';
  const optionId = 'option-1';

  const mockQuestion = {
    id: questionId,
    status: 'OPEN',
    closesAt: new Date(Date.now() + 60000), // 1 minute from now
    rewardCoins: 50,
    options: [
      { id: 'option-1', name: 'Vietnam', emoji: '⚽', multiplier: 2.0 },
      { id: 'option-2', name: 'Thailand', emoji: '⚽', multiplier: 3.0 },
      { id: 'option-3', name: 'Khong co ban nao', emoji: '🚫', multiplier: 4.0 },
    ],
  };

  const mockPrediction = {
    id: 'pred-1',
    userId,
    questionId,
    optionId,
    coinsBet: 50,
    predictedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<PredictionsService>(PredictionsService);
  });

  describe('submitPrediction', () => {
    it('should successfully create a prediction for an open question', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
      mockPrisma.prediction.findUnique.mockResolvedValue(null); // No existing prediction
      mockPrisma.prediction.create.mockResolvedValue(mockPrediction);
      mockRedis.hincrby.mockResolvedValue(1);
      mockRedis.hgetall.mockResolvedValue({
        'option-1': '1',
        'option-2': '0',
        'option-3': '0',
      });

      const result = await service.submitPrediction(userId, questionId, optionId);

      expect(result.prediction).toEqual(mockPrediction);
      expect(result.updatedOptions).toBeDefined();
      expect(result.updatedOptions).toHaveLength(3);
      expect(mockPrisma.prediction.create).toHaveBeenCalledWith({
        data: {
          userId,
          questionId,
          optionId,
          coinsBet: 50,
        },
      });
    });

    it('should throw BadRequestException if question not found', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(null);

      await expect(
        service.submitPrediction(userId, questionId, optionId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if question is not OPEN', async () => {
      mockPrisma.question.findUnique.mockResolvedValue({
        ...mockQuestion,
        status: 'CLOSED',
      });

      await expect(
        service.submitPrediction(userId, questionId, optionId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if question expired', async () => {
      mockPrisma.question.findUnique.mockResolvedValue({
        ...mockQuestion,
        closesAt: new Date(Date.now() - 10000), // 10s in the past
      });

      await expect(
        service.submitPrediction(userId, questionId, optionId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid option', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);

      await expect(
        service.submitPrediction(userId, questionId, 'nonexistent-option'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if user already predicted', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
      mockPrisma.prediction.findUnique.mockResolvedValue(mockPrediction); // Already exists

      await expect(
        service.submitPrediction(userId, questionId, optionId),
      ).rejects.toThrow(ConflictException);
    });

    it('should update fan count in Redis', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
      mockPrisma.prediction.findUnique.mockResolvedValue(null);
      mockPrisma.prediction.create.mockResolvedValue(mockPrediction);
      mockRedis.hincrby.mockResolvedValue(1);
      mockRedis.hgetall.mockResolvedValue({
        'option-1': '1',
      });

      await service.submitPrediction(userId, questionId, optionId);

      expect(mockRedis.hincrby).toHaveBeenCalledWith(
        `question:${questionId}:fans`,
        optionId,
        1,
      );
    });

    it('should return updated fan percentages and multipliers', async () => {
      mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
      mockPrisma.prediction.findUnique.mockResolvedValue(null);
      mockPrisma.prediction.create.mockResolvedValue(mockPrediction);
      mockRedis.hincrby.mockResolvedValue(3);
      mockRedis.hgetall.mockResolvedValue({
        'option-1': '3',
        'option-2': '2',
        'option-3': '1',
      });

      const result = await service.submitPrediction(userId, questionId, optionId);

      // Total fans = 6
      // option-1: 3/6 = 50%, multiplier = round(1/0.5 * 10)/10 = 2.0, max(1.1, 2.0) = 2.0
      // option-2: 2/6 = 33%, multiplier = round(1/0.333 * 10)/10 = 3.0, max(1.1, 3.0) = 3.0
      // option-3: 1/6 = 17%, multiplier = round(1/0.167 * 10)/10 = 6.0, max(1.1, 6.0) = 6.0
      expect(result.updatedOptions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'option-1',
            fanCount: 3,
            fanPct: 50,
            multiplier: expect.any(Number),
          }),
          expect.objectContaining({
            id: 'option-2',
            fanCount: 2,
            fanPct: 33,
            multiplier: expect.any(Number),
          }),
          expect.objectContaining({
            id: 'option-3',
            fanCount: 1,
            fanPct: 17,
            multiplier: expect.any(Number),
          }),
        ]),
      );

      // All multipliers should be >= 1.1
      for (const opt of result.updatedOptions) {
        expect(opt.multiplier).toBeGreaterThanOrEqual(1.1);
      }
    });

    it('should set coinsBet equal to question rewardCoins', async () => {
      const highRewardQuestion = { ...mockQuestion, rewardCoins: 100 };
      mockPrisma.question.findUnique.mockResolvedValue(highRewardQuestion);
      mockPrisma.prediction.findUnique.mockResolvedValue(null);
      mockPrisma.prediction.create.mockResolvedValue({ ...mockPrediction, coinsBet: 100 });
      mockRedis.hincrby.mockResolvedValue(1);
      mockRedis.hgetall.mockResolvedValue({ 'option-1': '1' });

      await service.submitPrediction(userId, questionId, optionId);

      expect(mockPrisma.prediction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          coinsBet: 100,
        }),
      });
    });
  });
});
