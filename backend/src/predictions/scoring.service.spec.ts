import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from './scoring.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { UsersService } from '../users/users.service';
import { AchievementService } from '../users/achievement.service';

describe('ScoringService', () => {
  let service: ScoringService;

  const mockPrisma = {
    prediction: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    coinTransaction: {
      create: jest.fn(),
    },
    question: {
      findUnique: jest.fn(),
    },
    feedEvent: {
      create: jest.fn(),
    },
  };

  const mockRedis = {
    zadd: jest.fn(),
    del: jest.fn(),
    zrevrank: jest.fn(),
  };

  const mockUsersService = {
    addXp: jest.fn(),
    updateStreak: jest.fn(),
  };

  const mockAchievementService = {
    checkAndUnlock: jest.fn(),
  };

  const questionId = 'question-1';
  const correctOptionId = 'option-correct';
  const wrongOptionId = 'option-wrong';

  const mockQuestion = { id: questionId, fixtureId: 100, rewardCoins: 100, text: 'Test question' };

  const makePrediction = (overrides: Record<string, any> = {}) => ({
    id: 'pred-1',
    userId: 'user-1',
    questionId,
    optionId: correctOptionId,
    option: { id: correctOptionId, multiplier: 2.5 },
    ...overrides,
  });

  const makeUser = (overrides: Record<string, any> = {}) => ({
    id: 'user-1',
    coins: 1100,
    totalPredictions: 11,
    correctPredictions: 6,
    countryCode: 'VN',
    ...overrides,
  });

  /** Set up mocks common to most scoring tests */
  function setupCommonMocks() {
    mockPrisma.prediction.update.mockResolvedValue({});
    mockPrisma.coinTransaction.create.mockResolvedValue({});
    mockPrisma.feedEvent.create.mockResolvedValue({});
    mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);
    mockUsersService.addXp.mockResolvedValue({});
    mockUsersService.updateStreak.mockResolvedValue({});
    mockAchievementService.checkAndUnlock.mockResolvedValue([]);
    mockRedis.zrevrank.mockResolvedValue(null);
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoringService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AchievementService, useValue: mockAchievementService },
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
  });

  describe('scoreQuestion', () => {
    it('should score a correct prediction: coins_result = rewardCoins, xp = 10', async () => {
      const prediction = makePrediction();
      const user = makeUser();
      setupCommonMocks();
      mockPrisma.prediction.findMany
        .mockResolvedValueOnce([prediction])   // main query
        .mockResolvedValue([prediction]);       // match earnings query
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const results = await service.scoreQuestion(questionId, correctOptionId);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        userId: 'user-1',
        isCorrect: true,
        coinsResult: 100, // rewardCoins
        xpEarned: 10,
      });

      expect(mockPrisma.prediction.update).toHaveBeenCalledWith({
        where: { id: 'pred-1' },
        data: expect.objectContaining({
          isCorrect: true,
          coinsResult: 100,
          xpEarned: 10,
        }),
      });
    });

    it('should score a wrong prediction: coins_result = -rewardCoins, xp = 2', async () => {
      const prediction = makePrediction({ optionId: wrongOptionId, option: { id: wrongOptionId, multiplier: 3.0 } });
      const user = makeUser({ coins: 950 });
      setupCommonMocks();
      mockPrisma.prediction.findMany
        .mockResolvedValueOnce([prediction])
        .mockResolvedValue([]);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const results = await service.scoreQuestion(questionId, correctOptionId);

      expect(results[0]).toEqual({
        userId: 'user-1',
        isCorrect: false,
        coinsResult: -100,
        xpEarned: 2,
      });
    });

    it('should clamp loss to current balance to prevent negative coins', async () => {
      const prediction = makePrediction({ optionId: wrongOptionId, option: { id: wrongOptionId, multiplier: 3.0 } });
      const user = makeUser({ coins: 30 }); // Only 30 coins — loss clamped to -30
      setupCommonMocks();
      mockPrisma.prediction.findMany
        .mockResolvedValueOnce([prediction])
        .mockResolvedValue([]);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const results = await service.scoreQuestion(questionId, correctOptionId);

      expect(results[0].coinsResult).toBe(-30); // Clamped to -balance
    });

    it('should update user coins, totalPredictions, and correctPredictions', async () => {
      const prediction = makePrediction();
      const user = makeUser();
      setupCommonMocks();
      mockPrisma.prediction.findMany
        .mockResolvedValueOnce([prediction])
        .mockResolvedValue([prediction]);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await service.scoreQuestion(questionId, correctOptionId);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          coins: { increment: 100 },
          totalPredictions: { increment: 1 },
          correctPredictions: { increment: 1 },
        },
      });
    });

    it('should create CoinTransaction records', async () => {
      const prediction = makePrediction();
      const user = makeUser();
      setupCommonMocks();
      mockPrisma.prediction.findMany
        .mockResolvedValueOnce([prediction])
        .mockResolvedValue([prediction]);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await service.scoreQuestion(questionId, correctOptionId);

      expect(mockPrisma.coinTransaction.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'PREDICTION_WIN',
          amount: 100,
          balanceAfter: user.coins,
          referenceId: 'pred-1',
        },
      });
    });

    it('should call usersService.addXp and usersService.updateStreak', async () => {
      const prediction = makePrediction();
      const user = makeUser();
      setupCommonMocks();
      mockPrisma.prediction.findMany
        .mockResolvedValueOnce([prediction])
        .mockResolvedValue([prediction]);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await service.scoreQuestion(questionId, correctOptionId);

      expect(mockUsersService.addXp).toHaveBeenCalledWith('user-1', 10);
      expect(mockUsersService.updateStreak).toHaveBeenCalledWith('user-1');
    });

    it('should update leaderboard Redis sorted sets', async () => {
      const prediction = makePrediction();
      const user = makeUser({ coins: 1200, countryCode: 'VN' });
      setupCommonMocks();
      // Main query returns the prediction; match earnings query returns the same prediction with coinsResult
      mockPrisma.prediction.findMany
        .mockResolvedValueOnce([prediction])
        .mockResolvedValue([{ coinsResult: 100 }]);
      mockPrisma.user.update.mockResolvedValue(user);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      await service.scoreQuestion(questionId, correctOptionId);

      // Match leaderboard uses sum of match earnings
      expect(mockRedis.zadd).toHaveBeenCalledWith('lb:match:100', 100, 'user-1');
      // Global leaderboard uses user.coins
      expect(mockRedis.zadd).toHaveBeenCalledWith('lb:global', user.coins, 'user-1');
      // Country leaderboard
      expect(mockRedis.zadd).toHaveBeenCalledWith('lb:country:VN', user.coins, 'user-1');
    });

    it('should clean up Redis fan data after resolution', async () => {
      mockPrisma.prediction.findMany.mockResolvedValue([]);
      mockPrisma.question.findUnique.mockResolvedValue(mockQuestion);

      await service.scoreQuestion(questionId, correctOptionId);

      expect(mockRedis.del).toHaveBeenCalledWith(`question:${questionId}:fans`);
    });

    it('should score multiple predictions on the same question correctly', async () => {
      const correctPrediction = makePrediction({ id: 'pred-1', userId: 'user-1' });
      const wrongPrediction = makePrediction({
        id: 'pred-2',
        userId: 'user-2',
        optionId: wrongOptionId,
        option: { id: wrongOptionId, multiplier: 3.0 },
      });
      const userA = makeUser({ id: 'user-1', coins: 1200, countryCode: 'VN' });
      const userB = makeUser({ id: 'user-2', coins: 900, countryCode: 'US' });

      setupCommonMocks();
      mockPrisma.prediction.findMany
        .mockResolvedValueOnce([correctPrediction, wrongPrediction]) // main query
        .mockResolvedValue([]);  // match earnings queries
      mockPrisma.user.update
        .mockResolvedValueOnce(userA)
        .mockResolvedValueOnce(userB);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(userA)   // clamp check for user-2 (wrong prediction)
        .mockResolvedValueOnce(userB);

      const results = await service.scoreQuestion(questionId, correctOptionId);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        userId: 'user-1',
        isCorrect: true,
        coinsResult: 100,
        xpEarned: 10,
      });
      expect(results[1]).toEqual({
        userId: 'user-2',
        isCorrect: false,
        coinsResult: -100,
        xpEarned: 2,
      });
    });
  });
});
