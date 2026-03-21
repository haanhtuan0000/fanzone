import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { UsersService } from '../users/users.service';
import { AchievementService } from '../users/achievement.service';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private usersService: UsersService,
    private achievementService: AchievementService,
  ) {}

  async scoreQuestion(questionId: string, correctOptionId: string) {
    const predictions = await this.prisma.prediction.findMany({
      where: { questionId },
      include: { option: true },
    });

    const results: Array<{ userId: string; isCorrect: boolean; coinsResult: number; xpEarned: number }> = [];

    for (const prediction of predictions) {
      const isCorrect = prediction.optionId === correctOptionId;
      const multiplier = prediction.option.multiplier;
      const coinsResult = isCorrect
        ? Math.round(prediction.coinsBet * multiplier)
        : -prediction.coinsBet;
      const xpEarned = isCorrect ? 10 : 2;

      // Update prediction
      await this.prisma.prediction.update({
        where: { id: prediction.id },
        data: {
          isCorrect,
          coinsResult,
          xpEarned,
          resolvedAt: new Date(),
        },
      });

      // Update user coins and stats
      const user = await this.prisma.user.update({
        where: { id: prediction.userId },
        data: {
          coins: { increment: coinsResult },
          totalPredictions: { increment: 1 },
          correctPredictions: { increment: isCorrect ? 1 : 0 },
        },
      });

      // Create coin transaction
      await this.prisma.coinTransaction.create({
        data: {
          userId: prediction.userId,
          type: isCorrect ? 'PREDICTION_WIN' : 'PREDICTION_LOSS',
          amount: coinsResult,
          balanceAfter: user.coins,
          referenceId: prediction.id,
        },
      });

      // Add XP
      await this.usersService.addXp(prediction.userId, xpEarned);

      // Update streak
      await this.usersService.updateStreak(prediction.userId);

      // Update leaderboard
      const question = await this.prisma.question.findUnique({ where: { id: questionId } });
      if (question) {
        await this.redis.zadd(`lb:match:${question.fixtureId}`, user.coins, prediction.userId);
      }
      await this.redis.zadd('lb:global', user.coins, prediction.userId);

      // Weekly leaderboard
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
      const weekKey = `lb:week:${now.getFullYear()}-W${week}`;
      await this.redis.zadd(weekKey, user.coins, prediction.userId);

      if (user.coins > 0) {
        // Also add country leaderboard if user has country
        const fullUser = await this.prisma.user.findUnique({ where: { id: prediction.userId } });
        if (fullUser?.countryCode) {
          await this.redis.zadd(`lb:country:${fullUser.countryCode}`, user.coins, prediction.userId);
        }
      }

      // Check achievements
      await this.achievementService.checkAndUnlock(prediction.userId);

      // Create feed event (reuse question from leaderboard section above)
      if (question) {
        const displayName = user.displayName || 'Fan';
        await this.prisma.feedEvent.create({
          data: {
            fixtureId: question.fixtureId,
            userId: prediction.userId,
            type: isCorrect ? 'CORRECT' : 'WRONG',
            message: isCorrect
              ? `${displayName} du doan dung va nhan ${coinsResult} coins!`
              : `${displayName} du doan sai va mat ${Math.abs(coinsResult)} coins`,
            coinsDelta: coinsResult,
          },
        });
      }

      results.push({ userId: prediction.userId, isCorrect, coinsResult, xpEarned });
    }

    // Clean up Redis fan data
    await this.redis.del(`question:${questionId}:fans`);

    return results;
  }
}
