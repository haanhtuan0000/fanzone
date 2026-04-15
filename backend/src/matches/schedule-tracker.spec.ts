import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleTracker } from './schedule-tracker';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballService } from '../common/api-football/api-football.service';
import { createMockRedis } from '../test/mock-factories';

describe('ScheduleTracker', () => {
  let tracker: ScheduleTracker;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    redis = createMockRedis();
    const mockApi = { getFixturesByDate: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleTracker,
        { provide: RedisService, useValue: redis },
        { provide: ApiFootballService, useValue: mockApi },
      ],
    }).compile();

    tracker = module.get<ScheduleTracker>(ScheduleTracker);
  });

  /** Helper: build a fixture with given kickoff time and status */
  function fixture(kickoffMs: number, status = 'NS') {
    return {
      fixture: { status: { short: status }, date: new Date(kickoffMs).toISOString() },
      league: { id: 39 },
    };
  }

  describe('minutesUntilNextKickoff', () => {
    it('returns Infinity when no fixtures', async () => {
      redis.getJson.mockResolvedValue([]);
      expect(await tracker.minutesUntilNextKickoff()).toBe(Infinity);
    });

    it('returns Infinity when cache is null', async () => {
      redis.getJson.mockResolvedValue(null);
      expect(await tracker.minutesUntilNextKickoff()).toBe(Infinity);
    });

    it('returns minutes until nearest future kickoff', async () => {
      const now = Date.now();
      redis.getJson.mockResolvedValue([
        fixture(now + 10 * 60_000), // 10 min away
        fixture(now + 30 * 60_000), // 30 min away
      ]);
      const result = await tracker.minutesUntilNextKickoff();
      expect(result).toBeGreaterThan(9);
      expect(result).toBeLessThan(11);
    });

    it('skips already-finished matches', async () => {
      const now = Date.now();
      redis.getJson.mockResolvedValue([
        fixture(now - 60 * 60_000, 'FT'), // 1h ago, finished
        fixture(now + 20 * 60_000, 'NS'), // 20 min away
      ]);
      const result = await tracker.minutesUntilNextKickoff();
      expect(result).toBeGreaterThan(19);
      expect(result).toBeLessThan(21);
    });

    it('returns 0 when a match is currently live (1H)', async () => {
      const now = Date.now();
      redis.getJson.mockResolvedValue([
        fixture(now - 30 * 60_000, '1H'), // playing
        fixture(now + 15 * 60_000, 'NS'), // 15 min away
      ]);
      // Live match should return 0 so pollFixtures() runs and discovers it
      expect(await tracker.minutesUntilNextKickoff()).toBe(0);
    });

    it('returns 0 when a match is at half-time (HT)', async () => {
      redis.getJson.mockResolvedValue([
        fixture(Date.now() - 50 * 60_000, 'HT'),
      ]);
      expect(await tracker.minutesUntilNextKickoff()).toBe(0);
    });

    it('returns 0 when a match is in second half (2H)', async () => {
      redis.getJson.mockResolvedValue([
        fixture(Date.now() - 60 * 60_000, '2H'),
      ]);
      expect(await tracker.minutesUntilNextKickoff()).toBe(0);
    });

    it('returns 0 when a match is in extra time (ET)', async () => {
      redis.getJson.mockResolvedValue([
        fixture(Date.now() - 100 * 60_000, 'ET'),
      ]);
      expect(await tracker.minutesUntilNextKickoff()).toBe(0);
    });

    // NEW BEHAVIOR: API-Football data lag
    it('returns 0 when match kickoff has passed but status still NS (API delay)', async () => {
      const now = Date.now();
      redis.getJson.mockResolvedValue([
        fixture(now - 12 * 60_000, 'NS'), // kicked off 12 min ago, but API says NS
      ]);
      // Should treat as imminent so pollFixtures runs frequently to catch it
      expect(await tracker.minutesUntilNextKickoff()).toBe(0);
    });

    it('returns 0 even if nearest future kickoff is further away', async () => {
      const now = Date.now();
      redis.getJson.mockResolvedValue([
        fixture(now - 5 * 60_000, 'NS'),    // 5 min late, API delayed
        fixture(now + 60 * 60_000, 'NS'),   // 60 min away
      ]);
      // The late match should make us poll now, ignoring the future one
      expect(await tracker.minutesUntilNextKickoff()).toBe(0);
    });

    it('returns Infinity when all matches are finished', async () => {
      const now = Date.now();
      redis.getJson.mockResolvedValue([
        fixture(now - 120 * 60_000, 'FT'),
        fixture(now - 90 * 60_000, 'FT'),
        fixture(now - 60 * 60_000, 'AET'),
      ]);
      expect(await tracker.minutesUntilNextKickoff()).toBe(Infinity);
    });

    it('cold-start during live match: returns 0 even when all other matches are FT', async () => {
      const now = Date.now();
      redis.getJson.mockResolvedValue([
        fixture(now - 120 * 60_000, 'FT'),   // finished
        fixture(now - 90 * 60_000, 'FT'),    // finished
        fixture(now - 60 * 60_000, '2H'),    // still playing!
      ]);
      // The one live match should cause pollFixtures to run
      expect(await tracker.minutesUntilNextKickoff()).toBe(0);
    });

    it('ignores matches that should have started over 30 min ago (give up)', async () => {
      const now = Date.now();
      redis.getJson.mockResolvedValue([
        fixture(now - 40 * 60_000, 'NS'),   // 40 min late — likely cancelled
        fixture(now + 25 * 60_000, 'NS'),   // 25 min away
      ]);
      const result = await tracker.minutesUntilNextKickoff();
      // Should fall through to the future match
      expect(result).toBeGreaterThan(24);
      expect(result).toBeLessThan(26);
    });
  });
});
