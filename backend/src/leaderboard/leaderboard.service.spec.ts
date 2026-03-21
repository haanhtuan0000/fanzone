import { Test, TestingModule } from '@nestjs/testing';
import { LeaderboardService } from './leaderboard.service';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../common/prisma.service';

describe('LeaderboardService', () => {
  let service: LeaderboardService;

  const mockRedis = {
    zrevrangeWithScores: jest.fn(),
    zrevrank: jest.fn(),
    zscore: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockPrisma = {
    user: {
      findMany: jest.fn(),
    },
  };

  const mockUsers = [
    {
      id: 'user-1',
      displayName: 'PlayerOne',
      avatarEmoji: '🦁',
      countryCode: 'VN',
      totalPredictions: 50,
      correctPredictions: 30,
    },
    {
      id: 'user-2',
      displayName: 'PlayerTwo',
      avatarEmoji: '🐯',
      countryCode: 'US',
      totalPredictions: 40,
      correctPredictions: 20,
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeaderboardService,
        { provide: RedisService, useValue: mockRedis },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<LeaderboardService>(LeaderboardService);
  });

  describe('getLeaderboard', () => {
    const redisEntries = [
      { member: 'user-1', score: 2000 },
      { member: 'user-2', score: 1500 },
    ];

    beforeEach(() => {
      mockRedis.zrevrangeWithScores.mockResolvedValue(redisEntries);
      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
    });

    it('should use key "lb:global" for global scope', async () => {
      await service.getLeaderboard('global');

      expect(mockRedis.zrevrangeWithScores).toHaveBeenCalledWith('lb:global', 0, 19);
    });

    it('should use key "lb:match:123" for match scope with id "123"', async () => {
      await service.getLeaderboard('match', '123');

      expect(mockRedis.zrevrangeWithScores).toHaveBeenCalledWith('lb:match:123', 0, 19);
    });

    it('should use key "lb:country:VN" for country scope with id "VN"', async () => {
      await service.getLeaderboard('country', 'VN');

      expect(mockRedis.zrevrangeWithScores).toHaveBeenCalledWith('lb:country:VN', 0, 19);
    });

    it('should return ranked entries with user data (displayName, avatarEmoji, accuracy)', async () => {
      const result = await service.getLeaderboard('global');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        rank: 1,
        userId: 'user-1',
        coins: 2000,
        displayName: 'PlayerOne',
        avatarEmoji: '🦁',
        countryCode: 'VN',
        accuracy: 60, // Math.round(30/50 * 100)
      });
      expect(result[1]).toEqual({
        rank: 2,
        userId: 'user-2',
        coins: 1500,
        displayName: 'PlayerTwo',
        avatarEmoji: '🐯',
        countryCode: 'US',
        accuracy: 50, // Math.round(20/40 * 100)
      });
    });

    it('should handle missing user data gracefully', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]); // No users found in DB

      const result = await service.getLeaderboard('global');

      expect(result[0].displayName).toBe('Unknown');
      expect(result[0].avatarEmoji).toBe('⚽');
      expect(result[0].accuracy).toBe(0);
    });
  });

  describe('getUserRank', () => {
    it('should return rank, coins, and delta', async () => {
      mockRedis.zrevrank.mockResolvedValue(2); // 0-indexed rank 2 => display rank 3
      mockRedis.zscore.mockResolvedValue(1500);
      mockRedis.get.mockResolvedValue('5'); // Previous rank was 5
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.getUserRank('user-1', 'global');

      expect(result).toEqual({
        rank: 3,
        coins: 1500,
        delta: 2, // prevRank(5) - currentRank(3) = 2 (moved up)
      });
    });

    it('should return delta 0 when no previous rank cached', async () => {
      mockRedis.zrevrank.mockResolvedValue(0);
      mockRedis.zscore.mockResolvedValue(2000);
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.getUserRank('user-1', 'global');

      expect(result).toEqual({
        rank: 1,
        coins: 2000,
        delta: 0,
      });
    });

    it('should return null rank when user not in leaderboard', async () => {
      mockRedis.zrevrank.mockResolvedValue(null);
      mockRedis.zscore.mockResolvedValue(null);
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getUserRank('user-1', 'global');

      expect(result).toEqual({
        rank: null,
        coins: 0,
        delta: 0,
      });
    });

    it('should cache current rank with TTL for delta calculation', async () => {
      mockRedis.zrevrank.mockResolvedValue(4);
      mockRedis.zscore.mockResolvedValue(800);
      mockRedis.get.mockResolvedValue('6');
      mockRedis.set.mockResolvedValue('OK');

      await service.getUserRank('user-1', 'global');

      expect(mockRedis.set).toHaveBeenCalledWith('lb:global:delta:user-1', '5', 30);
    });

    it('should calculate negative delta when rank drops', async () => {
      mockRedis.zrevrank.mockResolvedValue(9); // rank 10
      mockRedis.zscore.mockResolvedValue(500);
      mockRedis.get.mockResolvedValue('7'); // was rank 7
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.getUserRank('user-1', 'global');

      expect(result.delta).toBe(-3); // 7 - 10 = -3 (moved down)
    });
  });
});
