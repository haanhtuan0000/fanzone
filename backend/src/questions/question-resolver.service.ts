import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ScoringService } from '../predictions/scoring.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { FeedService } from '../feed/feed.service';
import { ApiFootballService } from '../common/api-football/api-football.service';

interface MatchEvent {
  type: string;
  detail?: string;
  player?: { name: string };
  team?: { name: string; id?: number };
  time?: { elapsed: number };
}

interface MatchStats {
  possession?: { home: string; away: string };
  shots?: { home: number; away: number };
  yellowCards?: { home: number; away: number };
  redCards?: { home: number; away: number };
  corners?: { home: number; away: number };
  substitutions?: { home: number; away: number };
}

@Injectable()
export class QuestionResolverService {
  private readonly logger = new Logger(QuestionResolverService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private scoringService: ScoringService,
    private ws: WebsocketGateway,
    private feedService: FeedService,
    private apiFootball: ApiFootballService,
  ) {}

  // ─── Event-based resolution ───

  async tryResolveFromEvent(
    fixtureId: number,
    event: MatchEvent,
    teams: { home: string; away: string },
  ): Promise<boolean> {
    // Check both OPEN and LOCKED questions — LOCKED ones are waiting for this event
    const openQuestions = await this.prisma.question.findMany({
      where: { fixtureId, status: { in: ['OPEN', 'LOCKED'] } },
      include: { options: true },
    });

    if (openQuestions.length === 0) return false;

    // Pre-warm template code cache
    await this.warmTemplateCache(openQuestions);

    let resolved = false;
    for (const question of openQuestions) {
      const correctOptionId = this.determineCorrectOption(question, event, teams);
      if (!correctOptionId) continue;

      await this.resolveQuestion(fixtureId, question, correctOptionId, `${event.type}/${event.detail}`);
      resolved = true;
    }

    return resolved;
  }

  // ─── Half-time resolution ───

  async onHalfTime(
    fixtureId: number,
    teams: { home: string; away: string },
    score: { home: number; away: number },
  ) {
    this.logger.log(`Half-time for fixture ${fixtureId}: ${score.home}-${score.away}`);

    // Fetch HT stats for stat-based questions
    let stats: MatchStats | null = null;
    try {
      const rawStats = await this.apiFootball.getFixtureStatistics(fixtureId);
      stats = this.parseStats(rawStats as any[]);
    } catch (e) {
      this.logger.warn(`Failed to fetch HT stats for ${fixtureId}: ${e}`);
    }

    // Resolve OPEN/LOCKED + close PENDING 1H questions (don't let them leak into 2H)
    const htQuestions = await this.prisma.question.findMany({
      where: { fixtureId, status: { in: ['OPEN', 'LOCKED', 'PENDING'] } },
      include: { options: true },
    });

    // Pre-warm template code cache
    await this.warmTemplateCache(htQuestions);

    for (const question of htQuestions) {
      if (question.status === 'PENDING') {
        // Close dangling PENDING 1H questions — they're stale after HT
        await this.prisma.question.updateMany({
          where: { id: question.id, status: 'PENDING' },
          data: { status: 'CLOSED' },
        });
        continue;
      }
      const correctOptionId = this.resolveAtHalfTime(question, teams, score, stats);
      if (correctOptionId) {
        await this.resolveQuestion(fixtureId, question, correctOptionId, 'HALF_TIME');
      }
    }
  }

  // ─── Full-time resolution ───

