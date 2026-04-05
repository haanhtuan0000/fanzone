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
  player?: { name: string; id?: number };
  team?: { name: string; id?: number };
  time?: { elapsed: number; extra?: number | null };
}

interface MatchStats {
  possession?: { home: string; away: string };
  shots?: { home: number; away: number };
  shotsOnTarget?: { home: number; away: number };
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
    // Only resolve LOCKED questions (answer window already closed, waiting for event)
    // OPEN questions should keep their answer window — don't cut it short
    const openQuestions = await this.prisma.question.findMany({
      where: { fixtureId, status: 'LOCKED' },
      include: { options: true },
    });

    if (openQuestions.length === 0) return false;

    // Pre-warm template code cache
    await this.warmTemplateCache(openQuestions);

    let resolved = false;
    for (const question of openQuestions) {
      const result = this.determineCorrectOption(question, event, teams);

      if (result === 'VOID') {
        await this.voidQuestion(fixtureId, question, `${event.type}/${event.detail}`);
        resolved = true;
      } else if (result) {
        await this.resolveQuestion(fixtureId, question, result, `${event.type}/${event.detail}`);
        resolved = true;
      }
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

    // Fetch events for HT resolution
    let events: MatchEvent[] = [];
    try {
      const cachedEvents = await this.redis.getJson<any[]>(`cache:fixture:${fixtureId}:events`);
      events = (cachedEvents ?? await this.apiFootball.getFixtureEvents(fixtureId)) as MatchEvent[];
    } catch (e) {
      this.logger.warn(`Failed to fetch events for ${fixtureId}: ${e}`);
    }

    // Resolve OPEN/LOCKED + close PENDING 1H questions (don't let them leak into 2H)
    const htQuestions = await this.prisma.question.findMany({
      where: { fixtureId, status: { in: ['OPEN', 'LOCKED', 'PENDING'] } },
      include: { options: true },
    });

    // Pre-warm template code cache
    await this.warmTemplateCache(htQuestions);

    const H1_PHASES = ['PRE_MATCH', 'EARLY_H1', 'MID_H1', 'LATE_H1'];

    for (const question of htQuestions) {
      if (question.status === 'PENDING') {
        // Only close PENDING questions from 1H phases — keep 2H/HT ones
        if (question.matchPhase && H1_PHASES.includes(question.matchPhase)) {
          await this.prisma.question.updateMany({
            where: { id: question.id, status: 'PENDING' },
            data: { status: 'CLOSED' },
          });
        }
        continue;
      }
      const result = this.resolveAtHalfTime(question, teams, score, stats, events);
      if (result === 'VOID') {
        await this.voidQuestion(fixtureId, question, 'HALF_TIME');
      } else if (result) {
        await this.resolveQuestion(fixtureId, question, result, 'HALF_TIME');
      }
    }
  }

  // ─── Full-time resolution ───

