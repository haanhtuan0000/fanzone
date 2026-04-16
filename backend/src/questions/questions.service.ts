import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';

/**
 * Matches a template placeholder like `{home_striker}`: left brace, at least
 * one ASCII letter/underscore/digit, right brace. Deliberately strict so
 * unrelated brace-containing UI text (emoji sequences, translations that use
 * curly quotes, score formats like "1-0") never false-positives.
 */
const UNRESOLVED_PLACEHOLDER = /\{[A-Za-z_][A-Za-z0-9_]*\}/;

function assertNoUnresolvedPlaceholder(field: string, value: string): void {
  if (UNRESOLVED_PLACEHOLDER.test(value)) {
    throw new Error(
      `createQuestion: unresolved placeholder in ${field}: ${value}`,
    );
  }
}

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getActiveQuestions(fixtureId: number) {
    let openQuestion = await this.prisma.question.findFirst({
      where: { fixtureId, status: 'OPEN' },
      include: { options: true },
      orderBy: { opensAt: 'desc' },
    });

    // Auto-close expired OPEN questions
    if (openQuestion && openQuestion.closesAt < new Date()) {
      this.logger.log(`[${fixtureId}] Question expired: "${openQuestion.text.substring(0, 30)}..." — locking`);
      await this.prisma.question.update({
        where: { id: openQuestion.id },
        data: { status: 'LOCKED' },
      });
      openQuestion = null;
    }

    // If no OPEN question, check if next PENDING question's opensAt has arrived
    if (!openQuestion) {
      const nextPending = await this.prisma.question.findFirst({
        where: { fixtureId, status: 'PENDING' },
        orderBy: { opensAt: 'asc' },
      });
      if (nextPending && nextPending.opensAt <= new Date()) {
        const now = new Date();
        const windowMs = nextPending.closesAt.getTime() - nextPending.opensAt.getTime();
        openQuestion = await this.prisma.question.update({
          where: { id: nextPending.id },
          data: { status: 'OPEN', opensAt: now, closesAt: new Date(now.getTime() + windowMs) },
          include: { options: true },
        });
        this.logger.log(`[${fixtureId}] Opened next question: "${openQuestion.text.substring(0, 30)}..."`);
      }
    }

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

    // Enrich open question with fan percentages from Redis.
    // Build as a new value (not a mutation) so the enriched option shape
    // — with fanCount and fanPct — survives in the return type, not hidden
    // behind `as any`. Callers (and this service's own spec) rely on those
    // fields being visible on `active.options[i]`.
    type NonNullOpen = NonNullable<typeof openQuestion>;
    type EnrichedActive = Omit<NonNullOpen, 'options'> & {
      options: Array<NonNullOpen['options'][number] & { fanCount: number; fanPct: number }>;
    };
    let activeQuestion: EnrichedActive | null = null;
    if (openQuestion) {
      const fanData = await this.redis.hgetall(`question:${openQuestion.id}:fans`);
      const totalFans = Object.values(fanData).reduce((sum, v) => sum + parseInt(v || '0'), 0);
      activeQuestion = {
        ...openQuestion,
        options: openQuestion.options.map((opt) => ({
          ...opt,
          fanCount: parseInt(fanData[opt.id] || '0'),
          fanPct: totalFans > 0 ? Math.round((parseInt(fanData[opt.id] || '0') / totalFans) * 100) : 0,
        })),
      };
    }

    // Recently resolved + voided questions (for showing results)
    const resolved = await this.prisma.question.findMany({
      where: { fixtureId, status: { in: ['RESOLVED', 'VOIDED'] } },
      include: { options: true },
      orderBy: { closesAt: 'desc' },
      take: 10,
    });

    // Estimate next question time when no upcoming and no open question
    let nextEstimatedAt: string | null = null;
    if (upcomingQuestions.length === 0 && !activeQuestion) {
      const latest = await this.prisma.question.findFirst({
        where: { fixtureId },
        orderBy: { opensAt: 'desc' },
        select: { matchMinute: true, opensAt: true },
      });
      if (latest?.matchMinute != null) {
        const phaseBoundaries = [0, 15, 35, 45, 46, 60, 75, 90];
        const estimatedKickoff = latest.opensAt.getTime() - (latest.matchMinute! * 60_000);
        const now = Date.now();
        // Find the next boundary whose wall-clock time is still in the future
        for (const boundary of phaseBoundaries) {
          if (boundary <= latest.matchMinute!) continue;
          const estimatedTime = estimatedKickoff + boundary * 60_000;
          if (estimatedTime > now) {
            nextEstimatedAt = new Date(estimatedTime).toISOString();
            break;
          }
        }
      }
    }

    return { active: activeQuestion, upcoming: upcomingQuestions, pendingResults, resolved, nextEstimatedAt };
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
    // Post-resolution contract: any `{placeholder}` left in the text or an
    // option name / info means the variable resolver failed to substitute it
    // (missing context key, template typo, or a fallback that silently
    // produced raw `{...}` like the Mutondo Stars "striker" bug). Refuse to
    // persist. The engine's createFromTemplate catches this and skips the
    // template; the error surfaces in logs rather than in the UI.
    assertNoUnresolvedPlaceholder('text', data.text);
    for (let i = 0; i < data.options.length; i++) {
      const opt = data.options[i];
      assertNoUnresolvedPlaceholder(`options[${i}].name`, opt.name);
      if (opt.info) assertNoUnresolvedPlaceholder(`options[${i}].info`, opt.info);
    }

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

  async countQuestionsForFixture(fixtureId: number): Promise<number> {
    return this.prisma.question.count({ where: { fixtureId } });
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

  async hasPendingQuestion(fixtureId: number): Promise<boolean> {
    const count = await this.prisma.question.count({
      where: { fixtureId, status: 'PENDING' },
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

  /**
   * Open next PENDING question whose opensAt wall-clock time has arrived.
   */
  async openNextPending(fixtureId: number) {
    const next = await this.prisma.question.findFirst({
      where: { fixtureId, status: 'PENDING', opensAt: { lte: new Date() } },
      orderBy: { opensAt: 'asc' },
    });
    if (next) {
      const now = new Date();
      const windowMs = next.closesAt.getTime() - next.opensAt.getTime();
      return this.prisma.question.update({
        where: { id: next.id },
        data: {
          status: 'OPEN',
          opensAt: now,
          closesAt: new Date(now.getTime() + windowMs),
        },
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
