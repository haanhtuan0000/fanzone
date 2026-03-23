import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getActiveQuestions(fixtureId: number) {
    const openQuestion = await this.prisma.question.findFirst({
      where: { fixtureId, status: 'OPEN' },
      include: { options: true },
      orderBy: { opensAt: 'desc' },
    });

    const upcomingQuestions = await this.prisma.question.findMany({
      where: { fixtureId, status: 'PENDING' },
      include: { options: true },
      orderBy: { opensAt: 'asc' },
      take: 3,
    });

    // Questions waiting for match result (answer window closed, not yet resolved)
    const pendingResults = await this.prisma.question.findMany({
      where: { fixtureId, status: 'LOCKED' },
      include: { options: true },
      orderBy: { closesAt: 'desc' },
      take: 5,
    });

    // Enrich open question with fan percentages from Redis
    if (openQuestion) {
      const fanData = await this.redis.hgetall(`question:${openQuestion.id}:fans`);
      const totalFans = Object.values(fanData).reduce((sum, v) => sum + parseInt(v || '0'), 0);
      openQuestion.options = openQuestion.options.map((opt) => ({
        ...opt,
        fanCount: parseInt(fanData[opt.id] || '0'),
        fanPct: totalFans > 0 ? Math.round((parseInt(fanData[opt.id] || '0') / totalFans) * 100) : 0,
      })) as any;
    }

    // Recently resolved questions (for showing results)
    const resolved = await this.prisma.question.findMany({
      where: { fixtureId, status: 'RESOLVED' },
      include: { options: true },
      orderBy: { closesAt: 'desc' },
      take: 10,
    });

    return { active: openQuestion, upcoming: upcomingQuestions, pendingResults, resolved };
  }

  /**
   * Get all predictions for a user for a specific match.
   * Used by the Predict screen to show answered cards with results.
   */
  async getMatchPredictions(fixtureId: number, userId: string) {
    return this.prisma.prediction.findMany({
      where: { userId, question: { fixtureId } },
      include: {
        question: { include: { options: true } },
        option: true,
      },
      orderBy: { predictedAt: 'desc' },
    });
  }

  async createQuestion(data: {
    fixtureId: number;
    category: string;
    text: string;
    rewardCoins?: number;
    difficulty?: string;
    matchPhase?: string;
    matchMinute?: number;
    templateId?: string;
    triggeredByEvent?: string;
    opensAt: string;
    closesAt: string;
    resolvesAt?: string;
    metadata?: any;
    options: Array<{ name: string; emoji?: string; info?: string; multiplier?: number }>;
  }) {
    const question = await this.prisma.question.create({
      data: {
        fixtureId: data.fixtureId,
        category: data.category as any,
        difficulty: (data.difficulty as any) || undefined,
        matchPhase: (data.matchPhase as any) || undefined,
        matchMinute: data.matchMinute,
        templateId: data.templateId,
        triggeredByEvent: data.triggeredByEvent,
        text: data.text,
        rewardCoins: data.rewardCoins || 50,
        opensAt: new Date(data.opensAt),
        closesAt: new Date(data.closesAt),
        resolvesAt: data.resolvesAt ? new Date(data.resolvesAt) : undefined,
        metadata: data.metadata ?? undefined,
        options: {
          create: data.options.map((opt) => ({
            name: opt.name,
            emoji: opt.emoji,
            info: opt.info,
            multiplier: opt.multiplier ?? (data.options.length > 0 ? data.options.length : 2.0),
          })),
        },
      },
      include: { options: true },
    });

    return question;
  }

  async getTemplateIdsForFixture(fixtureId: number): Promise<string[]> {
    const questions = await this.prisma.question.findMany({
      where: { fixtureId, templateId: { not: null } },
      select: { templateId: true },
      distinct: ['templateId'],
    });
    return questions.map((q) => q.templateId!);
  }

  async hasOpenQuestion(fixtureId: number): Promise<boolean> {
    const count = await this.prisma.question.count({
      where: { fixtureId, status: 'OPEN' },
    });
    return count > 0;
  }

  async openQuestion(questionId: string) {
    return this.prisma.question.update({
      where: { id: questionId },
      data: { status: 'OPEN' },
      include: { options: true },
    });
  }

  async closeQuestion(questionId: string) {
    return this.prisma.question.update({
      where: { id: questionId },
      data: { status: 'CLOSED' },
    });
  }

  async openNextPending(fixtureId: number) {
    const next = await this.prisma.question.findFirst({
      where: { fixtureId, status: 'PENDING' },
      orderBy: { opensAt: 'asc' },
    });
    if (next) {
      return this.prisma.question.update({
        where: { id: next.id },
        data: { status: 'OPEN' },
        include: { options: true },
      });
    }
    return null;
  }

  async getQuestion(questionId: string) {
    return this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    });
  }

  async resolveQuestion(questionId: string, correctOptionId: string) {
    await this.prisma.question.update({
      where: { id: questionId },
      data: {
        status: 'RESOLVED',
        correctOptionId,
      },
    });

    await this.prisma.questionOption.update({
      where: { id: correctOptionId },
      data: { isCorrect: true },
    });

    return this.prisma.prediction.findMany({
      where: { questionId },
      include: { option: true },
    });
  }
}