  async onFullTime(
    fixtureId: number,
    teams: { home: string; away: string },
    score: { home: number; away: number },
    stoppageMinutes?: number,
    finishedStatus?: string,
  ) {
    this.logger.log(`Full-time for fixture ${fixtureId}: ${score.home}-${score.away} (${finishedStatus ?? 'FT'})`);

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
      // PENDING questions were never shown to users — just close them, don't resolve
      if (question.status === 'PENDING') {
        await this.prisma.question.updateMany({
          where: { id: question.id, status: 'PENDING' },
          data: { status: 'CLOSED' },
        });
        continue;
      }

      const result = this.resolveAtFullTime(question, teams, score, stats, events, stoppageMinutes, finishedStatus);

      if (result === 'VOID') {
        await this.voidQuestion(fixtureId, question, 'FULL_TIME');
      } else if (result) {
        await this.resolveQuestion(fixtureId, question, result, 'FULL_TIME');
      } else {
        // Last resort: try default option, or VOID + refund (never silently close)
        const defaultOpt = this.findDefaultOption(question.options);
        if (defaultOpt) {
          await this.resolveQuestion(fixtureId, question, defaultOpt, 'FULL_TIME');
        } else {
          this.logger.warn(`[${fixtureId}] Cannot resolve "${question.text}" — voiding with refund`);
          await this.voidQuestion(fixtureId, question, 'FULL_TIME_UNRESOLVABLE');
        }
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

  async lockExpiredQuestions(fixtureId: number) {
    const expired = await this.prisma.question.findMany({
      where: {
        fixtureId,
        status: 'OPEN',
        closesAt: { lt: new Date() },
      },
    });

    let openedNext = false;
    for (const question of expired) {
      const locked = await this.prisma.question.updateMany({
        where: { id: question.id, status: 'OPEN' },
        data: { status: 'LOCKED' },
      });

      if (locked.count > 0) {
        this.logger.log(`Locked question "${question.text}" — waiting for result`);
      }
    }

    // Open only ONE next pending question whose opensAt has arrived
    if (expired.length > 0 && !openedNext) {
      const next = await this.prisma.question.findFirst({
        where: { fixtureId, status: 'PENDING', opensAt: { lte: new Date() } },
        orderBy: { opensAt: 'asc' },
      });
      if (next) {
        const now = new Date();
        const windowMs = next.closesAt.getTime() - next.opensAt.getTime();
        await this.prisma.question.update({
          where: { id: next.id },
          data: { status: 'OPEN', opensAt: now, closesAt: new Date(now.getTime() + windowMs) },
        });
        openedNext = true;
      }
    }
  }

  // ─── Public: timer-based resolution ───

  async resolveTimedOut(
    fixtureId: number,
    question: any,
    correctOptionId: string,
  ) {
    return this.resolveQuestion(fixtureId, question, correctOptionId, 'TIMER_EXPIRED');
  }

  // ─── VOID a question + refund all predictions ───

  async voidQuestion(
    fixtureId: number,
    question: any,
    trigger: string,
  ) {
    this.logger.log(`VOIDING "${question.text}" (${question.id}) — trigger: ${trigger}`);

    const updated = await this.prisma.question.updateMany({
      where: { id: question.id, status: { in: ['OPEN', 'LOCKED', 'PENDING'] } },
      data: { status: 'VOIDED' },
    });

    if (updated.count === 0) {
      this.logger.warn(`Skipping void "${question.text}" (${question.id}) — already resolved`);
      return;
    }

    // Refund all predictions
    let results: any[] = [];
    try {
      results = await this.scoringService.voidQuestion(question.id);
    } catch (e) {
      this.logger.error(`Failed to refund question ${question.id}: ${e}`);
    }

    // Open next pending question (only if its scheduled opensAt has arrived)
    const next = await this.prisma.question.findFirst({
      where: { fixtureId, status: 'PENDING', opensAt: { lte: new Date() } },
      orderBy: { opensAt: 'asc' },
    });
    if (next) {
      const now = new Date();
      const windowMs = next.closesAt.getTime() - next.opensAt.getTime();
      await this.prisma.question.update({
        where: { id: next.id },
        data: { status: 'OPEN', opensAt: now, closesAt: new Date(now.getTime() + windowMs) },
      });
    }

    // Broadcast void
    try {
      this.ws.emitToMatch(fixtureId, 'prediction_result', {
        questionId: question.id,
        correctOptionId: null,
        voided: true,
        results: results.map((r) => ({
          userId: r.userId,
          isCorrect: null,
          coinsResult: 0,
          coinsRefunded: r.coinsRefunded,
        })),
      });
    } catch (e) {
      this.logger.error(`Failed to broadcast void for ${question.id}: ${e}`);
    }

    // Feed event
    try {
      await this.feedService.createFeedEvent({
        fixtureId,
        type: 'SYSTEM',
        message: `Voided: "${question.text}" — coins refunded|Hủy: "${question.text}" — hoàn xu`,
      });
    } catch (e) {
      this.logger.error(`Failed to create feed event for void ${question.id}: ${e}`);
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

    // Race-safe: only update if question is still OPEN/LOCKED/PENDING
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

    // Score predictions
    let results: any[] = [];
    try {
      results = await this.scoringService.scoreQuestion(question.id, correctOptionId);
    } catch (e) {
      this.logger.error(`Failed to score question ${question.id}: ${e}`);
    }

    // Open next pending question (only if its scheduled opensAt has arrived)
    const next = await this.prisma.question.findFirst({
      where: { fixtureId, status: 'PENDING', opensAt: { lte: new Date() } },
      orderBy: { opensAt: 'asc' },
    });
    if (next) {
      const now = new Date();
      const windowMs = next.closesAt.getTime() - next.opensAt.getTime();
      await this.prisma.question.update({
        where: { id: next.id },
        data: { status: 'OPEN', opensAt: now, closesAt: new Date(now.getTime() + windowMs) },
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

  // ═══════════════════════════════════════════════
  //  Event-based matching (real-time during match)
  // ═══════════════════════════════════════════════

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
      const playerName = event.player?.name;
      if (playerName) {
        const playerOption = options.find((o) =>
          o.name.toLowerCase().includes(playerName.toLowerCase()),
        );
        if (playerOption) return playerOption.id;
      }
      return options.find((o) =>
        o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'),
      )?.id ?? null;
    }

    // ── Q004: "How will next goal be scored?" → resolve on goal with detail ──
    if (tpl === 'Q004' && eventType === 'goal') {
      const detail = event.detail?.toLowerCase() ?? '';
      if (detail.includes('header')) {
        return options.find((o) => o.name.toLowerCase().includes('đầu') || o.name.toLowerCase().includes('header'))?.id ?? null;
      }
      if (detail.includes('own goal')) {
        return options.find((o) => o.name.toLowerCase().includes('phản') || o.name.toLowerCase().includes('own'))?.id ?? null;
      }
      if (detail.includes('penalty')) {
        return options.find((o) => o.name.toLowerCase().includes('phạt đền') || o.name.toLowerCase().includes('penalty'))?.id ?? null;
      }
      // Default: Normal Goal
      return options.find((o) => o.name.toLowerCase().includes('sút chân') || o.name.toLowerCase().includes('normal'))?.id ?? null;
    }

    // ── Q005/Q008: "Who scores first?" → resolve on first goal event ──
    if ((tpl === 'Q005' || tpl === 'Q008') && eventType === 'goal') {
      // Q008 FIX v2.1: if goal elapsed >= 65, Option C wins
      if (tpl === 'Q008' && (event.time?.elapsed ?? 0) >= 65) {
        return this.findNoOption(options);
      }
      const beneficiary = this.goalBeneficiary(event, teams);
      if (!beneficiary) return null;
      return this.findOptionByTeamName(options, beneficiary) ?? null;
    }

    // ── Q010: "Red card in match?" → resolve on red card event ──
    if (tpl === 'Q010' && eventType === 'card') {
      const detail = event.detail?.toLowerCase() ?? '';
      if (detail.includes('red') || detail.includes('yellow red')) {
        const cardTeam = event.team?.name;
        if (cardTeam) return this.findOptionByTeamName(options, cardTeam) ?? null;
        return this.findYesOption(options);
      }
      return null;
    }

    // ── Q019: "VAR overturn?" → resolve on VAR result ──
    if (tpl === 'Q019' && eventType === 'var') {
      const detail = event.detail?.toLowerCase() ?? '';
      if (detail.includes('under review')) return null; // Wait for verdict
      const overturned = detail.includes('cancelled') || detail.includes('overturned') || detail.includes('goal disallowed');
      return this.findYesNoOption(options, overturned);
    }

    // ── Q020: "Penalty awarded?" → v2.1 FIX: Missed Penalty = still A/B ──
    if (tpl === 'Q020') {
      if (eventType === 'goal') {
        const detail = event.detail?.toLowerCase() ?? '';
        if (detail.includes('penalty') || detail.includes('missed penalty')) {
          const penTeam = event.team?.name;
          if (penTeam) return this.findOptionByTeamName(options, penTeam) ?? null;
        }
      }
      // v2.1: Var[Penalty cancelled] → Option C
      if (eventType === 'var') {
        const detail = event.detail?.toLowerCase() ?? '';
        if (detail.includes('penalty cancelled') || detail.includes('penalty canceled')) {
          return this.findNoOption(options);
        }
      }
      return null;
    }

    // ── Q022: "Which team substitutes first?" → resolve on subst event ──
    if (tpl === 'Q022' && eventType === 'subst') {
      const subTeam = event.team?.name;
      if (!subTeam) return null;
      return this.findOptionByTeamName(options, subTeam) ?? null;
    }

    // ── Q042: "VAR review result?" → resolve on VAR verdict ──
    if (tpl === 'Q042' && eventType === 'var') {
      const detail = event.detail?.toLowerCase() ?? '';
      if (detail.includes('under review')) return null;
      // v2.2: Penalty cancelled or Var Card → VOID
      if (detail.includes('penalty cancelled') || detail.includes('penalty canceled') || detail.includes('var card')) {
        return 'VOID';
      }
      if (detail.includes('goal confirmed') || detail.includes('goal stands')) {
        return options.find((o) => o.name.toLowerCase().includes('công nhận') || o.name.toLowerCase().includes('confirmed'))?.id ?? null;
      }
      if (detail.includes('goal cancelled') || detail.includes('goal disallowed')) {
        return options.find((o) => o.name.toLowerCase().includes('hủy') || o.name.toLowerCase().includes('cancelled'))?.id ?? null;
      }
      if (detail.includes('penalty confirmed') || detail.includes('penalty')) {
        return options.find((o) => o.name.toLowerCase().includes('penalty'))?.id ?? null;
      }
      return null;
    }

    // ── Q036: "Who assists next goal?" → resolve on goal event ──
    if (tpl === 'Q036' && eventType === 'goal') {
      const assist = (event as any).assist;
      if (!assist || !assist.id) {
        // v2.3: No assist → Option E "Solo goal" wins (not VOID)
        return options.find((o) => o.name.toLowerCase().includes('solo') || o.name.toLowerCase().includes('kiến tạo'))?.id
          ?? options[options.length - 1]?.id ?? null;
      }
      const assistName = assist.name?.toLowerCase() ?? '';
      const matchedOption = options.find((o) => o.name.toLowerCase().includes(assistName));
      if (matchedOption) return matchedOption.id;
      return options.find((o) => o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'))?.id ?? null;
    }

    // ── Q054: "Does first scoring team maintain control?" → triggered on first goal ──
    if (tpl === 'Q054' && eventType === 'goal') {
      // Don't resolve immediately — need to wait for stats 15 min later
      return null;
    }

    // ── Generic category-based fallback for questions without templateId ──
    return this.determineByCategory(question, event, teams);
  }

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

  // ═══════════════════════════════════════════════
  //  Half-time resolution logic
  // ═══════════════════════════════════════════════

  private resolveAtHalfTime(
    question: any,
    teams: { home: string; away: string },
    score: { home: number; away: number },
    stats: MatchStats | null,
    events: MatchEvent[],
  ): string | null {
    const options: any[] = question.options;
    const tpl = this.getTemplateCode(question);

    // Q005: "Who scores first?" — still 0-0 at HT means no goals in first half
    if (tpl === 'Q005' && score.home === 0 && score.away === 0) {
      return null; // Don't resolve yet — still a chance in 2H
    }

    // Q031: "Any goals in H1?"
    if (tpl === 'Q031') {
      const h1Goals = events.filter(
        (e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) < 46,
      ).length;
      if (h1Goals === 0) return options.find((o) => o.name.toLowerCase().includes('không') || o.name.toLowerCase().includes('no goals'))?.id ?? null;
      if (h1Goals === 1) return options[0]?.id ?? null; // "1 bàn"
      return options[1]?.id ?? null; // "2 bàn trở lên"
    }

    // Q035: "Score after 30 minutes?"
    if (tpl === 'Q035') {
      const goalsBy30 = events.filter(
        (e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) <= 30,
      );
      let homeGoals30 = 0, awayGoals30 = 0;
      for (const g of goalsBy30) {
        const beneficiary = this.goalBeneficiary(g, teams);
        if (beneficiary === teams.home) homeGoals30++;
        else if (beneficiary === teams.away) awayGoals30++;
      }
      const scoreStr = `${homeGoals30}-${awayGoals30}`;
      if (homeGoals30 === 0 && awayGoals30 === 0) return options[0]?.id ?? null; // "0-0"
      if (homeGoals30 === 1 && awayGoals30 === 0) return options[1]?.id ?? null; // "1-0"
      if (homeGoals30 === 0 && awayGoals30 === 1) return options[2]?.id ?? null; // "0-1"
      return options[3]?.id ?? null; // "Other"
    }

    // Q015: "Total corners this half?" — resolve with HT stats
    if (tpl === 'Q015' && stats?.corners) {
      const totalCorners = (stats.corners.home ?? 0) + (stats.corners.away ?? 0);
      return this.findRangeOption(options, totalCorners);
    }

    // Q050: "Home team possession in H1?"
    if (tpl === 'Q050' && stats?.possession) {
      const homePoss = parseInt(stats.possession.home) || 50;
      if (homePoss < 45) return options[0]?.id ?? null;
      if (homePoss <= 55) return options[1]?.id ?? null;
      return options[2]?.id ?? null;
    }

    // Q051: "Total shots in H1?"
    if (tpl === 'Q051' && stats?.shots) {
      const totalShots = (stats.shots.home ?? 0) + (stats.shots.away ?? 0);
      return this.findRangeOption(options, totalShots);
    }

    // Q046: "H1 stoppage time?" — resolve at HT
    if (tpl === 'Q046') {
      const h1ExtraEvent = [...events]
        .filter((e) => (e.time?.elapsed ?? 0) === 45 && e.time?.extra != null)
        .sort((a, b) => (b.time?.extra ?? 0) - (a.time?.extra ?? 0))[0];
      const h1Extra = h1ExtraEvent?.time?.extra ?? 0;
      return this.findRangeOption(options, h1Extra);
    }

    return null;
  }

  // ═══════════════════════════════════════════════
  //  Full-time resolution logic — all 55 questions
  // ═══════════════════════════════════════════════

  private resolveAtFullTime(
    question: any,
    teams: { home: string; away: string },
    score: { home: number; away: number },
    stats: MatchStats | null,
    events: MatchEvent[],
    stoppageMinutes?: number,
    finishedStatus?: string,
  ): string | null {
    const options: any[] = question.options;
    const tpl = this.getTemplateCode(question);

    // ═══ GOAL ═══

    // Q001: "Who scores next?" — no goal = all wrong (pick "other" as correct, nobody matched)
    if (tpl === 'Q001') {
      const questionMinute = question.matchMinute ?? 0;
      const nextGoal = this.findNextGoalAfter(events, questionMinute);
      if (!nextGoal) {
        // No goal scored — everyone is wrong. Pick a dummy correct option that nobody would have chosen.
        return options.find((o) => o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'))?.id
          ?? options[options.length - 1]?.id ?? null;
      }
      const playerName = nextGoal.player?.name?.toLowerCase() ?? '';
      const matchedOpt = options.find((o) => o.name.toLowerCase().includes(playerName));
      if (matchedOpt) return matchedOpt.id;
      return options.find((o) => o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'))?.id ?? null;
    }

    // Q002: "When will the next goal be scored?"
    if (tpl === 'Q002') {
      const questionMinute = question.matchMinute ?? 0;
      const nextGoal = this.findNextGoalAfter(events, questionMinute);
      if (!nextGoal) return 'VOID'; // v2.2: No goal → VOID + refund
      return this.findRangeOption(options, nextGoal.time?.elapsed ?? 0);
    }

    // Q003: "Goal in next 10 min?"
    if (tpl === 'Q003') {
      const qMin = question.matchMinute ?? 0;
      const goalInWindow = events.find(
        (e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) > qMin && (e.time?.elapsed ?? 0) <= qMin + 10,
      );
      if (goalInWindow) {
        const beneficiary = this.goalBeneficiary(goalInWindow, teams);
        if (beneficiary) return this.findOptionByTeamName(options, beneficiary) ?? null;
      }
      return this.findNoOption(options);
    }

    // Q004: "How will next goal be scored?"
    if (tpl === 'Q004') {
      const qMin = question.matchMinute ?? 0;
      const nextGoal = this.findNextGoalAfter(events, qMin);
      if (!nextGoal) return 'VOID'; // No goal → VOID + refund
      const detail = nextGoal.detail?.toLowerCase() ?? '';
      if (detail.includes('header')) return options.find((o) => o.name.toLowerCase().includes('header') || o.name.toLowerCase().includes('đầu'))?.id ?? null;
      if (detail.includes('own goal')) return options.find((o) => o.name.toLowerCase().includes('own') || o.name.toLowerCase().includes('phản'))?.id ?? null;
      if (detail.includes('penalty')) return options.find((o) => o.name.toLowerCase().includes('penalty') || o.name.toLowerCase().includes('phạt đền'))?.id ?? null;
      return options.find((o) => o.name.toLowerCase().includes('normal') || o.name.toLowerCase().includes('sút chân'))?.id ?? null;
    }

    // Q005: "Which team scores first?"
    if (tpl === 'Q005') {
      if (score.home === 0 && score.away === 0) return this.findNoOption(options);
      const firstGoal = events.find((e) => e.type?.toLowerCase() === 'goal');
      if (firstGoal) {
        const beneficiary = this.goalBeneficiary(firstGoal, teams);
        if (beneficiary) return this.findOptionByTeamName(options, beneficiary) ?? null;
      }
      return null;
    }

    // Q006: "Final score?"
    if (tpl === 'Q006') {
      const scoreStr = `${score.home}-${score.away}`;
      const option = options.find((o) => o.name.includes(scoreStr));
      if (option) return option.id;
      return options.find((o) => o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'))?.id ?? null;
    }

    // Q007: "Stoppage time goal?" — v2.1 FIX: detect both H1 and H2 extra time
    if (tpl === 'Q007') {
      const extraTimeGoals = events.filter((e) => {
        if (e.type?.toLowerCase() !== 'goal') return false;
        const elapsed = e.time?.elapsed ?? 0;
        const extra = e.time?.extra;
        const isH1Extra = elapsed >= 45 && elapsed < 46 && extra != null && extra > 0;
        const isH2Extra = elapsed >= 90 && extra != null && extra > 0;
        return isH1Extra || isH2Extra;
      });
      if (extraTimeGoals.length > 0) {
        const beneficiary = this.goalBeneficiary(extraTimeGoals[0], teams);
        if (beneficiary) {
          const scoreAt90 = this.reconstructScoreAtMinute(events, 90, teams);
          const isHome = beneficiary === teams.home;
          const wasLeading = isHome ? scoreAt90.home > scoreAt90.away : scoreAt90.away > scoreAt90.home;
          const wasTrailing = isHome ? scoreAt90.home < scoreAt90.away : scoreAt90.away < scoreAt90.home;
          if (wasLeading) return options.find((o) => o.name.toLowerCase().includes('dẫn') || o.name.toLowerCase().includes('leading'))?.id ?? null;
          if (wasTrailing) return options.find((o) => o.name.toLowerCase().includes('thua') || o.name.toLowerCase().includes('trailing'))?.id ?? null;
          return this.findOptionByTeamName(options, beneficiary) ?? this.findYesOption(options);
        }
      }
      return this.findNoOption(options);
    }

    // Q008: "Who scores first in 2H?" — v2.1 FIX: cutoff at minute 65
    if (tpl === 'Q008') {
      const firstH2Goal = events
        .filter((e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) >= 46)
        .sort((a, b) => (a.time?.elapsed ?? 0) - (b.time?.elapsed ?? 0))[0];
      if (!firstH2Goal) return this.findNoOption(options); // C: nobody
      if ((firstH2Goal.time?.elapsed ?? 0) >= 65) return this.findNoOption(options); // v2.1 FIX: C wins
      const beneficiary = this.goalBeneficiary(firstH2Goal, teams);
      if (beneficiary) return this.findOptionByTeamName(options, beneficiary) ?? null;
      return this.findNoOption(options);
    }

    // Q031: "Any goals in H1?"
    if (tpl === 'Q031') {
      const h1Goals = events.filter((e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) < 46).length;
      if (h1Goals === 0) return options[2]?.id ?? null; // C
      if (h1Goals === 1) return options[0]?.id ?? null; // A
      return options[1]?.id ?? null; // B
    }

    // Q032: "Will {home_striker} score?"
    if (tpl === 'Q032') {
      // Match by player name in option A/B text
      const strikerName = options[0]?.name?.replace(/\{.*?\}/g, '').trim().toLowerCase();
      const strikerGoals = events.filter((e) => {
        if (e.type?.toLowerCase() !== 'goal') return false;
        return e.player?.name?.toLowerCase().includes(strikerName);
      });
      if (strikerGoals.length === 0) return options[2]?.id ?? null; // C: no goal
      const earliest = strikerGoals.sort((a, b) => (a.time?.elapsed ?? 0) - (b.time?.elapsed ?? 0))[0];
      if ((earliest.time?.elapsed ?? 0) < 46) return options[0]?.id ?? null; // A: H1
      return options[1]?.id ?? null; // B: H2
    }

    // Q033: "Total goals in match?"
    if (tpl === 'Q033') {
      const totalGoals = events.filter((e) => e.type?.toLowerCase() === 'goal').length;
      return this.findRangeOption(options, totalGoals);
    }

    // Q034: "H2 more goals than H1?"
    if (tpl === 'Q034') {
      const h1Goals = events.filter((e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) < 46).length;
      const h2Goals = events.filter((e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) >= 46).length;
      if (h2Goals > h1Goals) return options[0]?.id ?? null; // A: yes
      return options[1]?.id ?? null; // B: no
    }

    // Q035: "Score after 30 minutes?"
    if (tpl === 'Q035') {
      const goalsBy30 = events.filter((e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) <= 30);
      let h = 0, a = 0;
      for (const g of goalsBy30) {
        const b = this.goalBeneficiary(g, teams);
        if (b === teams.home) h++;
        else if (b === teams.away) a++;
      }
      if (h === 0 && a === 0) return options[0]?.id ?? null;
      if (h === 1 && a === 0) return options[1]?.id ?? null;
      if (h === 0 && a === 1) return options[2]?.id ?? null;
      return options[3]?.id ?? null;
    }

    // Q036: "Who assists next goal?"
    if (tpl === 'Q036') {
      const qMin = question.matchMinute ?? 0;
      const nextGoal = this.findNextGoalAfter(events, qMin);
      if (!nextGoal) return 'VOID'; // No goal at all → VOID
      const assist = (nextGoal as any).assist;
      if (!assist || !assist.id) {
        // v2.3: No assist → Option E "Solo goal" wins (not VOID)
        return options.find((o) => o.name.toLowerCase().includes('solo') || o.name.toLowerCase().includes('kiến tạo'))?.id
          ?? options[options.length - 1]?.id ?? null;
      }
      const assistName = assist.name?.toLowerCase() ?? '';
      const matchedOpt = options.find((o) => o.name.toLowerCase().includes(assistName));
      if (matchedOpt) return matchedOpt.id;
      return options.find((o) => o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'))?.id ?? null;
    }

    // ═══ CARD ═══

    // Q010: "Red card in match?"
    if (tpl === 'Q010') {
      const redEvent = events.find((e) => {
        const detail = e.detail?.toLowerCase() ?? '';
        return e.type?.toLowerCase() === 'card' && (detail.includes('red card') || detail.includes('yellow red'));
      });
      if (redEvent?.team?.name) return this.findOptionByTeamName(options, redEvent.team.name) ?? null;
      return this.findNoOption(options);
    }

    // Q011: "How many more yellow cards?" — v2.2: count Yellow Card + Yellow Red Card
    if (tpl === 'Q011') {
      const qMin = question.matchMinute ?? 75;
      const cardsAfter = events.filter((e) => {
        const detail = e.detail?.toLowerCase() ?? '';
        return e.type?.toLowerCase() === 'card' &&
          (detail.includes('yellow card') || detail.includes('yellow red')) &&
          (e.time?.elapsed ?? 0) > qMin;
      }).length;
      return this.findRangeOption(options, cardsAfter);
    }

    // Q012: "Who gets next card?"
    if (tpl === 'Q012') {
      const qMin = question.matchMinute ?? 0;
      const nextCard = events
        .filter((e) => e.type?.toLowerCase() === 'card' && (e.time?.elapsed ?? 0) > qMin)
        .sort((a, b) => (a.time?.elapsed ?? 0) - (b.time?.elapsed ?? 0))[0];
      if (!nextCard) return 'VOID'; // No card after close → VOID
      const playerName = nextCard.player?.name?.toLowerCase() ?? '';
      const matchedOpt = options.find((o) => o.name.toLowerCase().includes(playerName));
      if (matchedOpt) return matchedOpt.id;
      return options.find((o) => o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'))?.id ?? null;
    }

    // Q013: "Second yellow = sent off?"
    if (tpl === 'Q013') {
      const yellowRed = events.find((e) => {
        return e.type?.toLowerCase() === 'card' && e.detail?.toLowerCase().includes('yellow red');
      });
      if (!yellowRed) return this.findNoOption(options); // C: nobody
      const playerName = yellowRed.player?.name?.toLowerCase() ?? '';
      const matchedOpt = options.find((o) => o.name.toLowerCase().includes(playerName));
      if (matchedOpt) return matchedOpt.id;
      return options[0]?.id ?? null;
    }

    // Q037: "Total yellow cards?" — v2.2: count YC + YRC
    if (tpl === 'Q037') {
      const totalYellows = events.filter((e) => {
        const detail = e.detail?.toLowerCase() ?? '';
        return e.type?.toLowerCase() === 'card' && (detail.includes('yellow card') || detail.includes('yellow red'));
      }).length;
      return this.findRangeOption(options, totalYellows);
    }

    // Q038: "Which team gets more cards?"
    if (tpl === 'Q038') {
      const cards = events.filter((e) => e.type?.toLowerCase() === 'card');
      let homeCards = 0, awayCards = 0;
      for (const c of cards) {
        if (c.team?.name === teams.home) homeCards++;
        else if (c.team?.name === teams.away) awayCards++;
      }
      if (homeCards > awayCards) return this.findOptionByTeamName(options, teams.home) ?? null;
      if (awayCards > homeCards) return this.findOptionByTeamName(options, teams.away) ?? null;
      return options.find((o) => o.name.toLowerCase().includes('bằng') || o.name.toLowerCase().includes('equal'))?.id ?? null;
    }

    // ═══ CORNER ═══

    // Q015: "Total corners this half?"
    if (tpl === 'Q015' && stats?.corners) {
      const totalMatchCorners = (stats.corners.home ?? 0) + (stats.corners.away ?? 0);
      const qPhase = question.matchPhase ?? '';
      if (qPhase.includes('H2') || qPhase === 'LATE_H2' || (question.matchMinute ?? 0) >= 46) {
        const h1Corners = events.filter((e) => e.type?.toLowerCase() === 'corner' && (e.time?.elapsed ?? 0) <= 45).length;
        return this.findRangeOption(options, totalMatchCorners - h1Corners);
      }
      return this.findRangeOption(options, totalMatchCorners);
    }

    // Q017: "Which team more corners?"
    if (tpl === 'Q017' && stats?.corners) {
      if (stats.corners.home > stats.corners.away) return this.findOptionByTeamName(options, teams.home) ?? null;
      if (stats.corners.away > stats.corners.home) return this.findOptionByTeamName(options, teams.away) ?? null;
      return options.find((o) => o.name.toLowerCase().includes('bằng') || o.name.toLowerCase().includes('equal'))?.id ?? null;
    }

    // Q039: "Total corners in match?"
    if (tpl === 'Q039' && stats?.corners) {
      const total = (stats.corners.home ?? 0) + (stats.corners.away ?? 0);
      return this.findRangeOption(options, total);
    }

    // Q040: "Which team more corners overall?"
    if (tpl === 'Q040' && stats?.corners) {
      if (stats.corners.home > stats.corners.away) return this.findOptionByTeamName(options, teams.home) ?? null;
      if (stats.corners.away > stats.corners.home) return this.findOptionByTeamName(options, teams.away) ?? null;
      return options.find((o) => o.name.toLowerCase().includes('bằng') || o.name.toLowerCase().includes('equal'))?.id ?? null;
    }

    // ═══ VAR ═══

    // Q020: "Penalty awarded?" — v2.1 FIX
    if (tpl === 'Q020') {
      // Case 1: Goal[Penalty] or Case 2: Goal[Missed Penalty] → A/B
      const penGoal = events.find((e) => {
        const detail = e.detail?.toLowerCase() ?? '';
        return e.type?.toLowerCase() === 'goal' && (detail.includes('penalty') || detail.includes('missed penalty'));
      });
      if (penGoal?.team?.name) return this.findOptionByTeamName(options, penGoal.team.name) ?? null;
      // Case 3: Var[Penalty cancelled] → C
      const penCancelled = events.find((e) => {
        return e.type?.toLowerCase() === 'var' && e.detail?.toLowerCase().includes('penalty cancelled');
      });
      if (penCancelled) return this.findNoOption(options);
      // Case 4: No event at all → C (no penalty)
      return this.findNoOption(options);
    }

    // Q021: "VAR in last 10 min?"
    if (tpl === 'Q021') {
      const varLast10 = events.some((e) => e.type?.toLowerCase() === 'var' && (e.time?.elapsed ?? 0) >= 80);
      return this.findYesNoOption(options, varLast10);
    }

    // Q041: "How many VAR calls?"
    if (tpl === 'Q041') {
      const varReviews = events.filter((e) => {
        return e.type?.toLowerCase() === 'var' && e.detail?.toLowerCase().includes('under review');
      }).length;
      return this.findRangeOption(options, varReviews);
    }

    // ═══ SUB ═══

    // Q022: "Which team subs first?" — v2.3: VOID if no subs at FT
    if (tpl === 'Q022') {
      const firstSub = events
        .filter((e) => e.type?.toLowerCase() === 'subst')
        .sort((a, b) => (a.time?.elapsed ?? 0) - (b.time?.elapsed ?? 0))[0];
      if (!firstSub) return 'VOID'; // No subs at all → VOID + refund
      const subTeam = firstSub.team?.name;
      if (subTeam) return this.findOptionByTeamName(options, subTeam) ?? null;
      return null;
    }

    // Q023: "Total subs in 2H?" — v2.3: brackets 0-4/5-6/7-8/9-10
    if (tpl === 'Q023') {
      const h2Subs = events.filter((e) => e.type?.toLowerCase() === 'subst' && (e.time?.elapsed ?? 0) >= 46).length;
      return this.findRangeOption(options, h2Subs);
    }

    // Q024: "Will substitute score?"
    if (tpl === 'Q024') {
      const subsIn = new Set(
        events.filter((e) => e.type?.toLowerCase() === 'subst').map((e) => e.player?.name?.toLowerCase()),
      );
      const subGoal = events.some((e) =>
        e.type?.toLowerCase() === 'goal' && subsIn.has(e.player?.name?.toLowerCase()),
      );
      return this.findYesNoOption(options, subGoal);
    }

    // Q025: "When is next sub?"
    if (tpl === 'Q025') {
      const qMin = question.matchMinute ?? 55;
      const nextSub = events
        .filter((e) => e.type?.toLowerCase() === 'subst' && (e.time?.elapsed ?? 0) > qMin)
        .sort((a, b) => (a.time?.elapsed ?? 0) - (b.time?.elapsed ?? 0))[0];
      if (!nextSub) return 'VOID'; // No sub → VOID + refund
      return this.findRangeOption(options, nextSub.time?.elapsed ?? 0);
    }

    // Q043: "Home team first sub in H2?"
    if (tpl === 'Q043') {
      const homeSubs = events
        .filter((e) => e.type?.toLowerCase() === 'subst' && e.team?.name === teams.home)
        .sort((a, b) => (a.time?.elapsed ?? 0) - (b.time?.elapsed ?? 0));
      // v2.2 FIX: if home already subbed in H1 → VOID
      const hasH1Sub = homeSubs.some((s) => (s.time?.elapsed ?? 0) < 46);
      if (hasH1Sub) return 'VOID';
      const firstH2Sub = homeSubs.find((s) => (s.time?.elapsed ?? 0) >= 46);
      if (!firstH2Sub) return 'VOID'; // No H2 sub → VOID
      const elapsed = firstH2Sub.time?.elapsed ?? 0;
      if (elapsed === 46) return options[0]?.id ?? null; // A
      if (elapsed >= 55 && elapsed <= 65) return options[1]?.id ?? null; // B
      if (elapsed >= 66 && elapsed <= 75) return options[2]?.id ?? null; // C
      return options[3]?.id ?? null; // D: after 75
    }

    // Q044: "Who is subbed in next 15 min?"
    if (tpl === 'Q044') {
      const qMin = question.matchMinute ?? 0;
      const subsInWindow = events
        .filter((e) => e.type?.toLowerCase() === 'subst' && (e.time?.elapsed ?? 0) > qMin && (e.time?.elapsed ?? 0) <= qMin + 15)
        .sort((a, b) => (a.time?.elapsed ?? 0) - (b.time?.elapsed ?? 0));
      if (subsInWindow.length === 0) return 'VOID'; // No sub in window → VOID
      const playerName = subsInWindow[0].player?.name?.toLowerCase() ?? '';
      const matchedOpt = options.find((o) => o.name.toLowerCase().includes(playerName));
      if (matchedOpt) return matchedOpt.id;
      return options.find((o) => o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'))?.id ?? null;
    }

    // Q045: "Total subs for home team?"
    if (tpl === 'Q045') {
      const homeSubs = events.filter((e) => e.type?.toLowerCase() === 'subst' && e.team?.name === teams.home).length;
      return this.findRangeOption(options, homeSubs);
    }

    // ═══ TIME ═══

    // Q026: "H2 stoppage time minutes?"
    if (tpl === 'Q026' && stoppageMinutes != null) {
      return this.findRangeOption(options, stoppageMinutes);
    }

    // Q027: "Goal in stoppage time?" — H2 only
    if (tpl === 'Q027') {
      const stoppageGoal = events.some((e) => {
        if (e.type?.toLowerCase() !== 'goal') return false;
        const elapsed = e.time?.elapsed ?? 0;
        const extra = e.time?.extra;
        return elapsed >= 90 && extra != null && extra > 0;
      });
      return this.findYesNoOption(options, stoppageGoal);
    }

    // Q046: "H1 stoppage time?"
    if (tpl === 'Q046') {
      const h1ExtraEvent = [...events]
        .filter((e) => (e.time?.elapsed ?? 0) === 45 && e.time?.extra != null)
        .sort((a, b) => (b.time?.extra ?? 0) - (a.time?.extra ?? 0))[0];
      const h1Extra = h1ExtraEvent?.time?.extra ?? 0;
      return this.findRangeOption(options, h1Extra);
    }

    // Q047: "Total stoppage time H1+H2?"
    if (tpl === 'Q047') {
      const h1ExtraEvent = [...events]
        .filter((e) => (e.time?.elapsed ?? 0) === 45 && e.time?.extra != null)
        .sort((a, b) => (b.time?.extra ?? 0) - (a.time?.extra ?? 0))[0];
      const h1Extra = h1ExtraEvent?.time?.extra ?? 0;
      const h2Extra = stoppageMinutes ?? 0;
      return this.findRangeOption(options, h1Extra + h2Extra);
    }

    // Q048: "Will match go to extra time?"
    if (tpl === 'Q048') {
      // AET = after extra time, PEN = penalties (both mean extra time happened)
      const wentToExtraTime = finishedStatus === 'AET' || finishedStatus === 'PEN';
      return this.findYesNoOption(options, wentToExtraTime);
    }

    // ═══ STAT ═══

    // Q028: "Possession leader at FT?"
    if (tpl === 'Q028' && stats?.possession) {
      const homePoss = parseInt(stats.possession.home) || 50;
      if (homePoss > 55) return this.findOptionByTeamName(options, teams.home) ?? null;
      if (homePoss < 45) return this.findOptionByTeamName(options, teams.away) ?? null;
      return options.find((o) => o.name.toLowerCase().includes('cân bằng') || o.name.toLowerCase().includes('balanced'))?.id ?? null;
    }

    // Q029: "Total shots?"
    if (tpl === 'Q029' && stats?.shots) {
      const totalShots = (stats.shots.home ?? 0) + (stats.shots.away ?? 0);
      return this.findRangeOption(options, totalShots);
    }

    // Q049: "Which team more shots on target?"
    if (tpl === 'Q049') {
      const sot = stats?.shotsOnTarget ?? stats?.shots;
      if (sot) {
        if (sot.home > sot.away) return this.findOptionByTeamName(options, teams.home) ?? null;
        if (sot.away > sot.home) return this.findOptionByTeamName(options, teams.away) ?? null;
        return options.find((o) => o.name.toLowerCase().includes('bằng') || o.name.toLowerCase().includes('equal'))?.id ?? null;
      }
      return null;
    }

    // Q050: "Home possession in H1?" — already resolved at HT, fallback at FT
    if (tpl === 'Q050' && stats?.possession) {
      const homePoss = parseInt(stats.possession.home) || 50;
      if (homePoss < 45) return options[0]?.id ?? null;
      if (homePoss <= 55) return options[1]?.id ?? null;
      return options[2]?.id ?? null;
    }

    // Q051: "Total shots in H1?" — already resolved at HT, fallback at FT
    if (tpl === 'Q051' && stats?.shots) {
      return this.findRangeOption(options, (stats.shots.home ?? 0) + (stats.shots.away ?? 0));
    }

    // ═══ MOMENTUM ═══

    // Q030: "Turning point after HT?" — v2.0 FIX: possession_delta>8% AND shots_delta>3
    if (tpl === 'Q030') {
      return this.resolveMomentum(options, events, teams, stats);
    }

    // Q052: "Who dominates first 15 min?" — resolved by stats at minute 15
    if (tpl === 'Q052' && stats) {
      const homePoss = parseInt(stats.possession?.home ?? '50') || 50;
      const homeShots = stats.shots?.home ?? 0;
      const awayPoss = 100 - homePoss;
      const awayShots = stats.shots?.away ?? 0;
      const homeDominates = homePoss > 55 && homeShots > 3;
      const awayDominates = awayPoss > 55 && awayShots > 3;
      if (homeDominates && !awayDominates) return this.findOptionByTeamName(options, teams.home) ?? null;
      if (awayDominates && !homeDominates) return this.findOptionByTeamName(options, teams.away) ?? null;
      return options.find((o) => o.name.toLowerCase().includes('cân bằng') || o.name.toLowerCase().includes('balanced'))?.id ?? null;
    }

    // Q053: "Trailing team attacks more in last 15 min?" — v2.3: threshold +1
    if (tpl === 'Q053' && stats?.shots) {
      if (score.home === score.away) return 'VOID'; // v2.3: score became tied → VOID
      // Determine losing/leading team shots
      const losingIsHome = score.home < score.away;
      const losingShots = losingIsHome ? (stats.shots.home ?? 0) : (stats.shots.away ?? 0);
      const leadingShots = losingIsHome ? (stats.shots.away ?? 0) : (stats.shots.home ?? 0);
      // v2.3 #8: threshold reduced from +3 to +1
      if (losingShots > leadingShots + 1) return options[0]?.id ?? null; // A: yes, attacking more
      return options[1]?.id ?? null; // B: no change
    }

    // Q054: "First scoring team maintains control?"
    if (tpl === 'Q054' && stats) {
      const homePoss = parseInt(stats.possession?.home ?? '50') || 50;
      const firstGoal = events.find((e) => e.type?.toLowerCase() === 'goal');
      if (!firstGoal) return options[1]?.id ?? null;
      const scorer = this.goalBeneficiary(firstGoal, teams);
      const scorerPoss = scorer === teams.home ? homePoss : (100 - homePoss);
      const scorerShots = scorer === teams.home ? (stats.shots?.home ?? 0) : (stats.shots?.away ?? 0);
      if (scorerPoss > 50 && scorerShots > 5) return options[0]?.id ?? null; // A: yes
      return options[1]?.id ?? null; // B: no
    }

    // Q055: "Last 20 min who creates more chances?" — v2.3: VOID if score tied
    if (tpl === 'Q055') {
      if (score.home === score.away) return 'VOID'; // v2.3: score became tied → VOID
      const sot = stats?.shotsOnTarget ?? stats?.shots;
      if (sot) {
        const homeDelta = sot.home;
        const awayDelta = sot.away;
        if (homeDelta > awayDelta + 2) return options[0]?.id ?? null; // A: leading team
        if (awayDelta > homeDelta + 2) return options[1]?.id ?? null; // B: trailing team
        return options[2]?.id ?? null; // C: both
      }
      return options[2]?.id ?? null;
    }

    // ═══ Fallback: text-based matching ═══
    return this.resolveByTextFallback(question, teams, score, stats, stoppageMinutes);
  }

  // ─── Momentum resolution — v2.0 FIX #2d ───

  private resolveMomentum(
    options: any[],
    events: MatchEvent[],
    teams: { home: string; away: string },
    stats: MatchStats | null,
  ): string | null {
    // Use stats-based approach: possession_delta>8% AND shots_delta>3
    if (stats?.possession && stats?.shots) {
      const homePoss = parseInt(stats.possession.home) || 50;
      const homeShots = stats.shots.home ?? 0;
      const awayShots = stats.shots.away ?? 0;

      // Count only 2H events
      const h2HomeShots = events.filter((e) =>
        (e.type?.toLowerCase() === 'goal' || e.type?.toLowerCase() === 'shot') &&
        e.team?.name === teams.home && (e.time?.elapsed ?? 0) >= 46,
      ).length;
      const h2AwayShots = events.filter((e) =>
        (e.type?.toLowerCase() === 'goal' || e.type?.toLowerCase() === 'shot') &&
        e.team?.name === teams.away && (e.time?.elapsed ?? 0) >= 46,
      ).length;

      const shotsDelta = h2HomeShots - h2AwayShots;
      const possDelta = homePoss - 50; // Simplified — ideally compare HT vs FT

      if (possDelta > 8 && shotsDelta > 3) return this.findOptionByTeamName(options, teams.home) ?? null;
      if (possDelta < -8 && shotsDelta < -3) return this.findOptionByTeamName(options, teams.away) ?? null;
    }

    return options.find((o) =>
      o.name.toLowerCase().includes('không') || o.name.toLowerCase().includes('no clear'),
    )?.id ?? null;
  }

  // ─── Helper: find next goal after a minute ───

  private findNextGoalAfter(events: MatchEvent[], afterMinute: number): MatchEvent | undefined {
    return events
      .filter((e) => e.type?.toLowerCase() === 'goal' && (e.time?.elapsed ?? 0) > afterMinute)
      .sort((a, b) => (a.time?.elapsed ?? 0) - (b.time?.elapsed ?? 0))[0];
  }

  // ─── Score reconstruction ───

  private reconstructScoreAtMinute(
    events: MatchEvent[],
    minute: number,
    teams: { home: string; away: string },
  ): { home: number; away: number } {
    let home = 0;
    let away = 0;
    for (const e of events) {
      if (e.type?.toLowerCase() !== 'goal') continue;
      if ((e.time?.elapsed ?? 999) > minute) continue;
      const beneficiary = this.goalBeneficiary(e, teams);
      if (beneficiary === teams.home) home++;
      else if (beneficiary === teams.away) away++;
    }
    return { home, away };
  }

  private goalBeneficiary(
    event: MatchEvent,
    teams: { home: string; away: string },
  ): string | null {
    const eventTeam = event.team?.name;
    if (!eventTeam) return null;
    const isOwnGoal = event.detail?.toLowerCase().includes('own goal');
    if (isOwnGoal) return eventTeam === teams.home ? teams.away : teams.home;
    return eventTeam;
  }

  // ─── Legacy text-based fallback ───

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

    if (category === 'GOAL' && (text.includes('cuối trận') || text.includes('final score') || text.includes('tỷ số'))) {
      const scoreStr = `${score.home}-${score.away}`;
      const option = options.find((o) => o.name.includes(scoreStr));
      if (option) return option.id;
      return options.find((o) => o.name.toLowerCase().includes('khác') || o.name.toLowerCase().includes('other'))?.id ?? null;
    }

    if (category === 'STAT' && stats?.possession && (text.includes('kiểm soát') || text.includes('possession'))) {
      const homePoss = parseInt(stats.possession.home) || 50;
      if (homePoss > 55) return this.findOptionByTeamName(options, teams.home) ?? null;
      if (homePoss < 45) return this.findOptionByTeamName(options, teams.away) ?? null;
      return options.find((o) => o.name.toLowerCase().includes('cân bằng') || o.name.toLowerCase().includes('balanced'))?.id ?? null;
    }

    if (category === 'STAT' && stats?.shots && (text.includes('cú sút') || text.includes('shots'))) {
      return this.findRangeOption(options, (stats.shots.home ?? 0) + (stats.shots.away ?? 0));
    }

    if (category === 'CORNER' && stats?.corners && (text.includes('tổng') || text.includes('total'))) {
      return this.findRangeOption(options, (stats.corners.home ?? 0) + (stats.corners.away ?? 0));
    }

    if (category === 'TIME' && stoppageMinutes != null && (text.includes('bù') || text.includes('stoppage'))) {
      return this.findRangeOption(options, stoppageMinutes);
    }

    return null;
  }

  // ─── Template code cache ───

  private templateCodeCache = new Map<string, string>();

  private getTemplateCode(question: any): string | null {
    if (!question.templateId) return null;
    return this.templateCodeCache.get(question.templateId) ?? null;
  }

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
      const overMatch = name.match(/(\d+)\s*(?:\+|trở lên|over)/i) || name.match(/(?:over|trên|hơn)\s*(\d+)/);
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
    result.shotsOnTarget = {
      home: parseInt(findStat(home, 'Shots on Goal')) || 0,
      away: parseInt(findStat(away, 'Shots on Goal')) || 0,
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
