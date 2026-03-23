import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class PredictionsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private readonly FIXED_BET = 50; // Doc: "Cược điểm cố định 50🪙/câu"

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

    // Atomic: check balance + deduct + create prediction in one transaction
    const prediction = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { coins: true },
      });
      if (!user || user.coins < this.FIXED_BET) {
        throw new BadRequestException('Not enough coins');
      }

      await tx.user.update({
        where: { id: userId },
        data: { coins: { decrement: this.FIXED_BET } },
      });

      return tx.prediction.create({
        data: {
          userId,
          questionId,
          optionId,
          coinsBet: this.FIXED_BET,
        },
      });
    });

    // Update fan count in Redis
    await this.redis.hincrby(`question:${questionId}:fans`, optionId, 1);

    // Recalculate multipliers
    const fanData = await this.redis.hgetall(`question:${questionId}:fans`);
    const totalFans = Object.values(fanData).reduce((sum, v) => sum + parseInt(v || '0'), 0);

    const updatedOptions = question.options.map((opt) => {
      const fans = parseInt(fanData[opt.id] || '0');
      const fanPct = totalFans > 0 ? fans / totalFans : 0;
      const multiplier = fanPct > 0 ? Math.round((1 / fanPct) * 10) / 10 : question.options.length;
      return { id: opt.id, fanCount: fans, fanPct: Math.round(fanPct * 100), multiplier: Math.max(1.1, multiplier) };
    });

    // Persist updated multipliers + fan counts to DB (so scoring uses live values)
    for (const opt of updatedOptions) {
      await this.prisma.questionOption.update({
        where: { id: opt.id },
        data: { multiplier: opt.multiplier, fanCount: opt.fanCount },
      });
    }

    return { prediction, updatedOptions };
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
