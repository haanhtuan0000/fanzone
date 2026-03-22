import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from '../../common/api-football/api-football.service';
import { RedisService } from '../../common/redis/redis.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { QuestionResolverService } from '../../questions/question-resolver.service';
import { QuestionGeneratorService } from '../../questions/question-generator.service';
import { TRACKED_LEAGUE_IDS } from '../leagues.config';

/**
 * API-Football status codes:
 *   1H = first half, HT = half-time, 2H = second half,
 *   ET = extra time, BT = break, P = penalties,
 *   FT = full-time, AET = after extra time, PEN = after penalties,
 *   SUSP/INT/PST/CANC/ABD/AWD/WO = non-playing states
 */
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
const HT_STATUS = 'HT';

@Injectable()
export class FixturePoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FixturePoller.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly mockMode: boolean;

  constructor(
    private apiFootball: ApiFootballService,
    private redis: RedisService,
    private ws: WebsocketGateway,
    private questionResolver: QuestionResolverService,
    private questionGenerator: QuestionGeneratorService,
    private config: ConfigService,
  ) {
    this.mockMode = this.config.get('MOCK_MODE') === 'true';
  }

  onModuleInit() {
    if (this.mockMode) {
      this.logger.log('Fixture poller DISABLED (MOCK_MODE=true)');
      return;
    }
    this.logger.log('Starting fixture poller (every 15s)');
    this.poll();
    this.intervalId = setInterval(() => this.poll(), 15_000);
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async poll() {
    try {
      const allFixtures = await this.apiFootball.getLiveFixtures();
      const fixtures = (allFixtures as any[]).filter(
        (f) => TRACKED_LEAGUE_IDS.has(f?.league?.id),
      );
      await this.redis.setJson('cache:fixtures:live', fixtures, 20);

      for (const fixture of fixtures) {
        const id = fixture?.fixture?.id;
        if (!id) continue;

        const homeScore = fixture?.goals?.home ?? 0;
        const awayScore = fixture?.goals?.away ?? 0;
        const elapsed = fixture?.fixture?.status?.elapsed;
        const period: string = fixture?.fixture?.status?.short ?? '';
        const homeTeam = fixture?.teams?.home?.name;
        const awayTeam = fixture?.teams?.away?.name;

        await this.redis.setJson(`cache:fixture:${id}:score`, {
          homeScore, awayScore, elapsed, period,
        }, 20);

        this.ws.emitToMatch(id, 'score_update', {
          fixtureId: id, homeScore, awayScore, clock: elapsed, period,
        });

        // ─── Detect period transitions ───
        if (homeTeam && awayTeam) {
          await this.handlePeriodTransition(
            id, period, elapsed,
            { home: homeTeam, away: awayTeam },
            { home: homeScore, away: awayScore },
          );
        }
      }

      if (fixtures.length > 0) {
        this.logger.debug(`Polled ${fixtures.length} live fixtures`);
      }
    } catch (error) {
      this.logger.error(`Fixture poll failed: ${error}`);
    }
  }

  /**
   * Detect HT / FT / phase changes by comparing current status to the
   * last-seen status stored in Redis.  Fires resolution + generation hooks
   * exactly once per transition.
   */
  private async handlePeriodTransition(
    fixtureId: number,
    period: string,
    elapsed: number,
    teams: { home: string; away: string },
    score: { home: number; away: number },
  ) {
    const redisKey = `cache:fixture:${fixtureId}:period`;
    const prevPeriod = await this.redis.get(redisKey);

    // No change — skip
    if (prevPeriod === period) return;

    // Persist the new status (TTL 3h to survive long matches / extra time)
    await this.redis.set(redisKey, period, 10_800);

    this.logger.log(
      `Fixture ${fixtureId}: period transition ${prevPeriod ?? '(none)'} → ${period}`,
    );

    // ── Half-time: resolve HT questions, generate HT-phase questions ──
    if (period === HT_STATUS && prevPeriod !== HT_STATUS) {
      this.logger.log(`Triggering half-time resolution for fixture ${fixtureId}`);
      await this.questionResolver.onHalfTime(fixtureId, teams, score);
      await this.questionGenerator.generateForPhase(fixtureId, 45, teams, score, 'HT');
    }

    // ── Full-time: resolve all remaining questions with final stats ──
    if (FINISHED_STATUSES.has(period) && !FINISHED_STATUSES.has(prevPeriod ?? '')) {
      // Try to determine added time from elapsed clock (e.g. 95 → 5 min stoppage)
      const stoppageMinutes = elapsed > 90 ? elapsed - 90 : undefined;

      this.logger.log(`Triggering full-time resolution for fixture ${fixtureId}`);
      await this.questionResolver.onFullTime(fixtureId, teams, score, stoppageMinutes);
      await this.questionGenerator.cleanupFixture(fixtureId);
    }

    // ── 2H kick-off: generate second-half scheduled questions ──
    if (period === '2H' && prevPeriod === HT_STATUS) {
      this.logger.log(`Second half started for fixture ${fixtureId} — generating 2H questions`);
      await this.questionGenerator.generateForPhase(fixtureId, elapsed, teams, score, '2H');
    }

    // ── Phase-based question generation for in-play periods ──
    if (period === '1H' && !prevPeriod) {
      this.logger.log(`Match started for fixture ${fixtureId} — generating 1H questions`);
      await this.questionGenerator.generateForPhase(fixtureId, elapsed, teams, score, '1H');
    }
  }
}
