import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from '../common/api-football/api-football.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { QuestionResolverService } from '../questions/question-resolver.service';
import { QuestionGeneratorService } from '../questions/question-generator.service';
import { QuestionsService } from '../questions/questions.service';
import { ScheduleTracker } from './schedule-tracker';
import { PollBudgetService } from './poll-budget.service';
import { TRACKED_LEAGUE_IDS, PRIORITY_LEAGUE_IDS } from './leagues.config';

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
const LIVE_STATUSES = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P']);
const HT_STATUS = 'HT';

interface MatchState {
  fixtureId: number;
  period: string;
  elapsed: number;
  lastPhase: string; // Internal phase (EARLY_H1, MID_H1, etc.) for detecting phase changes
  teams: { home: string; away: string };
  score: { home: number; away: number };
  lineupsLoaded: boolean;
  lineupRetries: number;
  hasActiveQuestions: boolean;
  lastEventPoll: number;
  lastStatsPoll: number;
  eventsLastCount: number;
  lastSeenInApi: number; // Timestamp of last time this fixture appeared in live API
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
  private lastFixturePoll = 0;
  private lastOrphanCleanup = 0;

  constructor(
    private apiFootball: ApiFootballService,
    private prisma: PrismaService,
    private redis: RedisService,
    private ws: WebsocketGateway,
    private questionResolver: QuestionResolverService,
    private questionGenerator: QuestionGeneratorService,
    private questionsService: QuestionsService,
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
    this.logger.log('MatchDataManager starting (30s heartbeat)');
    // Clear stale fixture caches so league filter changes take effect immediately
    await this.redis.del('cache:fixtures:live');
    await this.redis.del('cache:fixtures:today');
    await this.scheduleTracker.refresh();
    await this.recoverMatchStates();
    this.heartbeat = setInterval(() => {
      if (!(this as any)._tickRunning) this.tick();
    }, 30_000);
    // Run first tick immediately
    this.tick();
  }

