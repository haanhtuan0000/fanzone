import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballService } from '../common/api-football/api-football.service';
import { PollBudgetService } from '../matches/poll-budget.service';
import { MatchDataManager } from '../matches/match-data-manager.service';
import { AdminGuard } from './admin.guard';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private apiFootball: ApiFootballService,
    private budget: PollBudgetService,
    private matchManager: MatchDataManager,
  ) {}

  // ───────────────────────────────────────────────────────────
  // GET /admin/recent — system snapshot + recent fixtures
  // ───────────────────────────────────────────────────────────

  @Get('recent')
  async recent(@Query('hours') hoursParam?: string) {
    const hours = Math.min(Math.max(parseInt(hoursParam ?? '6', 10) || 6, 1), 72);
    const since = new Date(Date.now() - hours * 3600_000);

    // Recent fixtures with question/prediction counts
    const fixtureGroups = await this.prisma.question.groupBy({
      by: ['fixtureId'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const fixtureIds = fixtureGroups.map((g) => g.fixtureId);

    const [predictionCounts, statusCounts] = await Promise.all([
      this.prisma.prediction.groupBy({
        by: ['questionId'],
        where: { question: { fixtureId: { in: fixtureIds } } },
        _count: { _all: true },
      }),
      this.prisma.question.groupBy({
        by: ['fixtureId', 'status'],
        where: { fixtureId: { in: fixtureIds } },
        _count: { _all: true },
      }),
    ]);

    // Aggregate per-fixture status counts
    const statusByFixture = new Map<number, Record<string, number>>();
    for (const row of statusCounts) {
      const m = statusByFixture.get(row.fixtureId) ?? {};
      m[row.status] = row._count._all;
      statusByFixture.set(row.fixtureId, m);
    }
    const totalPredsByFixtureQ = new Map<string, number>();
    for (const row of predictionCounts) totalPredsByFixtureQ.set(row.questionId, row._count._all);

    const liveSnapshot = this.matchManager.getStateSnapshot();
    const liveById = new Map(liveSnapshot.map((s) => [s.fixtureId, s]));

    const fixtures = fixtureGroups
      .sort((a, b) => (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0))
      .map((g) => {
        const live = liveById.get(g.fixtureId);
        return {
          fixtureId: g.fixtureId,
          questionCount: g._count._all,
          statusCounts: statusByFixture.get(g.fixtureId) ?? {},
          lastQuestionAt: g._max.createdAt,
          live: live
            ? {
                period: live.period,
                elapsed: live.elapsed,
                score: live.score,
                teams: live.teams,
                lastSeenInApiAgoSec: Math.round((Date.now() - live.lastSeenInApi) / 1000),
                lastElapsedChangeAgoSec: Math.round((Date.now() - live.lastElapsedChange) / 1000),
              }
            : null,
        };
      });

    // System totals (across ALL fixtures, not just recent)
    const systemQuestionCounts = await this.prisma.question.groupBy({
      by: ['status'],
      where: { status: { in: ['OPEN', 'PENDING', 'LOCKED'] } },
      _count: { _all: true },
    });
    const systemTotals: Record<string, number> = {};
    for (const row of systemQuestionCounts) systemTotals[row.status] = row._count._all;

    return {
      sinceHours: hours,
      apiFootball: {
        ...this.apiFootball.getStatus(),
        rateLimited: this.apiFootball.isRateLimited(),
      },
      budget: this.budget.getUsage(),
      liveMatches: this.matchManager.getLiveMatchCount(),
      systemQuestionCounts: systemTotals,
      fixtures,
    };
  }

  // ───────────────────────────────────────────────────────────
  // GET /admin/fixtures/:id — match deep-dive
  // ───────────────────────────────────────────────────────────

  @Get('fixtures/:id')
  async fixture(@Param('id', ParseIntPipe) fixtureId: number) {
    const questions = await this.prisma.question.findMany({
      where: { fixtureId },
      include: {
        options: true,
        predictions: { select: { optionId: true, isCorrect: true } },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    if (questions.length === 0) {
      throw new NotFoundException(`No questions found for fixture ${fixtureId}`);
    }

    const tplIds = [...new Set(questions.map((q) => q.templateId).filter((x): x is string => !!x))];
    const templates = await this.prisma.questionTemplate.findMany({
      where: { id: { in: tplIds } },
      select: { id: true, code: true, category: true, difficulty: true, trigger: true, phases: true, voidCondition: true },
    });
    const tplById = new Map(templates.map((t) => [t.id, t]));

    // Aggregate per-question prediction counts per option
    const questionsOut = questions.map((q) => {
      const tpl = q.templateId ? tplById.get(q.templateId) : undefined;
      const perOption = new Map<string, { picks: number; correctPicks: number }>();
      for (const p of q.predictions) {
        const cur = perOption.get(p.optionId) ?? { picks: 0, correctPicks: 0 };
        cur.picks++;
        if (p.isCorrect) cur.correctPicks++;
        perOption.set(p.optionId, cur);
      }
      return {
        id: q.id,
        templateCode: tpl?.code ?? null,
        templateCategory: tpl?.category ?? q.category,
        difficulty: q.difficulty,
        matchPhase: q.matchPhase,
        matchMinute: q.matchMinute,
        status: q.status,
        text: q.text,
        rewardCoins: q.rewardCoins,
        triggeredByEvent: q.triggeredByEvent,
        opensAt: q.opensAt,
        closesAt: q.closesAt,
        resolvesAt: q.resolvesAt,
        createdAt: q.createdAt,
        correctOptionId: q.correctOptionId,
        options: q.options.map((o) => ({
          id: o.id,
          name: o.name,
          isCorrect: o.isCorrect,
          fanCount: o.fanCount,
          ...(perOption.get(o.id) ?? { picks: 0, correctPicks: 0 }),
        })),
        predictionCount: q.predictions.length,
      };
    });

    // Aggregate counts per phase + status
    const aggregates = {
      total: questions.length,
      byPhase: {} as Record<string, number>,
      byStatus: {} as Record<string, number>,
      byTemplate: {} as Record<string, number>,
    };
    for (const q of questionsOut) {
      const phase = q.matchPhase ?? 'NULL';
      aggregates.byPhase[phase] = (aggregates.byPhase[phase] ?? 0) + 1;
      aggregates.byStatus[q.status] = (aggregates.byStatus[q.status] ?? 0) + 1;
      const code = q.templateCode ?? '???';
      aggregates.byTemplate[code] = (aggregates.byTemplate[code] ?? 0) + 1;
    }

    // Cached events + stats from Redis
    const [cachedEvents, cachedStats, lastGeneratedPhase, usedTemplateIds] = await Promise.all([
      this.redis.getJson<any[]>(`cache:fixture:${fixtureId}:events`),
      this.redis.getJson<any>(`cache:fixture:${fixtureId}:stats`),
      this.redis.get(`phase:${fixtureId}:last-generated`),
      this.redis.hgetall(`fixture:${fixtureId}:used-templates`),
    ]);

    // Recent feed events
    const feedEvents = await this.prisma.feedEvent.findMany({
      where: { fixtureId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });

    // Match leaderboard top 20
    const lbEntries = await this.redis.zrevrangeWithScores(`lb:match:${fixtureId}`, 0, 19);
    const lbUserIds = lbEntries.map((e) => e.member);
    const lbUsers = lbUserIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: lbUserIds } },
          select: { id: true, displayName: true, email: true, avatarEmoji: true, countryCode: true },
        })
      : [];
    const lbUserMap = new Map(lbUsers.map((u) => [u.id, u]));
    const leaderboard = lbEntries.map((e, i) => {
      const u = lbUserMap.get(e.member);
      return {
        rank: i + 1,
        userId: e.member,
        displayName: u?.displayName ?? null,
        email: u?.email ?? null,
        avatarEmoji: u?.avatarEmoji ?? null,
        countryCode: u?.countryCode ?? null,
        matchCoinsEarned: e.score,
      };
    });

    return {
      fixtureId,
      matchState: this.matchManager.getStateSnapshot(fixtureId)[0] ?? null,
      generation: {
        lastGeneratedPhase,
        usedTemplateIds: Object.keys(usedTemplateIds ?? {}),
      },
      cache: {
        eventsCount: Array.isArray(cachedEvents) ? cachedEvents.length : 0,
        events: cachedEvents,
        stats: cachedStats,
      },
      aggregates,
      questions: questionsOut,
      leaderboard,
      feedEvents: feedEvents.map((f) => ({
        id: f.id,
        type: f.type,
        message: f.message,
        coinsDelta: f.coinsDelta,
        createdAt: f.createdAt,
        user: f.user
          ? { id: f.user.id, displayName: f.user.displayName, email: f.user.email }
          : null,
      })),
    };
  }

  // ───────────────────────────────────────────────────────────
  // GET /admin/questions/:id — single-question deep-dive
  // ───────────────────────────────────────────────────────────

  @Get('questions/:id')
  async question(@Param('id') questionId: string) {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    });
    if (!q) throw new NotFoundException(`Question ${questionId} not found`);

    const [tpl, predictions, cachedEvents] = await Promise.all([
      q.templateId
        ? this.prisma.questionTemplate.findUnique({ where: { id: q.templateId } })
        : Promise.resolve(null),
      this.prisma.prediction.findMany({
        where: { questionId },
        include: {
          user: { select: { id: true, displayName: true, email: true, avatarEmoji: true } },
          option: { select: { id: true, name: true } },
        },
        orderBy: { predictedAt: 'asc' },
      }),
      this.redis.getJson<any[]>(`cache:fixture:${q.fixtureId}:events`),
    ]);

    return {
      question: {
        id: q.id,
        fixtureId: q.fixtureId,
        templateId: q.templateId,
        templateCode: tpl?.code ?? null,
        category: q.category,
        difficulty: q.difficulty,
        matchPhase: q.matchPhase,
        matchMinute: q.matchMinute,
        status: q.status,
        text: q.text,
        rewardCoins: q.rewardCoins,
        triggeredByEvent: q.triggeredByEvent,
        opensAt: q.opensAt,
        closesAt: q.closesAt,
        resolvesAt: q.resolvesAt,
        createdAt: q.createdAt,
        correctOptionId: q.correctOptionId,
        metadata: q.metadata,
        options: q.options.map((o) => ({
          id: o.id,
          name: o.name,
          emoji: o.emoji,
          info: o.info,
          multiplier: o.multiplier,
          fanCount: o.fanCount,
          isCorrect: o.isCorrect,
        })),
      },
      template: tpl
        ? {
            id: tpl.id,
            code: tpl.code,
            category: tpl.category,
            difficulty: tpl.difficulty,
            trigger: tpl.trigger,
            phases: tpl.phases,
            resolutionStrategy: tpl.resolutionStrategy,
            timeoutWindowMin: tpl.timeoutWindowMin,
            voidCondition: tpl.voidCondition,
            answerWindowSec: tpl.answerWindowSec,
            isActive: tpl.isActive,
          }
        : null,
      predictions: predictions.map((p) => ({
        id: p.id,
        userId: p.userId,
        username: p.user?.displayName ?? p.user?.email ?? null,
        avatarEmoji: p.user?.avatarEmoji ?? null,
        pickedOptionId: p.optionId,
        pickedOptionName: p.option?.name,
        coinsBet: p.coinsBet,
        coinsResult: p.coinsResult,
        xpEarned: p.xpEarned,
        isCorrect: p.isCorrect,
        predictedAt: p.predictedAt,
        resolvedAt: p.resolvedAt,
      })),
      lifecycle: {
        createdAt: q.createdAt,
        opensAt: q.opensAt,
        closesAt: q.closesAt,
        resolvesAt: q.resolvesAt,
        // Inferred: if resolvesAt set + correctOptionId set → resolved
        // If status=VOIDED → voided
        // Status field tells the rest of the story
        currentStatus: q.status,
      },
      // Events relevant to this question's resolution: filtered by template trigger if available
      relevantEvents: Array.isArray(cachedEvents)
        ? cachedEvents.filter((e: any) => {
            if (!tpl) return false;
            const t = (e?.type ?? '').toLowerCase();
            switch (tpl.category) {
              case 'GOAL': return t === 'goal';
              case 'CARD': return t === 'card';
              case 'CORNER': return t === 'corner';
              case 'VAR': return t === 'var';
              case 'SUB':
              case 'SUBSTITUTION': return t === 'subst';
              default: return true;
            }
          })
        : [],
    };
  }

  // ───────────────────────────────────────────────────────────
  // GET /admin/users/:userId — user audit (also accepts ?username=)
  // ───────────────────────────────────────────────────────────

  @Get('users/:userId')
  async user(@Param('userId') userIdParam: string, @Query('username') username?: string) {
    // Support lookup by email (since `displayName` isn't unique) when 'me' or unknown id given
    let user = await this.prisma.user.findUnique({ where: { id: userIdParam } });
    if (!user && username) user = await this.prisma.user.findUnique({ where: { email: username } });
    if (!user && userIdParam.includes('@')) user = await this.prisma.user.findUnique({ where: { email: userIdParam } });
    if (!user) {
      // Fallback: best-effort search by displayName
      user = await this.prisma.user.findFirst({
        where: { displayName: { equals: userIdParam, mode: 'insensitive' } },
      });
    }
    if (!user) throw new NotFoundException(`User not found: ${userIdParam}${username ? ` / ${username}` : ''}`);

    const [predictions, transactions, achievements, devices] = await Promise.all([
      this.prisma.prediction.findMany({
        where: { userId: user.id },
        orderBy: { predictedAt: 'desc' },
        take: 100,
        include: {
          option: { select: { id: true, name: true } },
          question: {
            select: {
              id: true,
              fixtureId: true,
              status: true,
              text: true,
              matchPhase: true,
              matchMinute: true,
              correctOptionId: true,
              templateId: true,
            },
          },
        },
      }),
      this.prisma.coinTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.userAchievement.findMany({
        where: { userId: user.id },
        include: { achievement: true },
        orderBy: { earnedAt: 'desc' },
      }),
      this.prisma.userDevice.findMany({
        where: { userId: user.id },
        select: { id: true, platform: true, createdAt: true, fcmToken: true },
      }),
    ]);

    // Look up template codes for predictions
    const tplIds = [...new Set(predictions.map((p) => p.question.templateId).filter((x): x is string => !!x))];
    const templates = tplIds.length
      ? await this.prisma.questionTemplate.findMany({
          where: { id: { in: tplIds } },
          select: { id: true, code: true },
        })
      : [];
    const tplCode = new Map(templates.map((t) => [t.id, t.code]));

    return {
      profile: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarEmoji: user.avatarEmoji,
        countryCode: user.countryCode,
        favoriteTeamId: user.favoriteTeamId,
        coins: user.coins,
        level: user.level,
        currentXp: user.currentXp,
        streakDays: user.streakDays,
        lastActiveDate: user.lastActiveDate,
        totalPredictions: user.totalPredictions,
        correctPredictions: user.correctPredictions,
        accuracy:
          user.totalPredictions > 0
            ? Math.round((user.correctPredictions / user.totalPredictions) * 100)
            : null,
        globalRank: user.globalRank,
        createdAt: user.createdAt,
      },
      predictions: predictions.map((p) => {
        const correct = p.question.correctOptionId === p.optionId;
        return {
          id: p.id,
          fixtureId: p.question.fixtureId,
          questionId: p.questionId,
          questionText: p.question.text,
          questionStatus: p.question.status,
          templateCode: p.question.templateId ? tplCode.get(p.question.templateId) ?? null : null,
          matchPhase: p.question.matchPhase,
          matchMinute: p.question.matchMinute,
          pickedOptionId: p.optionId,
          pickedOptionName: p.option?.name,
          isCorrect: p.isCorrect,
          // Defensive: surface DB inconsistency where stored isCorrect doesn't match the resolved correctOption
          isCorrectDerived: correct,
          coinsBet: p.coinsBet,
          coinsResult: p.coinsResult,
          xpEarned: p.xpEarned,
          predictedAt: p.predictedAt,
          resolvedAt: p.resolvedAt,
          // Helps triage "I made a prediction but don't see it after FT"
          missingFromUi: p.question.status === 'RESOLVED' && p.coinsResult == null,
        };
      }),
      coinTransactions: transactions,
      achievements: achievements.map((a) => ({
        id: a.achievement.id,
        name: a.achievement.name,
        description: a.achievement.description,
        progress: a.progress,
        earnedAt: a.earnedAt,
      })),
      devices,
    };
  }
}
