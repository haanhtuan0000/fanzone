import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from '../../common/api-football/api-football.service';
import { RedisService } from '../../common/redis/redis.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { QuestionResolverService } from '../../questions/question-resolver.service';
import { QuestionGeneratorService } from '../../questions/question-generator.service';
import { PrismaService } from '../../common/prisma.service';
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
    private prisma: PrismaService,
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
   *
   * Also ensures every live match has questions — if a match is first seen
   * mid-game (server restart, new match kicks off), generates questions
   * for the current phase immediately.
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

    // No change — but still check if questions need generating
    if (prevPeriod === period) {
      await this.ensureQuestionsExist(fixtureId, period, elapsed, teams, score);
      return;
    }

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

    // ── New match or first-seen match: generate for current phase ──
    if (['1H', '2H'].includes(period) && !prevPeriod) {
      this.logger.log(`First seen fixture ${fixtureId} in ${period} ${elapsed}' — generating questions`);
      await this.questionGenerator.generateForPhase(fixtureId, elapsed, teams, score, period);
    }
  }

  /**
   * If a live match has NO open or pending questions, generate for
   * the current phase. This handles mid-phase gaps — e.g. all questions
   * expired but the phase hasn't changed yet.
   */
  private async ensureQuestionsExist(
    fixtureId: number,
    period: string,
    elapsed: number,
    teams: { home: string; away: string },
    score: { home: number; away: number },
  ) {
    // Only for in-play periods (including HT for half-time questions)
    if (!['1H', '2H', 'HT'].includes(period)) return;

    // Check Redis cooldown — don't check DB every 15s
    const cooldownKey = `fixture:${fixtureId}:question-check`;
    const lastCheck = await this.redis.get(cooldownKey);
    if (lastCheck) return; // Checked recently
    await this.redis.set(cooldownKey, '1', 60); // Check at most once per minute

    const activeCount = await this.prisma.question.count({
      where: { fixtureId, status: { in: ['OPEN', 'PENDING'] } },
    });

    if (activeCount === 0) {
      this.logger.log(
        `Fixture ${fixtureId}: no active questions at ${period} ${elapsed}' — generating`,
      );
      await this.questionGenerator.generateForPhase(fixtureId, elapsed, teams, score, period);
    }
  }
}
