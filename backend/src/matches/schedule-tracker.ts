import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballService } from '../common/api-football/api-football.service';
import { TRACKED_LEAGUE_IDS } from './leagues.config';

/**
 * Tracks today's fixture schedule to determine sleep/wake timing.
 * Fetches schedule every 30 min and caches in Redis.
 */
@Injectable()
export class ScheduleTracker {
  private readonly logger = new Logger(ScheduleTracker.name);
  private lastRefresh = 0;
  private readonly REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 min

  constructor(
    private redis: RedisService,
    private apiFootball: ApiFootballService,
  ) {}

  async refreshIfNeeded(): Promise<void> {
    if (Date.now() - this.lastRefresh < this.REFRESH_INTERVAL_MS) return;
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const allFixtures = await this.apiFootball.getFixturesByDate(today);
      const fixtures = (allFixtures as any[]).filter(
        (f) => TRACKED_LEAGUE_IDS.has(f?.league?.id),
      );
      await this.redis.setJson('cache:fixtures:today', fixtures, 43200);
      this.lastRefresh = Date.now();
      this.logger.log(`Schedule refreshed: ${fixtures.length} fixtures for ${today}`);
    } catch (e) {
      this.logger.error(`Schedule refresh failed: ${e}`);
    }
  }

  /**
   * Returns minutes until the next kickoff from today's cached fixtures.
   * Returns Infinity if no upcoming or live matches.
   *
   * Returns 0 when:
   * - A match is currently live (1H, 2H, HT, ET) — so the server stays
   *   awake and pollFixtures() can discover/track it.
   * - A match's kickoff time has passed but it's still marked NS —
   *   API-Football may be delayed in marking it as live.
   */
  async minutesUntilNextKickoff(): Promise<number> {
    const fixtures = await this.redis.getJson<any[]>('cache:fixtures:today');
    if (!fixtures || fixtures.length === 0) return Infinity;

    const now = Date.now();
    let nearest = Infinity;

    for (const f of fixtures) {
      const status = f?.fixture?.status?.short;

      // Live matches → poll immediately so pollFixtures() can discover them.
      // Without this, a server restart during a live match would go straight
      // to sleep (matchStates is empty, no upcoming NS matches).
      if (['1H', '2H', 'HT', 'ET', 'BT', 'P'].includes(status)) {
        return 0;
      }

      // Skip finished matches — nothing to poll for
      if (['FT', 'AET', 'PEN'].includes(status)) continue;

      const dateStr = f?.fixture?.date;
      if (!dateStr) continue;
      const kickoff = new Date(dateStr).getTime();
      const diff = (kickoff - now) / 60_000;

      // Match should already have started but API hasn't updated status yet
      // (within 30 min grace period) — treat as imminent so we poll frequently
      if (diff <= 0 && diff > -30) {
        return 0;
      }
      if (diff > 0 && diff < nearest) {
        nearest = diff;
      }
    }

    return nearest;
  }
}
