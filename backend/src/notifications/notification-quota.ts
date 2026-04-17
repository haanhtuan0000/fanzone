import { RedisService } from '../common/redis/redis.service';

/**
 * Per-(user, fixture) rate limit for question-event pushes.
 *
 * Spec §9.5: "Nhóm câu hỏi: max 3/trận". A user must not receive more
 * than [limit] question-type notifications for a single match; further
 * pushes should be silently dropped. Implemented atomically with
 * `INCR` + a one-shot `EXPIRE` on the first increment (subsequent
 * increments don't reset the TTL — if a match runs long, the window
 * still expires cleanly 12h after the first push).
 *
 * Returns `current` so callers can log the running total.
 */
export async function tryIncrementQuestionQuota(
  redis: RedisService,
  userId: string,
  fixtureId: number,
  limit = 3,
): Promise<{ allowed: boolean; current: number }> {
  const key = `fcm:q:u:${userId}:f:${fixtureId}`;
  const current = await redis.getClient().incr(key);
  if (current === 1) {
    await redis.expire(key, 12 * 60 * 60);
  }
  return { allowed: current <= limit, current };
}
