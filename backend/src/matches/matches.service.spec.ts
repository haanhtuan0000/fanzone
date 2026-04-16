import { Test, TestingModule } from '@nestjs/testing';
import { MatchesService } from './matches.service';
import { RedisService } from '../common/redis/redis.service';
import { ApiFootballService } from '../common/api-football/api-football.service';
import { createMockRedis } from '../test/mock-factories';

/**
 * Pins the cache-honesty rule from Part B of the silent-fallback cleanup:
 *
 *   A failed API fetch must NOT overwrite `cache:fixture:${id}:events` (or
 *   `:stats`) with `[]`. Downstream readers — specifically the question
 *   resolver — need to tell "cache empty because we know no events happened"
 *   from "cache empty because the last fetch failed." Writing `[]` on failure
 *   collapses the two and caused "did a goal happen?" questions to silently
 *   resolve "No" when reality was "unknown" (the same silent-fallback class
 *   as the Mutondo Stars striker bug).
 */
describe('MatchesService.getMatch — cache integrity on fetch failure', () => {
  let service: MatchesService;
  let redis: ReturnType<typeof createMockRedis>;
  let apiFootball: any;

  beforeEach(async () => {
    redis = createMockRedis();
    apiFootball = {
      isRateLimited: jest.fn().mockReturnValue(false),
      getFixtureEvents: jest.fn(),
      getFixtureStatistics: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: RedisService, useValue: redis },
        { provide: ApiFootballService, useValue: apiFootball },
      ],
    }).compile();
    service = module.get(MatchesService);
  });

  it('does NOT write [] to cache:fixture:$id:events when getFixtureEvents throws', async () => {
    // Cache empty, API throws. The old code did `setJson(..., [])` in the
    // catch, polluting the cache for every downstream reader. The fix keeps
    // Redis untouched so a later successful fetch (or the read-directly
    // resolver path) can tell unknown from empty.
    redis.getJson.mockResolvedValue(null);
    apiFootball.getFixtureEvents.mockRejectedValue(new Error('API timeout'));

    const result = await service.getMatch(12345);

    // HTTP response still has events as [] — UI expects an array.
    expect(result.events).toEqual([]);
    // But we did NOT pollute Redis with the synthetic [].
    expect(redis.setJson).not.toHaveBeenCalledWith(
      'cache:fixture:12345:events',
      expect.anything(),
      expect.any(Number),
    );
  });

  it('does NOT write [] to cache:fixture:$id:stats when getFixtureStatistics throws', async () => {
    redis.getJson.mockResolvedValue(null);
    apiFootball.getFixtureStatistics.mockRejectedValue(new Error('API 500'));
    apiFootball.getFixtureEvents.mockResolvedValue([]); // doesn't matter for this test

    const result = await service.getMatch(12345);

    expect(result.statistics).toEqual([]);
    expect(redis.setJson).not.toHaveBeenCalledWith(
      'cache:fixture:12345:stats',
      expect.anything(),
      expect.any(Number),
    );
  });

  it('DOES write to cache when fetch succeeds — guards the happy path from a too-eager fix', async () => {
    redis.getJson.mockResolvedValue(null);
    const fetched = [{ type: 'goal', time: { elapsed: 30 } }];
    apiFootball.getFixtureEvents.mockResolvedValue(fetched);
    apiFootball.getFixtureStatistics.mockResolvedValue([]);

    await service.getMatch(12345);

    expect(redis.setJson).toHaveBeenCalledWith(
      'cache:fixture:12345:events',
      fetched,
      120,
    );
  });
});
