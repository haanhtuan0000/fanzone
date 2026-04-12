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

    // Cold start fallback (skip if rate limited — return empty, tick will populate cache)
    if (this.apiFootball.isRateLimited()) return [];
    const all = await this.apiFootball.getLiveFixtures();
    const data = (all as any[]).filter((f) => TRACKED_LEAGUE_IDS.has(f?.league?.id));
    await this.redis.setJson('cache:fixtures:live', data, 45);
    return data;
  }

  /**
   * Returns today's fixture schedule from Redis (kept warm by SchedulePoller).
   * Falls back to API-Football if cache is empty.
   */
  async getTodayMatches() {
    const cached = await this.redis.getJson<unknown[]>('cache:fixtures:today');
    if (cached) return cached;

    // Cold start fallback (skip if rate limited — return empty, schedule tracker will populate)
    if (this.apiFootball.isRateLimited()) return [];
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

    // Fetch any missing data directly from API (only if not rate limited)
    let finalEvents = events;
    let finalStats = stats;

    if ((!finalEvents || finalEvents.length === 0) && !this.apiFootball.isRateLimited()) {
      try {
        finalEvents = await this.apiFootball.getFixtureEvents(fixtureId) as any[];
        await this.redis.setJson(`cache:fixture:${fixtureId}:events`, finalEvents, 120);
      } catch (_) { finalEvents = []; }
    }

    if ((!finalStats || finalStats.length === 0) && !this.apiFootball.isRateLimited()) {
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

  // ─── Fan vote ───

  async getFanVote(fixtureId: number, userId: string) {
    const countsKey = `fanvote:${fixtureId}:counts`;
    const userKey = `fanvote:${fixtureId}:user:${userId}`;

    const [counts, myVote] = await Promise.all([
      this.redis.hgetall(countsKey),
      this.redis.get(userKey),
    ]);

    // Clamp negatives to 0 (cleanup from earlier bug)
    const home = Math.max(0, parseInt(counts.home || '0'));
    const draw = Math.max(0, parseInt(counts.draw || '0'));
    const away = Math.max(0, parseInt(counts.away || '0'));
    const total = home + draw + away;

    return { home, draw, away, total, myVote };
  }

  async submitFanVote(fixtureId: number, userId: string, vote: string) {
    if (!['home', 'draw', 'away'].includes(vote)) {
      throw new Error('Invalid vote. Must be home, draw, or away.');
    }

    const countsKey = `fanvote:${fixtureId}:counts`;
    const userKey = `fanvote:${fixtureId}:user:${userId}`;
    const TTL = 86400; // 24 hours

    // Check if user already voted
    const oldVote = await this.redis.get(userKey);
    if (oldVote && oldVote === vote) {
      return this.getFanVote(fixtureId, userId); // Same vote — no change
    }
    // Remove old vote (check count > 0 to prevent negatives)
    if (oldVote && ['home', 'draw', 'away'].includes(oldVote)) {
      const counts = await this.redis.hgetall(countsKey);
      if (parseInt(counts[oldVote] || '0') > 0) {
        await this.redis.hincrby(countsKey, oldVote, -1);
      }
    }

    // Add new vote
    await this.redis.hincrby(countsKey, vote, 1);
    await this.redis.set(userKey, vote, TTL);
    await this.redis.expire(countsKey, TTL);

    return this.getFanVote(fixtureId, userId);
  }
}
