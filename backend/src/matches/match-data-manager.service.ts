import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from '../common/api-football/api-football.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { QuestionResolverService } from '../questions/question-resolver.service';
import { QuestionGeneratorService } from '../questions/question-generator.service';
import { ScheduleTracker } from './schedule-tracker';
import { PollBudgetService } from './poll-budget.service';
import { TRACKED_LEAGUE_IDS } from './leagues.config';

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P']);
const HT_STATUS = 'HT';

interface MatchState {
  fixtureId: number;
  period: string;
  elapsed: number;
  teams: { home: string; away: string };
  score: { home: number; away: number };
  lineupsLoaded: boolean;
  lineupRetries: number;
  hasActiveQuestions: boolean;
  lastEventPoll: number;
  lastStatsPoll: number;
  eventsLastCount: number;
}

/**
 * Single coordinator replacing all 5 pollers.
 * Runs a 15s heartbeat and decides what to poll based on state.
 */
@Injectable()
export class MatchDataManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchDataManager.name);
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly mockMode: boolean;
  private matchStates = new Map<number, MatchState>();
  private sleepMode = true;
  private lastStandingsPoll = 0;

  constructor(
    private apiFootball: ApiFootballService,
    private prisma: PrismaService,
    private redis: RedisService,
    private ws: WebsocketGateway,
    private questionResolver: QuestionResolverService,
    private questionGenerator: QuestionGeneratorService,
    private scheduleTracker: ScheduleTracker,
    private budget: PollBudgetService,
    private config: ConfigService,
  ) {
    this.mockMode = this.config.get('MOCK_MODE') === 'true';
  }

  async onModuleInit() {
    if (this.mockMode) {
      this.logger.log('MatchDataManager DISABLED (MOCK_MODE=true)');
      return;
    }
    this.logger.log('MatchDataManager starting (15s heartbeat)');
    await this.scheduleTracker.refresh();
    this.heartbeat = setInterval(() => this.tick(), 15_000);
    // Run first tick immediately
    this.tick();
  }

  onModuleDestroy() {
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  // ─── Master loop ───

  private async tick() {
    try {
      // 1. Schedule check
      await this.scheduleTracker.refreshIfNeeded();

      // 2. Sleep/wake decision
      const minutesUntilNext = await this.scheduleTracker.minutesUntilNextKickoff();
      const hasLiveMatches = this.matchStates.size > 0;

      if (!hasLiveMatches && minutesUntilNext > 120) {
        if (!this.sleepMode) {
          this.logger.log(`No matches for ${Math.round(minutesUntilNext)} min — entering sleep mode`);
          this.sleepMode = true;
        }
        return; // Skip all polling
      }

      if (this.sleepMode && (minutesUntilNext <= 30 || hasLiveMatches)) {
        this.logger.log(`Waking up: match in ${Math.round(minutesUntilNext)} min`);
        this.sleepMode = false;
      }

      if (this.sleepMode) return;

      // 3. Poll fixtures (1 API call for all live matches)
      await this.pollFixtures();

      // 4. Fetch lineups for new matches
      await this.fetchMissingLineups();

      // 5. Poll events (only for matches with active questions)
      await this.pollEvents();

      // 6. Timer resolution (LOCKED questions with resolvesAt)
      await this.resolveExpiredTimers();

      // 7. Poll stats (every 10 min per match)
      await this.pollStats();

      // 8. Standings (every 30 min)
      await this.pollStandings();
    } catch (e) {
      this.logger.error(`Tick failed: ${e}`);
    }
  }

  // ─── Step 3: Fixture polling ───

  private async pollFixtures() {
    if (!this.budget.canMakeCall()) return;

    const allFixtures = await this.apiFootball.getLiveFixtures();
    this.budget.recordCall();

    const fixtures = (allFixtures as any[]).filter(
      (f) => TRACKED_LEAGUE_IDS.has(f?.league?.id),
    );
    await this.redis.setJson('cache:fixtures:live', fixtures, 20);

    // Track which fixtures are still live
    const liveIds = new Set<number>();

    for (const fixture of fixtures) {
      const id = fixture?.fixture?.id;
      if (!id) continue;

      const period: string = fixture?.fixture?.status?.short ?? '';
      const elapsed: number = fixture?.fixture?.status?.elapsed ?? 0;
      const homeTeam = fixture?.teams?.home?.name;
      const awayTeam = fixture?.teams?.away?.name;
      const homeScore = fixture?.goals?.home ?? 0;
      const awayScore = fixture?.goals?.away ?? 0;

      if (!homeTeam || !awayTeam) continue;

      liveIds.add(id);

      // Update Redis + broadcast score
      await this.redis.setJson(`cache:fixture:${id}:score`, {
        homeScore, awayScore, elapsed, period,
      }, 20);

      this.ws.emitToMatch(id, 'score_update', {
        fixtureId: id, homeScore, awayScore, clock: elapsed, period,
      });

      // Get or create match state
      const teams = { home: homeTeam, away: awayTeam };
      const score = { home: homeScore, away: awayScore };
      let state = this.matchStates.get(id);

      if (!state) {
        // New match detected
        state = {
          fixtureId: id, period, elapsed, teams, score,
          lineupsLoaded: false, lineupRetries: 0,
          hasActiveQuestions: false,
          lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0,
        };
        this.matchStates.set(id, state);
        this.logger.log(`New match detected: ${homeTeam} vs ${awayTeam} (${period} ${elapsed}')`);

        // Generate questions for current phase
        if (LIVE_STATUSES.has(period)) {
          await this.questionGenerator.generateForPhase(id, elapsed, teams, score, period);
          state.hasActiveQuestions = true;
        }
      }

      const prevPeriod = state.period;
      state.period = period;
      state.elapsed = elapsed;
      state.score = score;

      // Handle period transitions
      if (prevPeriod !== period) {
        await this.handlePeriodTransition(id, prevPeriod, period, elapsed, teams, score);
      }

      // Ensure questions exist (every 60s check)
      if (LIVE_STATUSES.has(period)) {
        await this.ensureQuestionsExist(id, period, elapsed, teams, score);
      }
    }

    // Clean up finished matches
    for (const [id, state] of this.matchStates) {
      if (!liveIds.has(id)) {
        this.logger.log(`Match ${id} no longer live — cleaning up`);
        this.matchStates.delete(id);
      }
    }
  }

  // ─── Step 4: Lineup fetching ───

  private async fetchMissingLineups() {
    for (const [id, state] of this.matchStates) {
      if (state.lineupsLoaded || state.lineupRetries >= 3) continue;
      if (!this.budget.canMakeCall()) break;

      try {
        const lineups = await this.apiFootball.getFixtureLineups(id);
        this.budget.recordCall();

        if ((lineups as any[]).length >= 2) {
          const parsed = this.parseLineups(lineups as any[]);
          await this.redis.setJson(`fixture:${id}:lineup`, parsed, 14400); // 4h TTL
          state.lineupsLoaded = true;
          this.logger.log(`Lineups cached for fixture ${id}`);
        } else {
          state.lineupRetries++;
          this.logger.debug(`Lineups not available yet for ${id} (retry ${state.lineupRetries}/3)`);
        }
      } catch (e) {
        state.lineupRetries++;
        this.logger.warn(`Lineup fetch failed for ${id}: ${e}`);
      }
    }
  }

  private parseLineups(lineups: any[]): any {
    const parse = (team: any) => {
      const startXI = team?.startXI ?? [];
      const strikers = startXI
        .filter((p: any) => p?.player?.pos === 'F')
        .map((p: any) => p?.player?.name);
      const midfielders = startXI
        .filter((p: any) => p?.player?.pos === 'M')
        .map((p: any) => p?.player?.name);
      const goalkeeper = startXI
        .find((p: any) => p?.player?.pos === 'G')?.player?.name;
      return { strikers, midfielders, goalkeeper };
    };

    return {
      home: parse(lineups[0]),
      away: parse(lineups[1]),
    };
  }

  // ─── Step 5: Event polling (selective) ───

  private async pollEvents() {
    const now = Date.now();
    const interval = this.budget.isThrottled() ? 120_000 : 60_000; // 60s normal, 120s throttled

    for (const [id, state] of this.matchStates) {
      // Only poll if match has active questions
      if (!state.hasActiveQuestions) continue;
      // Respect interval
      if (now - state.lastEventPoll < interval) continue;
      if (!this.budget.canMakeCall()) break;

      try {
        const events = await this.apiFootball.getFixtureEvents(id);
        this.budget.recordCall();
        state.lastEventPoll = now;

        // Cache events
        await this.redis.setJson(`cache:fixture:${id}:events`, events, 120);

        // Detect new events
        const newEvents = (events as any[]).slice(state.eventsLastCount);
        state.eventsLastCount = (events as any[]).length;

        // Lock expired questions first
        await this.questionResolver.lockExpiredQuestions(id);

        // Process new events
        for (const event of newEvents) {
          this.ws.emitToMatch(id, 'match_event', {
            fixtureId: id,
            type: event.type,
            detail: event.detail,
            player: event.player?.name,
            minute: event.time?.elapsed,
            team: event.team?.name,
          });

          const resolved = await this.questionResolver.tryResolveFromEvent(
            id, event, state.teams,
          );

          if (!resolved) {
            const question = await this.questionGenerator.generateFromEvent(
              id, event, state.teams, state.score,
            );
            if (question) {
              this.ws.emitToMatch(id, 'new_question', {
                fixtureId: id,
                questionId: question.id,
                text: question.text,
                category: question.category,
              });
            }
          }
        }
      } catch (e) {
        this.logger.error(`Event poll failed for ${id}: ${e}`);
      }
    }
  }

  // ─── Step 6: Timer resolution ───

  private async resolveExpiredTimers() {
    try {
      const expired = await this.prisma.question.findMany({
        where: {
          status: 'LOCKED',
          resolvesAt: { not: null, lte: new Date() },
        },
        include: { options: true },
      });

      for (const question of expired) {
        // Default to "no" option for TIMEOUT_DEFAULT questions
        const noOption = question.options.find((o) =>
          o.name.toLowerCase().startsWith('không') ||
          o.name.toLowerCase().startsWith('no ') ||
          o.name.toLowerCase() === 'no',
        );

        const correctOptionId = noOption?.id ?? question.options[question.options.length - 1]?.id;
        if (!correctOptionId) continue;

        this.logger.log(`Timer expired: "${question.text}" → default option`);

        // Use the resolver's resolveQuestion for consistent scoring/broadcasting
        await this.questionResolver.resolveTimedOut(
          question.fixtureId, question, correctOptionId,
        );
      }
    } catch (e) {
      this.logger.error(`Timer resolution failed: ${e}`);
    }
  }

  // ─── Step 7: Stats polling ───

  private async pollStats() {
    const now = Date.now();
    const interval = this.budget.isThrottled() ? 600_000 : 300_000; // 5-10 min

    for (const [id, state] of this.matchStates) {
      if (now - state.lastStatsPoll < interval) continue;
      if (!this.budget.canMakeCall()) break;

      try {
        const stats = await this.apiFootball.getFixtureStatistics(id);
        this.budget.recordCall();
        state.lastStatsPoll = now;

        await this.redis.setJson(`cache:fixture:${id}:stats`, stats, 600);

        // Broadcast parsed stats
        const parsed = this.parseStats(stats as any[]);
        this.ws.emitToMatch(id, 'stats_update', { fixtureId: id, ...parsed });
      } catch (e) {
        this.logger.error(`Stats poll failed for ${id}: ${e}`);
      }
    }
  }

  // ─── Step 8: Standings ───

  private async pollStandings() {
    if (Date.now() - this.lastStandingsPoll < 1800_000) return; // 30 min
    this.lastStandingsPoll = Date.now();

    const leagues = [
      { id: 39, season: 2025 },
      { id: 140, season: 2025 },
      { id: 135, season: 2025 },
      { id: 78, season: 2025 },
      { id: 61, season: 2025 },
    ];

    for (const league of leagues) {
      if (!this.budget.canMakeCall()) break;
      try {
        const data = await this.apiFootball.getStandings(league.id, league.season);
        this.budget.recordCall();
        await this.redis.setJson(`cache:standings:${league.id}`, data, 1800);
      } catch (e) {
        this.logger.error(`Standings poll failed for league ${league.id}: ${e}`);
      }
    }
  }

  // ─── Period transitions ───

  private async handlePeriodTransition(
    fixtureId: number,
    prevPeriod: string,
    period: string,
    elapsed: number,
    teams: { home: string; away: string },
    score: { home: number; away: number },
  ) {
    this.logger.log(`Fixture ${fixtureId}: ${prevPeriod} → ${period}`);

    // Half-time
    if (period === HT_STATUS && prevPeriod !== HT_STATUS) {
      await this.questionResolver.onHalfTime(fixtureId, teams, score);
      await this.questionGenerator.generateForPhase(fixtureId, 45, teams, score, 'HT');
    }

    // Full-time
    if (FINISHED_STATUSES.has(period) && !FINISHED_STATUSES.has(prevPeriod)) {
      const stoppageMinutes = elapsed > 90 ? elapsed - 90 : undefined;
      await this.questionResolver.onFullTime(fixtureId, teams, score, stoppageMinutes);
      await this.questionGenerator.cleanupFixture(fixtureId);
    }

    // 2H kick-off
    if (period === '2H' && prevPeriod === HT_STATUS) {
      await this.questionGenerator.generateForPhase(fixtureId, elapsed, teams, score, '2H');
    }
  }

  // ─── Ensure questions exist ───

  private async ensureQuestionsExist(
    fixtureId: number,
    period: string,
    elapsed: number,
    teams: { home: string; away: string },
    score: { home: number; away: number },
  ) {
    const cooldownKey = `fixture:${fixtureId}:question-check`;
    const lastCheck = await this.redis.get(cooldownKey);
    if (lastCheck) return;
    await this.redis.set(cooldownKey, '1', 60);

    const activeCount = await this.prisma.question.count({
      where: { fixtureId, status: { in: ['OPEN', 'PENDING'] } },
    });

    const state = this.matchStates.get(fixtureId);

    if (activeCount === 0) {
      this.logger.log(`Fixture ${fixtureId}: no active questions at ${period} ${elapsed}' — generating`);
      await this.questionGenerator.generateForPhase(fixtureId, elapsed, teams, score, period);
      if (state) state.hasActiveQuestions = true;
    } else {
      if (state) state.hasActiveQuestions = true;
    }

    // Also check LOCKED questions for hasActiveQuestions flag
    if (state && activeCount === 0) {
      const lockedCount = await this.prisma.question.count({
        where: { fixtureId, status: 'LOCKED' },
      });
      state.hasActiveQuestions = lockedCount > 0;
    }
  }

  // ─── Helpers ───

  private parseStats(stats: any[]): Record<string, any> {
    const result: Record<string, any> = {};
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
      home: findStat(home, 'Total Shots') ?? 0,
      away: findStat(away, 'Total Shots') ?? 0,
    };
    result.yellowCards = {
      home: findStat(home, 'Yellow Cards') ?? 0,
      away: findStat(away, 'Yellow Cards') ?? 0,
    };
    result.corners = {
      home: findStat(home, 'Corner Kicks') ?? 0,
      away: findStat(away, 'Corner Kicks') ?? 0,
    };

    return result;
  }
}
