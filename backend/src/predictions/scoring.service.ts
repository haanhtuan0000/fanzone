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
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    const rewardCoins = question?.rewardCoins ?? 100;

    const predictions = await this.prisma.prediction.findMany({
      where: { questionId, resolvedAt: null },
      include: { option: true },
    });

    const results: Array<{ userId: string; isCorrect: boolean; coinsResult: number; xpEarned: number }> = [];

    for (const prediction of predictions) {
      const isCorrect = prediction.optionId === correctOptionId;
      const xpEarned = isCorrect ? 10 : 2;

      // Prevent negative coin balance: clamp loss to current balance
      let coinsToAdd = isCorrect ? rewardCoins : -rewardCoins;
      if (!isCorrect) {
        const currentUser = await this.prisma.user.findUnique({
          where: { id: prediction.userId },
          select: { coins: true },
        });
        coinsToAdd = Math.max(coinsToAdd, -(currentUser?.coins ?? 0));
      }
      const coinsResult = coinsToAdd;

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
          coins: { increment: coinsToAdd },
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

      // Update leaderboard (question already fetched above)
      if (question) {
        // Match leaderboard: use match-specific earnings (sum of coinsResult for this fixture)
        const matchPredictions = await this.prisma.prediction.findMany({
          where: { userId: prediction.userId, question: { fixtureId: question.fixtureId }, coinsResult: { not: null } },
          select: { coinsResult: true },
        });
        const matchEarnings = matchPredictions.reduce((sum, p) => sum + (p.coinsResult ?? 0), 0);
        await this.redis.zadd(`lb:match:${question.fixtureId}`, matchEarnings, prediction.userId);
      }
      await this.redis.zadd('lb:global', user.coins, prediction.userId);

      // Weekly leaderboard
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);
      const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
      const weekKey = `lb:week:${now.getFullYear()}-W${week}`;
      await this.redis.zadd(weekKey, user.coins, prediction.userId);

      // Country leaderboard (user object from update already has all fields)
      if (user.coins > 0 && (user as any).countryCode) {
        await this.redis.zadd(`lb:country:${(user as any).countryCode}`, user.coins, prediction.userId);
      }

      // Check achievements
      await this.achievementService.checkAndUnlock(prediction.userId);

      // Check rank milestones (top 10/50/100 on match leaderboard)
      if (question) {
        const rank = await this.redis.zrevrank(`lb:match:${question.fixtureId}`, prediction.userId);
        if (rank !== null) {
          const position = rank + 1; // zrevrank is 0-based
          if (position === 1 || position === 10 || position === 50 || position === 100) {
            await this.prisma.feedEvent.create({
              data: {
                fixtureId: question.fixtureId,
                userId: prediction.userId,
                type: 'RANK_CHANGE',
                message: `Climbed to Top ${position}!|Leo lên Top ${position}!`,
              },
            });
          }
        }
      }

      // Create feed event — short message with question topic
      if (question) {
        // Shorten question text to just the topic (first 30 chars)
        const shortQuestion = question.text.length > 30
          ? question.text.substring(0, 30) + '...'
          : question.text;
        await this.prisma.feedEvent.create({
          data: {
            fixtureId: question.fixtureId,
            userId: prediction.userId,
            type: isCorrect ? 'CORRECT' : 'WRONG',
            message: isCorrect
              ? `Correct: ${shortQuestion}|Dự đoán đúng: ${shortQuestion}`
              : `Wrong: ${shortQuestion}|Dự đoán sai: ${shortQuestion}`,
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

  /**
   * VOID a question — no coins refunded since predictions are free.
   * Used when a question can't be resolved (e.g. no goal scored, no card, no sub).
   */
  async voidQuestion(questionId: string) {
    const predictions = await this.prisma.prediction.findMany({
      where: { questionId },
    });

    const results: Array<{ userId: string; coinsRefunded: number }> = [];

    for (const prediction of predictions) {
      // Skip already-resolved predictions (prevents double-void)
      if (prediction.resolvedAt) continue;

      // Mark prediction as voided (no coins to refund since betting is disabled)
      await this.prisma.prediction.update({
        where: { id: prediction.id },
        data: {
          isCorrect: null,
          coinsResult: 0,
          xpEarned: 0,
          resolvedAt: new Date(),
        },
      });

      results.push({ userId: prediction.userId, coinsRefunded: 0 });
    }

    // Clean up Redis fan data
    await this.redis.del(`question:${questionId}:fans`);

    return results;
  }
}
