import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const LEVEL_THRESHOLDS = [
  { maxLevel: 5, xpPerLevel: 100 },
  { maxLevel: 10, xpPerLevel: 300 },
  { maxLevel: 20, xpPerLevel: 500 },
  { maxLevel: 30, xpPerLevel: 800 },
  { maxLevel: 50, xpPerLevel: 1750 },
  { maxLevel: Infinity, xpPerLevel: 2500 },
];

const TITLES: Record<number, { vi: string; en: string }> = {
  1: { vi: 'Fan Mới', en: 'New Fan' },
  6: { vi: 'Fan Thường', en: 'Regular Fan' },
  11: { vi: 'Fan Nhiệt Huyết', en: 'Passionate Fan' },
  21: { vi: 'Thiên Tài Chiến Thuật', en: 'Tactical Genius' },
  31: { vi: 'Nguyên Soái', en: 'Field Marshal' },
  51: { vi: 'Huyền Thoại', en: 'Legend' },
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarEmoji: user.avatarEmoji,
      countryCode: user.countryCode,
      favoriteTeamId: user.favoriteTeamId,
      coins: user.coins,
      currentXp: user.currentXp,
      level: user.level,
      titleVi: this.getTitle(user.level).vi,
      titleEn: this.getTitle(user.level).en,
      xpToNextLevel: this.getXpToNextLevel(user.level),
      streakDays: user.streakDays,
      totalPredictions: user.totalPredictions,
      correctPredictions: user.correctPredictions,
      accuracy: user.totalPredictions > 0
        ? Math.round((user.correctPredictions / user.totalPredictions) * 100)
        : 0,
      globalRank: user.globalRank,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(userId: string, data: { displayName?: string; avatarEmoji?: string; favoriteTeamId?: number }) {
    const updateData: any = {};
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.avatarEmoji !== undefined) updateData.avatarEmoji = data.avatarEmoji;
    if (data.favoriteTeamId !== undefined) updateData.favoriteTeamId = data.favoriteTeamId;

    await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return this.getProfile(userId);
  }

  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        avatarEmoji: true,
        countryCode: true,
        level: true,
        totalPredictions: true,
        correctPredictions: true,
        globalRank: true,
        streakDays: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      ...user,
      titleVi: this.getTitle(user.level).vi,
      titleEn: this.getTitle(user.level).en,
      accuracy: user.totalPredictions > 0
        ? Math.round((user.correctPredictions / user.totalPredictions) * 100)
        : 0,
    };
  }

  async getActivity(userId: string, page: number = 1) {
    const limit = 10;
    const skip = (page - 1) * limit;

    return this.prisma.coinTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    });
  }

  async addXp(userId: string, xp: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    let newXp = user.currentXp + xp;
    let newLevel = user.level;

    while (true) {
      const threshold = this.getXpToNextLevel(newLevel);
      if (newXp >= threshold) {
        newXp -= threshold;
        newLevel++;
      } else {
        break;
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { currentXp: newXp, level: newLevel },
    });

    return { level: newLevel, currentXp: newXp, leveledUp: newLevel > user.level };
  }

  async updateStreak(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (user.lastActiveDate) {
      const lastActive = new Date(user.lastActiveDate);
      lastActive.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return; // Already active today
      if (diffDays === 1) {
        // Consecutive day
        await this.prisma.user.update({
          where: { id: userId },
          data: { streakDays: user.streakDays + 1, lastActiveDate: today },
        });
      } else {
        // Streak broken
        await this.prisma.user.update({
          where: { id: userId },
          data: { streakDays: 1, lastActiveDate: today },
        });
      }
    } else {
      // First activity
      await this.prisma.user.update({
        where: { id: userId },
        data: { streakDays: 1, lastActiveDate: today },
      });
    }
  }

  private getTitle(level: number): { vi: string; en: string } {
    let title = TITLES[1];
    for (const [minLevel, t] of Object.entries(TITLES).sort(([a], [b]) => Number(b) - Number(a))) {
      if (level >= Number(minLevel)) {
        title = t;
        break;
      }
    }
    return title;
  }

  private getXpToNextLevel(level: number): number {
    for (const tier of LEVEL_THRESHOLDS) {
      if (level <= tier.maxLevel) {
        return tier.xpPerLevel;
      }
    }
    return 2500;
  }
}
