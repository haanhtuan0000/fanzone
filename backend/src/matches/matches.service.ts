import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballService } from '../common/api-football/api-football.service';
import { TRACKED_LEAGUE_IDS } from './leagues.config';

@Injectable()
export class MatchesService {
  constructor(
    private redis: RedisService,
    private apiFootball: ApiFootballService,
  ) {}

  /**
   * Returns live fixtures from Redis cache (kept warm by FixturePoller every 15s).
   * Falls back to API-Football only if cache is empty (cold start).
   */
  async getLiveMatches() {
    const cached = await this.redis.getJson<unknown[]>('cache:fixtures:live');
    if (cached) return cached;

    // Cold start fallback
    const all = await this.apiFootball.getLiveFixtures();
    const data = (all as any[]).filter((f) => TRACKED_LEAGUE_IDS.has(f?.league?.id));
    await this.redis.setJson('cache:fixtures:live', data, 20);
    return data;
  }

  /**
   * Returns today's fixture schedule from Redis (kept warm by SchedulePoller).
   * Falls back to API-Football if cache is empty.
   */
  async getTodayMatches() {
    const cached = await this.redis.getJson<unknown[]>('cache:fixtures:today');
    if (cached) return cached;

    const today = new Date().toISOString().split('T')[0];
    const all = await this.apiFootball.getFixturesByDate(today);
    const data = (all as any[]).filter((f) => TRACKED_LEAGUE_IDS.has(f?.league?.id));
    await this.redis.setJson('cache:fixtures:today', data, 43200);
    return data;
  }

  /**
   * Returns match detail: score (from FixturePoller), events (from EventPoller),
   * stats (from StatsPoller). Assembles from multiple cache keys.
   */
  async getMatch(fixtureId: number) {
    const [score, events, stats] = await Promise.all([
      this.redis.getJson<any>(`cache:fixture:${fixtureId}:score`),
      this.redis.getJson<any[]>(`cache:fixture:${fixtureId}:events`),
      this.redis.getJson<any[]>(`cache:fixture:${fixtureId}:stats`),
    ]);

    // Fetch any missing data directly from API
    let finalEvents = events;
    let finalStats = stats;

    if (!finalEvents || finalEvents.length === 0) {
      try {
        finalEvents = await this.apiFootball.getFixtureEvents(fixtureId) as any[];
        await this.redis.setJson(`cache:fixture:${fixtureId}:events`, finalEvents, 120);
      } catch (_) { finalEvents = []; }
    }

    if (!finalStats || finalStats.length === 0) {
      try {
        finalStats = await this.apiFootball.getFixtureStatistics(fixtureId) as any[];
        await this.redis.setJson(`cache:fixture:${fixtureId}:stats`, finalStats, 300);
      } catch (_) { finalStats = []; }
    }

    return { fixtureId, score, events: finalEvents, statistics: finalStats };
  }

  /**
   * Returns cached standings for a league (kept warm by StandingsPoller every 5min).
   */
  async getStandings(leagueId: number) {
    return this.redis.getJson<unknown[]>(`cache:standings:${leagueId}`);
  }
}
