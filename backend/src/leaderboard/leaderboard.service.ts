import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  private getKey(scope: string, id?: string): string {
    switch (scope) {
      case 'match': return `lb:match:${id}`;
      case 'week': return `lb:week:${id || this.getCurrentWeek()}`;
      case 'country': return `lb:country:${id}`;
      default: return 'lb:global';
    }
  }

  async getLeaderboard(scope: string, id?: string) {
    const key = this.getKey(scope, id);
    const entries = await this.redis.zrevrangeWithScores(key, 0, 19);

    const userIds = entries.map((e) => e.member);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        displayName: true,
        avatarEmoji: true,
        countryCode: true,
        totalPredictions: true,
        correctPredictions: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return entries.map((entry, index) => {
      const user = userMap.get(entry.member);
      return {
        rank: index + 1,
        userId: entry.member,
        coins: entry.score,
        displayName: user?.displayName || 'Unknown',
        avatarEmoji: user?.avatarEmoji || '\u26BD',
        countryCode: user?.countryCode,
        accuracy: user && user.totalPredictions > 0
          ? Math.round((user.correctPredictions / user.totalPredictions) * 100)
          : 0,
      };
    });
  }

  async getUserRank(userId: string, scope: string, id?: string) {
    const key = this.getKey(scope, id);
    const rank = await this.redis.zrevrank(key, userId);
    const score = await this.redis.zscore(key, userId);

    // Get delta (compare to cached rank from 15s ago)
    const deltaKey = `${key}:delta:${userId}`;
    const prevRank = await this.redis.get(deltaKey);
    const currentRank = rank !== null ? rank + 1 : null;

    // Cache current rank for delta calculation
    if (currentRank !== null) {
      await this.redis.set(deltaKey, currentRank.toString(), 30);
    }

    return {
      rank: currentRank,
      coins: score || 0,
      delta: prevRank && currentRank ? parseInt(prevRank) - currentRank : 0,
    };
  }

  private getCurrentWeek(): string {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${week}`;
  }
}
