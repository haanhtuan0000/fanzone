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

/**
 * Spec §9.5 global rule: "Tối đa 10 notification/ngày/user". Applied to
 * Group 3 + Group 4 pushes (rank, achievement, level-up, streak) to stop
 * a burst of events during a single hot match from flooding the user's
 * tray. Question events use their own per-match 3-cap above and are NOT
 * double-counted here (separate Redis key).
 *
 * Key = `fcm:d:{userId}:{YYYY-MM-DD}` — the date part is computed from
 * the server's UTC day, which is a reasonable approximation of the
 * user's local day for the common UTC+0 to UTC+9 band. Stage 5 can
 * switch to per-user timezone when user locale settings land.
 *
 * TTL is 26h so the key always outlives its own day even across leap
 * seconds / daylight-saving edge cases.
 */
export async function tryIncrementDailyQuota(
  redis: RedisService,
  userId: string,
  limit = 10,
  now: Date = new Date(),
): Promise<{ allowed: boolean; current: number }> {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `fcm:d:${userId}:${day}`;
  const current = await redis.getClient().incr(key);
  if (current === 1) {
    await redis.expire(key, 26 * 60 * 60);
  }
  return { allowed: current <= limit, current };
}