  async onFullTime(
    fixtureId: number,
    teams: { home: string; away: string },
    score: { home: number; away: number },
    stoppageMinutes?: number,
  ) {
    this.logger.log(`Full-time for fixture ${fixtureId}: ${score.home}-${score.away}`);

    // Fetch final stats (1 API call)
    let stats: MatchStats | null = null;
    try {
      const rawStats = await this.apiFootball.getFixtureStatistics(fixtureId);
      stats = this.parseStats(rawStats as any[]);
    } catch (e) {
      this.logger.warn(`Failed to fetch final stats for ${fixtureId}: ${e}`);
    }

    // Fetch match events for event-dependent resolution (goals in stoppage, first scorer, etc.)
    let events: MatchEvent[] = [];
    try {
      const cachedEvents = await this.redis.getJson<any[]>(`cache:fixture:${fixtureId}:events`);
      events = (cachedEvents ?? await this.apiFootball.getFixtureEvents(fixtureId)) as MatchEvent[];
    } catch (e) {
      this.logger.warn(`Failed to fetch events for ${fixtureId}: ${e}`);
    }

    // Resolve all remaining questions (OPEN, LOCKED waiting for result, and PENDING)
    const openQuestions = await this.prisma.question.findMany({
      where: { fixtureId, status: { in: ['OPEN', 'LOCKED', 'PENDING'] } },
      include: { options: true },
    });

    // Pre-warm template code cache for all questions at once
    await this.warmTemplateCache(openQuestions);

    for (const question of openQuestions) {
      let correctOptionId = this.resolveAtFullTime(question, teams, score, stats, events, stoppageMinutes);

      if (!correctOptionId) {
        correctOptionId = this.findDefaultOption(question.options);
      }

      if (correctOptionId) {
        await this.resolveQuestion(fixtureId, question, correctOptionId, 'FULL_TIME');
      } else {
        await this.prisma.question.update({
          where: { id: question.id },
          data: { status: 'CLOSED' },
        });
      }
    }

    // Create system feed event
    await this.feedService.createFeedEvent({
      fixtureId,
      type: 'SYSTEM',
      message: `Full time! ${teams.home} ${score.home}-${score.away} ${teams.away}|Kết thúc! ${teams.home} ${score.home}-${score.away} ${teams.away}`,
    });
  }

  // ─── Expired answer windows ───

