import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class PredictionsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private usersService: UsersService,
  ) {}

  async submitPrediction(userId: string, questionId: string, optionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    });

    if (!question) throw new BadRequestException('Question not found');
    if (question.status !== 'OPEN') throw new BadRequestException('Question is not open');
    if (new Date() > question.closesAt) throw new BadRequestException('Question expired');

    const option = question.options.find((o) => o.id === optionId);
    if (!option) throw new BadRequestException('Invalid option');

    const existing = await this.prisma.prediction.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
    if (existing) throw new ConflictException('Already predicted');

    // Free to predict — no upfront deduction, but record bet amount for scoring
    const VIRTUAL_BET = 50;
    const prediction = await this.prisma.prediction.create({
      data: {
        userId,
        questionId,
        optionId,
        coinsBet: VIRTUAL_BET,
      },
    });

    // Update fan count in Redis
    await this.redis.hincrby(`question:${questionId}:fans`, optionId, 1);

    // Recalculate multipliers
    const fanData = await this.redis.hgetall(`question:${questionId}:fans`);
    const totalFans = Object.values(fanData).reduce((sum, v) => sum + parseInt(v || '0'), 0);

    const updatedOptions = question.options.map((opt) => {
      const fans = parseInt(fanData[opt.id] || '0');
      const fanPct = totalFans > 0 ? fans / totalFans : 0;
      // Live multiplier from fan distribution, but never below the original template multiplier
      const liveMultiplier = fanPct > 0 ? Math.round((1 / fanPct) * 10) / 10 : opt.multiplier;
      const multiplier = Math.max(opt.multiplier, liveMultiplier);
      return { id: opt.id, fanCount: fans, fanPct: Math.round(fanPct * 100), multiplier };
    });

    // Persist updated multipliers + fan counts to DB (so scoring uses live values)
    for (const opt of updatedOptions) {
      await this.prisma.questionOption.update({
        where: { id: opt.id },
        data: { multiplier: opt.multiplier, fanCount: opt.fanCount },
      });
    }

    // Check if this is the user's first prediction — award bonus
    let isFirstPrediction = false;
    const predictionCount = await this.prisma.prediction.count({ where: { userId } });
    if (predictionCount === 1) {
      isFirstPrediction = true;
      const bonusCoins = 20;
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { coins: { increment: bonusCoins } },
      });
      await this.prisma.coinTransaction.create({
        data: {
          userId,
          type: 'ONBOARDING',
          amount: bonusCoins,
          balanceAfter: updated.coins,
          referenceId: prediction.id,
        },
      });
      await this.usersService.addXp(userId, 10);
    }

    return { prediction, updatedOptions, isFirstPrediction };
  }

  async getHistory(userId: string, page: number = 1) {
    const limit = 20;
    const skip = (page - 1) * limit;

    return this.prisma.prediction.findMany({
      where: { userId },
      include: {
        question: { select: { text: true, category: true, fixtureId: true } },
        option: { select: { name: true, emoji: true } },
      },
      orderBy: { predictedAt: 'desc' },
      take: limit,
      skip,
    });
  }
}
