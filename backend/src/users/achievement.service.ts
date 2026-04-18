import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AchievementService {
  constructor(private prisma: PrismaService) {}

  async getUserAchievements(userId: string) {
    const allAchievements = await this.prisma.achievement.findMany();
    const userAchievements = await this.prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
    });

    const userAchMap = new Map(userAchievements.map((ua) => [ua.achievementId, ua]));

    return allAchievements.map((achievement) => {
      const userAch = userAchMap.get(achievement.id);
      return {
        ...achievement,
        progress: userAch?.progress || 0,
        earned: !!userAch?.earnedAt,
        earnedAt: userAch?.earnedAt || null,
      };
    });
  }

  async checkAndUnlock(
    userId: string,
  ): Promise<Array<{ name: string; rewardXp: number }>> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return [];

    const achievements = await this.prisma.achievement.findMany();
    const unlocked: Array<{ name: string; rewardXp: number }> = [];

    for (const achievement of achievements) {
      const existing = await this.prisma.userAchievement.findUnique({
        where: { userId_achievementId: { userId, achievementId: achievement.id } },
      });

      if (existing?.earnedAt) continue;

      let progress = 0;
      let earned = false;

      switch (achievement.conditionType) {
        case 'STREAK':
          progress = user.streakDays;
          earned = progress >= achievement.conditionValue;
          break;
        case 'ACCURACY':
          progress = user.totalPredictions > 0
            ? Math.round((user.correctPredictions / user.totalPredictions) * 100)
            : 0;
          earned = progress >= achievement.conditionValue && user.totalPredictions >= 50;
          break;
        case 'TOTAL':
          progress = user.totalPredictions;
          earned = progress >= achievement.conditionValue;
          break;
        case 'CONSECUTIVE_CORRECT':
          // This needs tracking from prediction history
          const recentPredictions = await this.prisma.prediction.findMany({
            where: { userId, isCorrect: { not: null } },
            orderBy: { predictedAt: 'desc' },
            take: achievement.conditionValue,
          });
          let consecutive = 0;
          for (const p of recentPredictions) {
            if (p.isCorrect) consecutive++;
            else break;
          }
          progress = consecutive;
          earned = consecutive >= achievement.conditionValue;
          break;
      }

      await this.prisma.userAchievement.upsert({
        where: { userId_achievementId: { userId, achievementId: achievement.id } },
        create: {
          userId,
          achievementId: achievement.id,
          progress,
          earnedAt: earned ? new Date() : null,
        },
        update: {
          progress,
          earnedAt: earned ? new Date() : undefined,
        },
      });

      if (earned && !existing?.earnedAt) {
        unlocked.push({ name: achievement.name, rewardXp: achievement.rewardXp });
      }
    }

    return unlocked;
  }
}