  /**
   * When a question's answer window expires (closesAt < now):
   * - Move it to LOCKED (waiting for match event / FT to resolve)
   * - Open the next PENDING question immediately
   * The LOCKED question will be resolved later by tryResolveFromEvent(),
   * onHalfTime(), or onFullTime().
   */
  async lockExpiredQuestions(fixtureId: number) {
    const expired = await this.prisma.question.findMany({
      where: {
        fixtureId,
        status: 'OPEN',
        closesAt: { lt: new Date() },
      },
    });

    for (const question of expired) {
      const locked = await this.prisma.question.updateMany({
        where: { id: question.id, status: 'OPEN' },
        data: { status: 'LOCKED' },
      });

      if (locked.count > 0) {
        this.logger.log(`Locked question "${question.text}" — waiting for result`);

        // Open next pending question so the user always has something to predict
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

  // ─── Core resolve helper ───

  private async resolveQuestion(
    fixtureId: number,
    question: any,
    correctOptionId: string,
    trigger: string,
  ) {
    this.logger.log(`Resolving "${question.text}" (${question.id}) — trigger: ${trigger}`);

    // ── Race-safe: only update if question is still OPEN/LOCKED/PENDING ──
    const updated = await this.prisma.question.updateMany({
      where: { id: question.id, status: { in: ['OPEN', 'LOCKED', 'PENDING'] } },
      data: { status: 'RESOLVED', correctOptionId },
    });

    if (updated.count === 0) {
      this.logger.warn(
        `Skipping "${question.text}" (${question.id}) — already resolved by another process`,
      );
      return;
    }

    await this.prisma.questionOption.update({
      where: { id: correctOptionId },
      data: { isCorrect: true },
    });

    // ── Score predictions (critical — wrap in try/catch) ──
    let results: any[] = [];
    try {
      results = await this.scoringService.scoreQuestion(question.id, correctOptionId);
    } catch (e) {
      this.logger.error(`Failed to score question ${question.id}: ${e}`);
    }

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
    try {
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
    } catch (e) {
      this.logger.error(`Failed to broadcast result for ${question.id}: ${e}`);
    }

    // Feed event
    try {
      const correctOption = question.options.find((o: any) => o.id === correctOptionId);
      await this.feedService.createFeedEvent({
        fixtureId,
        type: 'SYSTEM',
        message: `Result: "${question.text}" → ${correctOption?.name ?? 'N/A'}|Kết quả: "${question.text}" → ${correctOption?.name ?? 'N/A'}`,
      });
    } catch (e) {
      this.logger.error(`Failed to create feed event for ${question.id}: ${e}`);
    }
  }

  // ─── Event-based matching (real-time during match) ───

  private determineCorrectOption(
    question: any,
    event: MatchEvent,
    teams: { home: string; away: string },
  ): string | null {
    const eventType = event.type?.toLowerCase();
    const options: any[] = question.options;
    const tpl = this.getTemplateCode(question);

    // ── Q001: "Who scores next?" → resolve on goal event ──
    if (tpl === 'Q001' && eventType === 'goal') {
      // Try to match by player name first
      const playerName = event.player?.name;
      if (playerName) {
        const playerOption = options.find((o) =>
          o.name.toLowerCase().includes(playerName.toLowerCase()),
        );
        if (playerOption) return playerOption.id;
      }
      // Fall back to "other player"
      return options.find((o) =>
        o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'),
      )?.id ?? null;
    }

    // ── Q004: "Header or foot?" → resolve on goal with detail ──
    if (tpl === 'Q004' && eventType === 'goal') {
      const detail = event.detail?.toLowerCase() ?? '';
      if (detail.includes('header')) {
        return options.find((o) => o.name.toLowerCase().includes('đầu') || o.name.toLowerCase().includes('header'))?.id ?? null;
      }
      if (detail.includes('own goal')) {
        return options.find((o) => o.name.toLowerCase().includes('phản') || o.name.toLowerCase().includes('own'))?.id ?? null;
      }
      // Default to "strong foot"
      return options.find((o) => o.name.toLowerCase().includes('thuận') || o.name.toLowerCase().includes('strong'))?.id ?? null;
    }

    // ── Q005/Q008: "Who scores first?" → resolve on first goal event ──
    if ((tpl === 'Q005' || tpl === 'Q008') && eventType === 'goal') {
      const beneficiary = this.goalBeneficiary(event, teams);
      if (!beneficiary) return null;
      return this.findOptionByTeamName(options, beneficiary) ?? null;
    }

    // ── Q010: "Red card in match?" → resolve on red card event ──
    if (tpl === 'Q010' && eventType === 'card') {
      const detail = event.detail?.toLowerCase() ?? '';
      if (detail.includes('red') || detail.includes('second yellow')) {
        const cardTeam = event.team?.name;
        if (cardTeam) return this.findOptionByTeamName(options, cardTeam) ?? null;
        return this.findYesOption(options);
      }
      return null;
    }

    // ── Q019: "VAR overturn?" → resolve on VAR result ──
    if (tpl === 'Q019' && eventType === 'var') {
      const overturned = event.detail?.toLowerCase().includes('cancelled') ||
        event.detail?.toLowerCase().includes('overturned') ||
        event.detail?.toLowerCase().includes('goal disallowed');
      return this.findYesNoOption(options, overturned ?? false);
    }

    // ── Q020: "Penalty awarded?" → resolve on penalty event ──
    if (tpl === 'Q020' && eventType === 'goal') {
      const detail = event.detail?.toLowerCase() ?? '';
      if (detail.includes('penalty')) {
        const penTeam = event.team?.name;
        if (penTeam) return this.findOptionByTeamName(options, penTeam) ?? null;
        return this.findYesOption(options);
      }
      return null;
    }

    // ── Q022: "Which team substitutes first?" → resolve on subst event ──
    if (tpl === 'Q022' && eventType === 'subst') {
      const subTeam = event.team?.name;
      if (!subTeam) return null;
      return this.findOptionByTeamName(options, subTeam) ?? null;
    }

    // ── Generic category-based fallback for questions without templateId ──
    return this.determineByCategory(question, event, teams);
  }

  /**
   * Fallback for questions that don't have a templateId set.
   * Uses category + event type matching.
   */
  private determineByCategory(
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
        const scoringTeam = event.team?.name;
        if (!scoringTeam) return null;
        return this.findOptionByTeamName(options, scoringTeam) ?? null;
      }

      case 'CARD': {
        if (eventType !== 'card') return null;
        const cardTeam = event.team?.name;
        if (!cardTeam) return null;
        const yesOption = this.findOptionByTeamName(options, cardTeam);
        if (yesOption) return yesOption;
        return this.findYesOption(options);
      }

      case 'CORNER': {
        if (eventType !== 'corner') return null;
        const cornerTeam = event.team?.name;
        if (!cornerTeam) return null;
        return this.findOptionByTeamName(options, cornerTeam) ?? null;
      }

      case 'SUB':
      case 'SUBSTITUTION': {
        if (eventType !== 'subst') return null;
        const subTeam = event.team?.name;
        if (!subTeam) return null;
        return this.findOptionByTeamName(options, subTeam) ?? null;
      }

      case 'VAR': {
        if (eventType !== 'var') return null;
        const overturned = event.detail?.toLowerCase().includes('cancelled') ||
          event.detail?.toLowerCase().includes('overturned') ||
          event.detail?.toLowerCase().includes('goal disallowed');
        return this.findYesNoOption(options, overturned ?? false);
      }

      default:
        return null;
    }
  }

  // ─── Half-time resolution logic ───

  private resolveAtHalfTime(
    question: any,
    teams: { home: string; away: string },
    score: { home: number; away: number },
    stats: MatchStats | null,
  ): string | null {
    const options: any[] = question.options;
    const tpl = this.getTemplateCode(question);

    // Q005: "Who scores first?" — still 0-0 at HT means no goals in first half
    if (tpl === 'Q005' && score.home === 0 && score.away === 0) {
      // Don't resolve yet — still a chance in 2H. Only resolve "no goals" at FT.
      return null;
    }

    // Q015: "Total corners this half?" — resolve with HT stats
    if (tpl === 'Q015' && stats?.corners) {
      const totalCorners = (stats.corners.home ?? 0) + (stats.corners.away ?? 0);
      return this.findRangeOption(options, totalCorners);
    }

    // Q017: "Which team has more corners?" — resolve if asked about first half
    if (tpl === 'Q017' && stats?.corners) {
      if (stats.corners.home > stats.corners.away) {
        return this.findOptionByTeamName(options, teams.home) ?? null;
      } else if (stats.corners.away > stats.corners.home) {
        return this.findOptionByTeamName(options, teams.away) ?? null;
      }
      return options.find((o) =>
        o.name.toLowerCase().includes('bằng') || o.name.toLowerCase().includes('equal'),
      )?.id ?? null;
    }

    // Questions asked in first half with TIMEOUT_DEFAULT — let lockExpiredQuestions handle

    return null;
  }

  // ─── Full-time resolution logic ───

  private resolveAtFullTime(
    question: any,
    teams: { home: string; away: string },
    score: { home: number; away: number },
    stats: MatchStats | null,
    events: MatchEvent[],
    stoppageMinutes?: number,
  ): string | null {
    const options: any[] = question.options;
    const tpl = this.getTemplateCode(question);

    // ── Q005: "Who scores first?" ──
    if (tpl === 'Q005') {
      if (score.home === 0 && score.away === 0) {
        return this.findNoOption(options);
      }
      // Find first goal event to determine who scored first (own goals count for opponent)
      const firstGoal = events.find((e) => e.type?.toLowerCase() === 'goal');
      if (firstGoal) {
        const beneficiary = this.goalBeneficiary(firstGoal, teams);
        if (beneficiary) return this.findOptionByTeamName(options, beneficiary) ?? null;
      }
      return null;
    }

    // ── Q002: "When will the next goal be scored?" ──
    if (tpl === 'Q002') {
      const questionMinute = question.matchMinute ?? 0;
      const nextGoal = events.find(
        (e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) > questionMinute,
      );
      if (nextGoal?.time?.elapsed) {
        return this.findRangeOption(options, nextGoal.time.elapsed);
      }
      // No goal after question — pick last option (usually latest range)
      return options.length > 0 ? options[options.length - 1].id : null;
    }

    // ── Q006: "Final score?" ──
    if (tpl === 'Q006') {
      const scoreStr = `${score.home}-${score.away}`;
      const option = options.find((o) => o.name.includes(scoreStr));
      if (option) return option.id;
      return options.find((o) =>
        o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'),
      )?.id ?? null;
    }

    // ── Q007: "Stoppage time goal?" ──
    if (tpl === 'Q007') {
      const stoppageGoals = events.filter(
        (e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) > 90,
      );
      if (stoppageGoals.length > 0) {
        // Determine who actually benefited from the goal (own goals count for opponent)
        const beneficiary = this.goalBeneficiary(stoppageGoals[0], teams);
        if (beneficiary) {
          const scoreAt90 = this.reconstructScoreAtMinute(events, 90, teams);
          const beneficiaryIsHome = beneficiary === teams.home;
          const wasLeading = beneficiaryIsHome
            ? scoreAt90.home > scoreAt90.away
            : scoreAt90.away > scoreAt90.home;
          const wasTrailing = beneficiaryIsHome
            ? scoreAt90.home < scoreAt90.away
            : scoreAt90.away < scoreAt90.home;

          if (wasLeading) {
            return options.find((o) =>
              o.name.toLowerCase().includes('dẫn') || o.name.toLowerCase().includes('leading'),
            )?.id ?? null;
          } else if (wasTrailing) {
            return options.find((o) =>
              o.name.toLowerCase().includes('thua') || o.name.toLowerCase().includes('trailing'),
            )?.id ?? null;
          }
          // Tied at 90' — pick whichever "yes" option matches team name, or first "yes"
          return this.findOptionByTeamName(options, beneficiary) ?? this.findYesOption(options);
        }
      }
      return this.findNoOption(options);
    }

    // ── Q008: "Who scores first in 2H?" ──
    if (tpl === 'Q008') {
      const secondHalfGoal = events.find(
        (e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) >= 46,
      );
      if (secondHalfGoal) {
        const beneficiary = this.goalBeneficiary(secondHalfGoal, teams);
        if (beneficiary) return this.findOptionByTeamName(options, beneficiary) ?? null;
      }
      // No one scored — match "nobody before 65" or "no" option
      return this.findNoOption(options);
    }

    // ── Q010: "Red card in the match?" ──
    if (tpl === 'Q010') {
      if (stats?.redCards) {
        if ((stats.redCards.home ?? 0) > 0) {
          return this.findOptionByTeamName(options, teams.home) ?? null;
        }
        if ((stats.redCards.away ?? 0) > 0) {
          return this.findOptionByTeamName(options, teams.away) ?? null;
        }
      }
      // Check events as fallback
      const redEvent = events.find((e) => {
        const detail = e.detail?.toLowerCase() ?? '';
        return e.type?.toLowerCase() === 'card' && (detail.includes('red') || detail.includes('second yellow'));
      });
      if (redEvent?.team?.name) {
        return this.findOptionByTeamName(options, redEvent.team.name) ?? null;
      }
      return this.findNoOption(options);
    }

    // ── Q011: "How many more yellow cards?" ──
    // The question asks cards from when it was asked until end of match
    if (tpl === 'Q011' && stats?.yellowCards) {
      const questionMinute = question.matchMinute ?? 75;
      const cardsAfterQuestion = events.filter(
        (e) =>
          e.type?.toLowerCase() === 'card' &&
          (e.detail?.toLowerCase().includes('yellow') ?? false) &&
          (e.time?.elapsed ?? 0) > questionMinute,
      ).length;
      return this.findRangeOption(options, cardsAfterQuestion);
    }

    // ── Q015: "Total corners this half?" ──
    // At FT, stats are full-match totals. For questions asked in 2H,
    // we need only the 2H corners (total minus 1H corners from events).
    if (tpl === 'Q015' && stats?.corners) {
      const totalMatchCorners = (stats.corners.home ?? 0) + (stats.corners.away ?? 0);
      const questionPhase = question.matchPhase ?? '';
      if (questionPhase.includes('H2') || questionPhase === 'LATE_H2' || (question.matchMinute ?? 0) >= 46) {
        // Count only 2H corners: total minus 1H corners from events
        const firstHalfCorners = events.filter(
          (e) => e.type?.toLowerCase() === 'corner' && (e.time?.elapsed ?? 0) <= 45,
        ).length;
        return this.findRangeOption(options, totalMatchCorners - firstHalfCorners);
      }
      return this.findRangeOption(options, totalMatchCorners);
    }

    // ── Q017: "Which team has more corners?" ──
    if (tpl === 'Q017' && stats?.corners) {
      if (stats.corners.home > stats.corners.away) {
        return this.findOptionByTeamName(options, teams.home) ?? null;
      } else if (stats.corners.away > stats.corners.home) {
        return this.findOptionByTeamName(options, teams.away) ?? null;
      }
      return options.find((o) =>
        o.name.toLowerCase().includes('bằng') || o.name.toLowerCase().includes('equal'),
      )?.id ?? null;
    }

    // ── Q020: "Penalty awarded?" ──
    if (tpl === 'Q020') {
      const penEvent = events.find((e) => {
        const detail = e.detail?.toLowerCase() ?? '';
        return e.type?.toLowerCase() === 'goal' && detail.includes('penalty');
      });
      if (penEvent?.team?.name) {
        return this.findOptionByTeamName(options, penEvent.team.name) ?? null;
      }
      return this.findNoOption(options);
    }

    // ── Q023: "Total subs in 2H?" ──
    if (tpl === 'Q023') {
      const secondHalfSubs = events.filter(
        (e) => e.type?.toLowerCase() === 'subst' && (e.time?.elapsed ?? 0) >= 46,
      ).length;
      return this.findRangeOption(options, secondHalfSubs);
    }

    // ── Q025: "When is the next sub?" ──
    if (tpl === 'Q025') {
      const questionMinute = question.matchMinute ?? 55;
      const nextSub = events.find(
        (e) => e.type?.toLowerCase() === 'subst' && (e.time?.elapsed ?? 0) > questionMinute,
      );
      if (nextSub?.time?.elapsed) {
        return this.findRangeOption(options, nextSub.time.elapsed);
      }
      // No sub happened — pick last range option (usually "after 80")
      return options.length > 0 ? options[options.length - 1].id : null;
    }

    // ── Q026: "Stoppage time minutes?" ──
    if (tpl === 'Q026' && stoppageMinutes != null) {
      return this.findRangeOption(options, stoppageMinutes);
    }

    // ── Q027: "Goal in stoppage time?" ──
    if (tpl === 'Q027') {
      const stoppageGoal = events.some(
        (e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) > 90,
      );
      return this.findYesNoOption(options, stoppageGoal);
    }

    // ── Q028: "Possession leader?" ──
    if (tpl === 'Q028' && stats?.possession) {
      const homePoss = parseInt(stats.possession.home) || 50;
      const awayPoss = parseInt(stats.possession.away) || 50;
      if (homePoss > 55) return this.findOptionByTeamName(options, teams.home) ?? null;
      if (awayPoss > 55) return this.findOptionByTeamName(options, teams.away) ?? null;
      return options.find((o) =>
        o.name.toLowerCase().includes('cân bằng') || o.name.toLowerCase().includes('balanced'),
      )?.id ?? null;
    }

    // ── Q029: "Total shots?" ──
    if (tpl === 'Q029' && stats?.shots) {
      const totalShots = (stats.shots.home ?? 0) + (stats.shots.away ?? 0);
      return this.findRangeOption(options, totalShots);
    }

    // ── Q030: "Turning point after HT?" ──
    // Compare 2H event counts/goals to determine momentum shift
    if (tpl === 'Q030') {
      return this.resolveMomentum(options, events, teams);
    }

    // ── Fallback: text-based matching for questions without template code ──
    return this.resolveByTextFallback(question, teams, score, stats, stoppageMinutes);
  }

  /**
   * Q030: Determine which team had more 2H momentum by counting
   * 2H goals + shots on target + corners as a proxy.
   */
  private resolveMomentum(
    options: any[],
    events: MatchEvent[],
    teams: { home: string; away: string },
  ): string | null {
    let homeActions = 0;
    let awayActions = 0;

    for (const e of events) {
      if ((e.time?.elapsed ?? 0) < 46) continue;
      const type = e.type?.toLowerCase();
      if (!type) continue;

      const isHome = e.team?.name === teams.home;
      const isAway = e.team?.name === teams.away;

      if (type === 'goal') {
        if (isHome) homeActions += 3;
        if (isAway) awayActions += 3;
      } else if (type === 'corner' || type === 'shot') {
        if (isHome) homeActions += 1;
        if (isAway) awayActions += 1;
      }
    }

    const diff = homeActions - awayActions;
    if (diff >= 2) return this.findOptionByTeamName(options, teams.home) ?? null;
    if (diff <= -2) return this.findOptionByTeamName(options, teams.away) ?? null;

    return options.find((o) =>
      o.name.toLowerCase().includes('không') ||
      o.name.toLowerCase().includes('no clear'),
    )?.id ?? null;
  }

  /**
   * Reconstruct score at a given minute from goal events.
   * Handles own goals: API-Football lists own goals under the team that
   * made the mistake, but the goal counts for the opponent.
   */
  private reconstructScoreAtMinute(
    events: MatchEvent[],
    minute: number,
    teams: { home: string; away: string },
  ): { home: number; away: number } {
    let home = 0;
    let away = 0;

    for (const e of events) {
      if (e.type?.toLowerCase() !== 'goal') continue;
      if ((e.time?.elapsed ?? 999) > minute) continue; // don't break — events may not be sorted

      const beneficiary = this.goalBeneficiary(e, teams);
      if (beneficiary === teams.home) home++;
      else if (beneficiary === teams.away) away++;
    }

    return { home, away };
  }

  /**
   * Determine which team benefits from a goal event.
   * Own goals benefit the opponent of the team listed in the event.
   */
  private goalBeneficiary(
    event: MatchEvent,
    teams: { home: string; away: string },
  ): string | null {
    const eventTeam = event.team?.name;
    if (!eventTeam) return null;

    const isOwnGoal = event.detail?.toLowerCase().includes('own goal');
    if (isOwnGoal) {
      // Own goal — benefit goes to the OTHER team
      return eventTeam === teams.home ? teams.away : teams.home;
    }
    return eventTeam;
  }

  /**
   * Legacy text-based fallback for questions that don't have templateId.
   */
  private resolveByTextFallback(
    question: any,
    teams: { home: string; away: string },
    score: { home: number; away: number },
    stats: MatchStats | null,
    stoppageMinutes?: number,
  ): string | null {
    const options: any[] = question.options;
    const text = question.text?.toLowerCase() ?? '';
    const category = question.category;

    // Final score
    if (category === 'GOAL' && (text.includes('cuối trận') || text.includes('final score') || text.includes('tỷ số'))) {
      const scoreStr = `${score.home}-${score.away}`;
      const option = options.find((o) => o.name.includes(scoreStr));
      if (option) return option.id;
      return options.find((o) =>
        o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'),
      )?.id ?? null;
    }

    // Possession
    if (category === 'STAT' && stats?.possession && (text.includes('kiểm soát') || text.includes('possession'))) {
      const homePoss = parseInt(stats.possession.home) || 50;
      const awayPoss = parseInt(stats.possession.away) || 50;
      if (homePoss > 55) return this.findOptionByTeamName(options, teams.home) ?? null;
      if (awayPoss > 55) return this.findOptionByTeamName(options, teams.away) ?? null;
      return options.find((o) =>
        o.name.toLowerCase().includes('cân bằng') || o.name.toLowerCase().includes('balanced'),
      )?.id ?? null;
    }

    // Shots
    if (category === 'STAT' && stats?.shots && (text.includes('cú sút') || text.includes('shots'))) {
      const totalShots = (stats.shots.home ?? 0) + (stats.shots.away ?? 0);
      return this.findRangeOption(options, totalShots);
    }

    // Corners total
    if (category === 'CORNER' && stats?.corners && (text.includes('tổng') || text.includes('total'))) {
      const totalCorners = (stats.corners.home ?? 0) + (stats.corners.away ?? 0);
      return this.findRangeOption(options, totalCorners);
    }

    // Stoppage time
    if (category === 'TIME' && stoppageMinutes != null && (text.includes('bù') || text.includes('stoppage'))) {
      return this.findRangeOption(options, stoppageMinutes);
    }

    return null;
  }

  // ─── Helper: get template code from question ───

  /**
   * Look up the template code (e.g. "Q001") for a question.
   * Uses an in-memory cache to avoid repeated DB lookups.
   */
  private templateCodeCache = new Map<string, string>();

  private async getTemplateCodeAsync(templateId: string): Promise<string | null> {
    if (!templateId) return null;

    const cached = this.templateCodeCache.get(templateId);
    if (cached) return cached;

    const template = await this.prisma.questionTemplate.findUnique({
      where: { id: templateId },
      select: { code: true },
    });

    if (template?.code) {
      this.templateCodeCache.set(templateId, template.code);
      return template.code;
    }
    return null;
  }

  private getTemplateCode(question: any): string | null {
    // Synchronous check — works after warmTemplateCache has been called.
    if (!question.templateId) return null;
    return this.templateCodeCache.get(question.templateId) ?? null;
  }

  /**
   * Load template codes for all questions in a single DB query.
   */
  private async warmTemplateCache(questions: any[]): Promise<void> {
    const uncachedIds = questions
      .map((q) => q.templateId)
      .filter((id): id is string => !!id && !this.templateCodeCache.has(id));

    if (uncachedIds.length === 0) return;

    const templates = await this.prisma.questionTemplate.findMany({
      where: { id: { in: [...new Set(uncachedIds)] } },
      select: { id: true, code: true },
    });

    for (const t of templates) {
      this.templateCodeCache.set(t.id, t.code);
    }
  }

  // ─── Option-finding helpers ───

  private findOptionByTeamName(options: any[], teamName: string): string | undefined {
    return options.find((o) =>
      teamName.toLowerCase().includes(o.name.toLowerCase()) ||
      o.name.toLowerCase().includes(teamName.toLowerCase()),
    )?.id;
  }

  private findYesOption(options: any[]): string | null {
    return options.find((o) =>
      o.name.toLowerCase().startsWith('có') ||
      o.name.toLowerCase().startsWith('co') ||
      o.name.toLowerCase().startsWith('yes'),
    )?.id ?? null;
  }

  private findYesNoOption(options: any[], isYes: boolean): string | null {
    if (isYes) return this.findYesOption(options);
    return this.findNoOption(options);
  }

  private findNoOption(options: any[]): string | null {
    return options.find((o) =>
      o.name.toLowerCase().startsWith('không') ||
      o.name.toLowerCase().startsWith('khong') ||
      o.name.toLowerCase().startsWith('no ') ||
      o.name.toLowerCase() === 'no',
    )?.id ?? null;
  }

  private findDefaultOption(options: any[]): string | null {
    const noOption = this.findNoOption(options);
    if (noOption) return noOption;
    return options.length > 0 ? options[options.length - 1].id : null;
  }

  private findRangeOption(options: any[], value: number): string | null {
    for (const o of options) {
      const name = o.name.toLowerCase();

      // "Under X" / "Dưới X" / "Ít hơn X"
      const underMatch = name.match(/(?:under|dưới|ít hơn|less than)\s*(\d+)/);
      if (underMatch && value < parseInt(underMatch[1])) return o.id;

      // "X+" / "X trở lên" / "Over X"
      const overMatch = name.match(/(\d+)\s*(?:\+|trở lên|over)/i) || name.match(/(?:over|trên)\s*(\d+)/);
      if (overMatch && value >= parseInt(overMatch[1])) return o.id;

      // "X-Y" range
      const rangeMatch = name.match(/(\d+)\s*[-–]\s*(\d+)/);
      if (rangeMatch) {
        const low = parseInt(rangeMatch[1]);
        const high = parseInt(rangeMatch[2]);
        if (value >= low && value <= high) return o.id;
      }

      // Exact number "X phút" / "X cards"
      const exactMatch = name.match(/^(\d+)/);
      if (exactMatch && !rangeMatch && !overMatch && !underMatch) {
        if (value === parseInt(exactMatch[1])) return o.id;
      }
    }

    // Fall back to last option (usually "other")
    return options.length > 0 ? options[options.length - 1].id : null;
  }

  private parseStats(stats: any[]): MatchStats {
    const result: MatchStats = {};
    if (!stats || stats.length < 2) return result;

    const findStat = (team: any[], type: string) =>
      team?.find((s: any) => s.type === type)?.value;

    const home = stats[0]?.statistics;
    const away = stats[1]?.statistics;

    result.possession = {
      home: findStat(home, 'Ball Possession') ?? '50%',
      away: findStat(away, 'Ball Possession') ?? '50%',
    };
    result.shots = {
      home: parseInt(findStat(home, 'Total Shots')) || 0,
      away: parseInt(findStat(away, 'Total Shots')) || 0,
    };
    result.yellowCards = {
      home: parseInt(findStat(home, 'Yellow Cards')) || 0,
      away: parseInt(findStat(away, 'Yellow Cards')) || 0,
    };
    result.redCards = {
      home: parseInt(findStat(home, 'Red Cards')) || 0,
      away: parseInt(findStat(away, 'Red Cards')) || 0,
    };
    result.corners = {
      home: parseInt(findStat(home, 'Corner Kicks')) || 0,
      away: parseInt(findStat(away, 'Corner Kicks')) || 0,
    };
    result.substitutions = {
      home: parseInt(findStat(home, 'Substitutions')) || 0,
      away: parseInt(findStat(away, 'Substitutions')) || 0,
    };

    return result;
  }
}