  /**
   * Recover match states from DB on startup.
   * Finds fixtures with active questions and pre-populates matchStates
   * so pollFixtures() doesn't treat them as new matches.
   */
  private async recoverMatchStates() {
    try {
      // Find fixtures with active questions created in the last 4 hours
      // (older ones are from finished matches that never got resolved — ignore them)
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60_000);
      const activeFixtures = await this.prisma.question.groupBy({
        by: ['fixtureId'],
        where: {
          status: { in: ['OPEN', 'PENDING', 'LOCKED'] },
          createdAt: { gte: fourHoursAgo },
        },
      });

      if (activeFixtures.length === 0) {
        this.logger.log('No active match states to recover from DB');
        return;
      }

      for (const { fixtureId } of activeFixtures) {
        // Get latest question to determine phase
        const latestQuestion = await this.prisma.question.findFirst({
          where: { fixtureId, status: { in: ['OPEN', 'PENDING', 'LOCKED'] } },
          orderBy: { opensAt: 'desc' },
        });

        // Get cached score/period from Redis
        const cached = await this.redis.getJson<any>(`cache:fixture:${fixtureId}:score`);
        const period = cached?.period ?? '2H';
        const elapsed = cached?.elapsed ?? latestQuestion?.matchMinute ?? 0;
        // Use current elapsed to determine phase — NOT the stale question's matchPhase
        // This prevents fake phase transitions (e.g., EARLY_H1 → MID_H2) on first tick
        const phase = this.questionGenerator.determinePhase(elapsed, period);

        // Create match state — pollFixtures will update teams/score from API
        this.matchStates.set(fixtureId, {
          fixtureId,
          period,
          elapsed,
          lastPhase: phase,
          teams: { home: 'TBD', away: 'TBD' },
          score: { home: cached?.homeScore ?? 0, away: cached?.awayScore ?? 0 },
          lineupsLoaded: false,
          lineupRetries: 0,
          hasActiveQuestions: true,
          lastEventPoll: 0,
          lastStatsPoll: 0,
          eventsLastCount: 0,
          lastSeenInApi: Date.now(),
        });

        // Clear stale cooldown so ensureQuestionsExist runs fresh
        await this.redis.del(`fixture:${fixtureId}:question-check`);
      }

      this.logger.log(`Recovered ${activeFixtures.length} match states from DB: ${activeFixtures.map(f => f.fixtureId).join(', ')}`);
    } catch (e) {
      this.logger.error(`Failed to recover match states: ${e}`);
    }
  }

  onModuleDestroy() {
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  // ─── Master loop ───

  private _tickRunning = false;

  private async tick() {
    if (this._tickRunning) return; // Prevent overlapping ticks

    // Redis lock: only one instance polls at a time (prevents dual-instance conflicts during deploy)
    const lockKey = 'lock:match-data-manager:tick';
    const lockValue = `${process.pid}-${Date.now()}`;
    const acquired = await this.redis.setNX(lockKey, lockValue, 60); // 60s TTL, only if not exists
    if (!acquired) return; // Another instance holds the lock

    this._tickRunning = true;
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
        // Still resolve expired timers even in sleep (DB query only, no API calls)
        await this.resolveExpiredTimers();
        return; // Skip all other polling
      }

      if (this.sleepMode && (minutesUntilNext <= 30 || hasLiveMatches)) {
        this.logger.log(`Waking up: match in ${Math.round(minutesUntilNext)} min`);
        this.sleepMode = false;
      }

      if (this.sleepMode) {
        await this.resolveExpiredTimers();
        return;
      }

      // 3. Poll fixtures — skip if just waiting for kickoff (no matches live yet)
      //    Only poll every 2 min when waiting, every 30s when matches are active
      if (hasLiveMatches || minutesUntilNext <= 5) {
        await this.pollFixtures();
      } else if (!this.lastFixturePoll || Date.now() - this.lastFixturePoll > 120_000) {
        await this.pollFixtures();
      }

      // 4. Fetch lineups for new matches
      await this.fetchMissingLineups();

      // 5a. Lock expired questions for all live matches (no API call needed)
      await this.lockAllExpired();

      // 5a2. Open any PENDING questions whose opensAt has arrived (no API call)
      await this.openReadyPending();

      // 5b. Poll events (only for matches with active questions)
      await this.pollEvents();

      // 6. Timer resolution (LOCKED questions with resolvesAt)
      await this.resolveExpiredTimers();

      // 7. Poll stats (every 10 min per match)
      await this.pollStats();

      // 8. Standings (every 30 min)
      await this.pollStandings();
    } catch (e) {
      this.logger.error(`Tick failed: ${e}`);
    } finally {
      this._tickRunning = false;
      await this.redis.del(lockKey);
    }
  }

  // ─── Step 3: Fixture polling ───

  private async pollFixtures() {
    if (this.apiFootball.isRateLimited() || !this.budget.canMakeCall()) return;

    const allFixtures = await this.apiFootball.getLiveFixtures();
    this.budget.recordCall();
    this.lastFixturePoll = Date.now();

    const allTracked = (allFixtures as any[]).filter(
      (f) => TRACKED_LEAGUE_IDS.has(f?.league?.id),
    );

    // Process ALL tracked matches — no cap.
    // pollFixtures is one API call; processing is DB-only (free).
    // Per-match API calls (events, stats, lineups) self-throttle via smart intervals.
    // Sort for cache: priority leagues first for client display.
    const fixtures = allTracked.sort((a, b) => {
      const aPriority = PRIORITY_LEAGUE_IDS.has(a?.league?.id) ? 0 : 1;
      const bPriority = PRIORITY_LEAGUE_IDS.has(b?.league?.id) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return (b?.fixture?.status?.elapsed ?? 0) - (a?.fixture?.status?.elapsed ?? 0);
    });

    // Only cache the capped list — frontend only sees matches we actively process
    await this.redis.setJson('cache:fixtures:live', fixtures, 45); // TTL > tick interval (30s) to prevent cache-miss API calls

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
        const initialPhase = this.questionGenerator.determinePhase(elapsed, period);
        state = {
          fixtureId: id, period, elapsed, lastPhase: initialPhase,
          teams, score,
          lineupsLoaded: false, lineupRetries: 0,
          hasActiveQuestions: false,
          lastEventPoll: 0, lastStatsPoll: 0, eventsLastCount: 0,
          lastSeenInApi: Date.now(),
        };
        this.matchStates.set(id, state);
        this.logger.log(`New match detected: ${homeTeam} vs ${awayTeam} (${period} ${elapsed}' → phase ${initialPhase})`);

        // Generate questions — catch up with previous phase + current phase
        if (LIVE_STATUSES.has(period)) {
          await this.questionGenerator.generateCatchUp(id, elapsed, teams, score, period);
          state.hasActiveQuestions = true;
        }

        // Fetch stats immediately for new matches (don't wait for stats polling interval)
        if (this.budget.canMakeCall()) {
          try {
            const stats = await this.apiFootball.getFixtureStatistics(id);
            this.budget.recordCall();
            state.lastStatsPoll = Date.now();
            await this.redis.setJson(`cache:fixture:${id}:stats`, stats, 600);
            const parsed = this.parseStats(stats as any[]);
            this.ws.emitToMatch(id, 'stats_update', { fixtureId: id, ...parsed });
          } catch (e) {
            this.logger.warn(`Initial stats fetch failed for ${id}: ${e}`);
          }
        }
      }

      const prevPeriod = state.period;
      state.period = period;
      state.elapsed = elapsed;
      state.score = score;
      state.lastSeenInApi = Date.now();

      // Handle API period transitions (1H→HT→2H→FT)
      let periodTransitioned = false;
      if (prevPeriod !== period) {
        await this.handlePeriodTransition(id, prevPeriod, period, elapsed, teams, score);
        state.lastPhase = this.questionGenerator.determinePhase(elapsed, period);
        periodTransitioned = true;
      }

      // Handle internal phase transitions (EARLY_H1→MID_H1→LATE_H1, etc.)
      // Only if no period transition already generated questions this tick
      if (LIVE_STATUSES.has(period) && !periodTransitioned) {
        const currentPhase = this.questionGenerator.determinePhase(elapsed, period);
        if (currentPhase !== state.lastPhase) {
          this.logger.log(`Fixture ${id}: internal phase ${state.lastPhase} → ${currentPhase} at ${elapsed}'`);
          state.lastPhase = currentPhase;
          await this.questionGenerator.generateForPhase(id, elapsed, teams, score, period);
          state.hasActiveQuestions = true;
        }
        await this.ensureQuestionsExist(id, period, elapsed, teams, score);
      }
    }

    // Clean up matches that disappeared from API (5-min grace period for glitches)
    const now = Date.now();
    for (const [id, state] of this.matchStates) {
      if (!liveIds.has(id)) {
        const missingFor = now - state.lastSeenInApi;
        if (missingFor > 300_000) { // 5 minutes
          this.logger.log(`Match ${id} missing from API for ${Math.round(missingFor / 1000)}s — treating as finished`);
          // Match likely ended — trigger onFullTime so questions get resolved
          try {
            await this.questionResolver.onFullTime(id, state.teams, state.score, undefined, 'FT');
            await this.questionGenerator.cleanupFixture(id);
          } catch (e) {
            this.logger.error(`Failed onFullTime for disappeared match ${id}: ${e}`);
          }
          this.matchStates.delete(id);
        }
      }
    }
  }

  // ─── Step 4: Lineup fetching ───

  private async fetchMissingLineups() {
    // Limit to 3 lineup fetches per tick to avoid burning API budget
    let fetchedThisTick = 0;
    for (const [id, state] of this.matchStates) {
      if (state.lineupsLoaded || state.lineupRetries >= 3) continue;
      if (fetchedThisTick >= 3) break;
      if (!this.budget.canMakeCall()) break;

      try {
        const lineups = await this.apiFootball.getFixtureLineups(id);
        this.budget.recordCall();
        fetchedThisTick++;

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

  /**
   * Lock expired questions for ALL live matches.
   * Runs every tick (15s), no API calls — just DB check.
   */
  private async lockAllExpired() {
    for (const [id] of this.matchStates) {
      await this.questionResolver.lockExpiredQuestions(id);
    }
  }

  /**
   * Open PENDING questions whose opensAt has arrived, for ALL live matches.
   * Fills the gap when no OPEN question exists and the next one is ready.
   */
  private async openReadyPending() {
    for (const [id] of this.matchStates) {
      // Only open if no OPEN question exists for this fixture
      const hasOpen = await this.questionsService.hasOpenQuestion(id);
      if (!hasOpen) {
        const opened = await this.questionsService.openNextPending(id);
        if (opened) {
          this.logger.log(`Fixture ${id}: auto-opened ready pending question "${opened.text.substring(0, 30)}..."`);
          this.ws.emitToMatch(id, 'new_question', {
            fixtureId: id,
            questionId: opened.id,
            text: opened.text,
            category: opened.category,
          });
        }
      }
    }
  }

  private async pollEvents() {
    if (this.apiFootball.isRateLimited()) return; // Skip during cooldown
    const now = Date.now();

    // Smart interval: scale based on number of active matches and budget
    // More matches → longer interval per match to stay within budget
    const activeMatchCount = [...this.matchStates.values()].filter(s => s.hasActiveQuestions).length;
    const baseInterval = this.budget.isThrottled() ? 120_000 : 60_000;
    // With 5 active matches: 60s. With 15: 180s. With 30: 360s.
    const interval = Math.max(baseInterval, activeMatchCount * 12_000);

    // Sort matches: those with LOCKED questions (need resolution) poll first
    const entries = [...this.matchStates.entries()]
      .filter(([, s]) => s.hasActiveQuestions)
      .sort((a, b) => a[1].lastEventPoll - b[1].lastEventPoll); // oldest poll first

    for (const [id, state] of entries) {
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

        // Process new events (locking already done in lockAllExpired)
        for (const event of newEvents) {
          this.ws.emitToMatch(id, 'match_event', {
            fixtureId: id,
            type: event.type,
            detail: event.detail,
            player: event.player?.name,
            minute: event.time?.elapsed,
            team: event.team?.name,
          });

          // Re-fetch lineups on substitution so future questions use updated player names
          // Only reset once per event poll cycle (not per individual sub event)
          // Cap total lineup fetches: only allow 1 re-fetch per match (retries reset to 2, not 0)
          if (event.type?.toLowerCase() === 'subst' && state.lineupsLoaded) {
            state.lineupsLoaded = false;
            state.lineupRetries = 2; // Allow 1 retry only (cap is 3)
          }

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

        // Refresh hasActiveQuestions since resolveQuestion may have opened a new PENDING
        const state = this.matchStates.get(question.fixtureId);
        if (state) state.hasActiveQuestions = true;
      }
    } catch (e) {
      this.logger.error(`Timer resolution failed: ${e}`);
    }

    // Cleanup: VOID orphaned LOCKED questions older than 3 hours (run every 10 min)
    if (Date.now() - this.lastOrphanCleanup > 600_000) {
      this.lastOrphanCleanup = Date.now();
      try {
        const cutoff = new Date(Date.now() - 10 * 60_000); // 10 min
        // Only void questions whose match is no longer tracked (disappeared from API)
        const liveFixtureIds = [...this.matchStates.keys()];
        const orphaned = await this.prisma.question.findMany({
          where: {
            status: { in: ['LOCKED', 'OPEN'] },
            closesAt: { lt: cutoff },
            resolvesAt: null,
            ...(liveFixtureIds.length > 0 ? { fixtureId: { notIn: liveFixtureIds } } : {}),
          },
          include: { options: true },
          take: 20, // Process in batches to avoid long ticks
        });

        for (const question of orphaned) {
          this.logger.warn(`Voiding orphaned "${question.text}" (${question.id})`);
          await this.questionResolver.voidQuestion(question.fixtureId, question, 'ORPHANED_2H');
        }
        if (orphaned.length > 0) {
          this.logger.log(`Orphan cleanup: voided ${orphaned.length} stuck questions`);
        }
      } catch (e) {
        this.logger.error(`Orphan cleanup failed: ${e}`);
      }
    }
  }

  // ─── Step 7: Stats polling ───

  private async pollStats() {
    if (this.apiFootball.isRateLimited()) return; // Skip during cooldown
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
    if (this.apiFootball.isRateLimited()) return; // Skip during cooldown
    if (Date.now() - this.lastStandingsPoll < 7200_000) return; // 2 hours
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
      await this.questionResolver.onFullTime(fixtureId, teams, score, stoppageMinutes, period);
      await this.questionGenerator.cleanupFixture(fixtureId);
    }

    // 2H kick-off (also handles case where HT was missed in API data)
    if (period === '2H' && (prevPeriod === HT_STATUS || prevPeriod === '1H')) {
      if (prevPeriod === '1H') {
        this.logger.warn(`Fixture ${fixtureId}: HT missed (${prevPeriod} → ${period}) — running HT resolution`);
        await this.questionResolver.onHalfTime(fixtureId, teams, score);
      }
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

    // Count ALL non-terminal questions (OPEN, PENDING, LOCKED)
    // LOCKED questions are still "active" — they're waiting for resolution
    const activeCount = await this.prisma.question.count({
      where: { fixtureId, status: { in: ['OPEN', 'PENDING', 'LOCKED'] } },
    });

    // Also count total questions ever generated for this fixture
    const totalGenerated = await this.prisma.question.count({
      where: { fixtureId },
    });

    const state = this.matchStates.get(fixtureId);

    if (totalGenerated === 0) {
      // Cold start: no questions ever for this fixture — generate now
      this.logger.log(`Fixture ${fixtureId}: zero questions ever — generating for ${period} ${elapsed}'`);
      await this.questionGenerator.generateForPhase(fixtureId, elapsed, teams, score, period);
      if (state) state.hasActiveQuestions = true;
    } else if (activeCount > 0) {
      if (state) state.hasActiveQuestions = true;
    } else {
      // All questions resolved/closed — but match is still live?
      // Check Redis phase guard first — don't regenerate if phase was already generated
      const currentPhase = this.questionGenerator.determinePhase(elapsed, period);
      const phaseKey = `phase:${fixtureId}:last-generated`;
      const cached = await this.redis.get(phaseKey);
      if (cached === currentPhase) {
        // Phase already generated — just mark inactive
        if (state) state.hasActiveQuestions = false;
        return;
      }

      const maxReached = totalGenerated >= 15;
      if (!maxReached) {
        this.logger.log(`Fixture ${fixtureId}: all ${totalGenerated} questions resolved, match still live at ${elapsed}' — generating more`);
        await this.questionGenerator.generateForPhase(fixtureId, elapsed, teams, score, period);
        if (state) state.hasActiveQuestions = true;
      } else {
        if (state) state.hasActiveQuestions = false;
      }
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
    result.shotsOnTarget = {
      home: findStat(home, 'Shots on Goal') ?? 0,
      away: findStat(away, 'Shots on Goal') ?? 0,
    };
    result.fouls = {
      home: findStat(home, 'Fouls') ?? 0,
      away: findStat(away, 'Fouls') ?? 0,
    };
    result.offsides = {
      home: findStat(home, 'Offsides') ?? 0,
      away: findStat(away, 'Offsides') ?? 0,
    };

    return result;
  }
}
