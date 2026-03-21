import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ScoringService } from '../predictions/scoring.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { FeedService } from '../feed/feed.service';

interface MatchEvent {
  type: string;
  detail?: string;
  player?: { name: string };
  team?: { name: string; id?: number };
  time?: { elapsed: number };
}

@Injectable()
export class QuestionResolverService {
  private readonly logger = new Logger(QuestionResolverService.name);

  constructor(
    private prisma: PrismaService,
    private scoringService: ScoringService,
    private ws: WebsocketGateway,
    private feedService: FeedService,
  ) {}

  /**
   * When a match event arrives, check if any open question can be resolved.
   * Returns true if a question was resolved.
   */
  async tryResolveFromEvent(
    fixtureId: number,
    event: MatchEvent,
    teams: { home: string; away: string },
  ): Promise<boolean> {
    // Find open questions for this fixture
    const openQuestions = await this.prisma.question.findMany({
      where: { fixtureId, status: 'OPEN' },
      include: { options: true },
    });

    if (openQuestions.length === 0) return false;

    for (const question of openQuestions) {
      const correctOptionId = this.determineCorrectOption(question, event, teams);
      if (!correctOptionId) continue;

      this.logger.log(
        `Auto-resolving question "${question.text}" (${question.id}) — event: ${event.type}/${event.detail}`,
      );

      // Mark question resolved
      await this.prisma.question.update({
        where: { id: question.id },
        data: { status: 'RESOLVED', correctOptionId },
      });
      await this.prisma.questionOption.update({
        where: { id: correctOptionId },
        data: { isCorrect: true },
      });

      // Score all predictions
      const results = await this.scoringService.scoreQuestion(question.id, correctOptionId);

      // Open next pending question
      const next = await this.prisma.question.findFirst({
        where: { fixtureId, status: 'PENDING' },
        orderBy: { opensAt: 'asc' },
      });
      if (next) {
        await this.prisma.question.update({
          where: { id: next.id },
          data: { status: 'OPEN' },
        });
      }

      // Broadcast results
      this.ws.emitToMatch(fixtureId, 'prediction_result', {
        questionId: question.id,
        correctOptionId,
        results: results.map((r) => ({
          userId: r.userId,
          isCorrect: r.isCorrect,
          coinsResult: r.coinsResult,
          xpEarned: r.xpEarned,
        })),
      });

      // Create system feed event
      const correctOption = question.options.find((o) => o.id === correctOptionId);
      await this.feedService.createFeedEvent({
        fixtureId,
        type: 'SYSTEM',
        message: `Ket qua: "${question.text}" → ${correctOption?.name ?? 'N/A'}`,
      });

      return true;
    }

    return false;
  }

  /**
   * Match an event to an open question and determine the correct option.
   */
  private determineCorrectOption(
    question: any,
    event: MatchEvent,
    teams: { home: string; away: string },
  ): string | null {
    const eventType = event.type?.toLowerCase();
    const category = question.category;
    const options: any[] = question.options;

    switch (category) {
      case 'GOAL': {
        if (eventType !== 'goal') return null;
        // The scoring team matches an option by name
        const scoringTeam = event.team?.name;
        if (!scoringTeam) return null;

        const teamOption = options.find((o) =>
          scoringTeam.toLowerCase().includes(o.name.toLowerCase()) ||
          o.name.toLowerCase().includes(scoringTeam.toLowerCase()),
        );
        return teamOption?.id ?? null;
      }

      case 'CARD': {
        if (eventType !== 'card') return null;
        if (event.detail === 'Yellow Card') {
          // "Co the vang" type questions
          const yesOption = options.find((o) =>
            o.name.toLowerCase() === 'co' ||
            o.name.toLowerCase().includes(event.team?.name?.toLowerCase() ?? ''),
          );
          return yesOption?.id ?? null;
        }
        if (event.detail === 'Red Card') {
          const teamOption = options.find((o) =>
            o.name.toLowerCase().includes(event.team?.name?.toLowerCase() ?? ''),
          );
          return teamOption?.id ?? null;
        }
        return null;
      }

      case 'CORNER': {
        // Corners are harder to auto-detect from API events
        // Only resolve if we detect a corner event
        if (eventType !== 'corner') return null;
        const teamOption = options.find((o) =>
          o.name.toLowerCase().includes(event.team?.name?.toLowerCase() ?? ''),
        );
        return teamOption?.id ?? null;
      }

      case 'SUBSTITUTION': {
        // "Will the sub score?" — can only resolve on next goal after sub
        // This is complex, skip auto-resolve for now
        return null;
      }

      case 'VAR': {
        if (eventType !== 'var') return null;
        // Check if VAR overturned
        const overturned = event.detail?.toLowerCase().includes('cancelled') ||
          event.detail?.toLowerCase().includes('overturned');
        const correctName = overturned ? 'Co' : 'Khong';
        const option = options.find((o) => o.name.toLowerCase() === correctName.toLowerCase());
        return option?.id ?? null;
      }

      default:
        return null;
    }
  }

  /**
   * Auto-close expired questions (closesAt has passed).
   * Resolves with "no event" option if available, otherwise just closes.
   */
  async closeExpiredQuestions(fixtureId: number) {
    const expired = await this.prisma.question.findMany({
      where: {
        fixtureId,
        status: 'OPEN',
        closesAt: { lt: new Date() },
      },
      include: { options: true },
    });

    for (const question of expired) {
      // Find "no" / "khong" / "khong co" option as default
      const noOption = question.options.find((o) =>
        o.name.toLowerCase().startsWith('khong') ||
        o.name.toLowerCase() === 'no',
      );

      if (noOption) {
        this.logger.log(`Auto-closing expired question "${question.text}" with default: ${noOption.name}`);
        await this.prisma.question.update({
          where: { id: question.id },
          data: { status: 'RESOLVED', correctOptionId: noOption.id },
        });
        await this.prisma.questionOption.update({
          where: { id: noOption.id },
          data: { isCorrect: true },
        });
        await this.scoringService.scoreQuestion(question.id, noOption.id);
      } else {
        // No default option, just close without scoring (refund)
        this.logger.log(`Closing expired question "${question.text}" — no default option, skipping scoring`);
        await this.prisma.question.update({
          where: { id: question.id },
          data: { status: 'CLOSED' },
        });
      }

      // Open next
      const next = await this.prisma.question.findFirst({
        where: { fixtureId, status: 'PENDING' },
        orderBy: { opensAt: 'asc' },
      });
      if (next) {
        await this.prisma.question.update({
          where: { id: next.id },
          data: { status: 'OPEN' },
        });
      }
    }
  }
}
