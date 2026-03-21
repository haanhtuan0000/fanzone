import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../common/prisma.service';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'TestUser',
    avatarEmoji: '⚽',
    countryCode: 'VN',
    favoriteTeamId: 'team-1',
    coins: 1000,
    currentXp: 50,
    level: 3,
    streakDays: 5,
    totalPredictions: 20,
    correctPredictions: 12,
    globalRank: 42,
    lastActiveDate: null as Date | null,
    createdAt: new Date('2025-01-01'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getProfile', () => {
    it('should return formatted profile with accuracy calculation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-1');

      expect(result.id).toBe('user-1');
      expect(result.email).toBe('test@example.com');
      expect(result.displayName).toBe('TestUser');
      expect(result.coins).toBe(1000);
      expect(result.accuracy).toBe(60); // Math.round(12/20 * 100)
      expect(result.title).toBeDefined();
      expect(result.xpToNextLevel).toBeDefined();
      expect(result.streakDays).toBe(5);
    });

    it('should return accuracy 0 when totalPredictions is 0', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        totalPredictions: 0,
        correctPredictions: 0,
      });

      const result = await service.getProfile('user-1');
      expect(result.accuracy).toBe(0);
    });

    it('should throw NotFoundException for missing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addXp', () => {
    it('should increase XP without leveling up', async () => {
      // Level 3 is in the first tier (maxLevel 5, xpPerLevel 100)
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        currentXp: 20,
        level: 3,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.addXp('user-1', 10);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { currentXp: 30, level: 3 },
      });
      expect(result).toEqual({ level: 3, currentXp: 30, leveledUp: false });
    });

    it('should level up when XP exceeds threshold', async () => {
      // Level 3, xpPerLevel = 100, currentXp = 90, adding 20 => 110 >= 100
      // After leveling: level 4, xp = 10
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        currentXp: 90,
        level: 3,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.addXp('user-1', 20);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { currentXp: 10, level: 4 },
      });
      expect(result).toEqual({ level: 4, currentXp: 10, leveledUp: true });
    });

    it('should level up multiple times if enough XP', async () => {
      // Level 3, xpPerLevel = 100, currentXp = 80, adding 250
      // 80 + 250 = 330 => level 4 (330-100=230), level 5 (230-100=130),
      // At level 5, xpPerLevel is still 100 (maxLevel 5), so level 6 (130-100=30)
      // At level 6, tier is (maxLevel 10, xpPerLevel 300), 30 < 300, stop at level 6
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        currentXp: 80,
        level: 3,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.addXp('user-1', 250);

      expect(result!.leveledUp).toBe(true);
      expect(result!.level).toBeGreaterThan(3);
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('should return undefined if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.addXp('nonexistent', 10);

      expect(result).toBeUndefined();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateStreak', () => {
    it('should increment streak for consecutive day', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);

      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        streakDays: 5,
        lastActiveDate: yesterday,
      });
      mockPrisma.user.update.mockResolvedValue({});

      await service.updateStreak('user-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          streakDays: 6,
          lastActiveDate: expect.any(Date),
        },
      });
    });

    it('should reset streak if gap > 1 day', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(12, 0, 0, 0);

      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        streakDays: 10,
        lastActiveDate: threeDaysAgo,
      });
      mockPrisma.user.update.mockResolvedValue({});

      await service.updateStreak('user-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          streakDays: 1,
          lastActiveDate: expect.any(Date),
        },
      });
    });

    it('should skip if already active today', async () => {
      const today = new Date();
      today.setHours(2, 0, 0, 0); // Earlier today

      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        streakDays: 5,
        lastActiveDate: today,
      });

      await service.updateStreak('user-1');

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should set streak to 1 on first activity (no lastActiveDate)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        streakDays: 0,
        lastActiveDate: null,
      });
      mockPrisma.user.update.mockResolvedValue({});

      await service.updateStreak('user-1');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          streakDays: 1,
          lastActiveDate: expect.any(Date),
        },
      });
    });

    it('should do nothing if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await service.updateStreak('nonexistent');

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });
});
