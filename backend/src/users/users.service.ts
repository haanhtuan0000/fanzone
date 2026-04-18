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

/**
 * Streak-count milestones that trigger a notification in Stage 4. A
 * crossing (going *to* one of these via the normal +1 increment path)
 * fires a push; merely being at or above a threshold does not.
 */
const STREAK_MILESTONES = [7, 30, 100] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

/**
 * Resolve the user's rank title for a given level + locale. Exported so
 * the notifications layer can render "Level 6: Chuyên gia" / "Expert"
 * bodies without reaching into the private map.
 */
export function titleForLevel(level: number, locale: 'vi' | 'en'): string {
  let title = TITLES[1];
  for (const [minLevel, t] of Object.entries(TITLES).sort(
    ([a], [b]) => Number(b) - Number(a),
  )) {
    if (level >= Number(minLevel)) {
      title = t;
      break;
    }
  }
  return title[locale];
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    // Update streak on profile view (counts as daily activity)
    await this.updateStreak(userId);
    // Re-read in case streak changed
    const updated = await this.prisma.user.findUnique({ where: { id: userId } });

    return {
      ...this.formatProfile(updated ?? user),
    };
  }

  private formatProfile(user: any) {
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

  async updateStreak(
    userId: string,
  ): Promise<{ newStreak: number; crossedMilestone: StreakMilestone | null }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { newStreak: 0, crossedMilestone: null };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newStreak = user.streakDays;
    let crossed: StreakMilestone | null = null;

    if (user.lastActiveDate) {
      const lastActive = new Date(user.lastActiveDate);
      lastActive.setHours(0, 0, 0, 0);
      const diffDays = Math.floor(
        (today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 0) return { newStreak, crossedMilestone: null };
      if (diffDays === 1) {
        newStreak = user.streakDays + 1;
        if (STREAK_MILESTONES.includes(newStreak as StreakMilestone)) {
          crossed = newStreak as StreakMilestone;
        }
        await this.prisma.user.update({
          where: { id: userId },
          data: { streakDays: newStreak, lastActiveDate: today },
        });
      } else {
        newStreak = 1;
        await this.prisma.user.update({
          where: { id: userId },
          data: { streakDays: 1, lastActiveDate: today },
        });
      }
    } else {
      newStreak = 1;
      await this.prisma.user.update({
        where: { id: userId },
        data: { streakDays: 1, lastActiveDate: today },
      });
    }

    return { newStreak, crossedMilestone: crossed };
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
