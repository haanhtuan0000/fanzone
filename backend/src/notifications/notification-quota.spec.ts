import {
  tryIncrementDailyQuota,
  tryIncrementQuestionQuota,
} from './notification-quota';

describe('tryIncrementQuestionQuota', () => {
  // Fake Redis that records calls so we can verify the INCR+EXPIRE pattern
  // without running a real server.
  function fakeRedis() {
    const store = new Map<string, number>();
    const expires = new Map<string, number>();
    const client = {
      incr: jest.fn(async (key: string) => {
        const next = (store.get(key) ?? 0) + 1;
        store.set(key, next);
        return next;
      }),
    };
    const service: any = {
      getClient: () => client,
      expire: jest.fn(async (key: string, ttl: number) => {
        expires.set(key, ttl);
      }),
    };
    return { service, store, expires, client };
  }

  it('allows the first 3 calls and blocks the 4th per (user, fixture)', async () => {
    const { service } = fakeRedis();
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await tryIncrementQuestionQuota(service, 'u1', 42));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].current).toBe(4);
  });

  it('sets EXPIRE(12h) exactly once on the first INCR', async () => {
    const { service, expires } = fakeRedis();
    await tryIncrementQuestionQuota(service, 'u1', 42);
    await tryIncrementQuestionQuota(service, 'u1', 42);
    await tryIncrementQuestionQuota(service, 'u1', 42);
    expect(service.expire).toHaveBeenCalledTimes(1);
    expect(expires.get('fcm:q:u:u1:f:42')).toBe(12 * 60 * 60);
  });

  it('keys are disjoint per (user, fixture) — same user different fixtures', async () => {
    const { service } = fakeRedis();
    for (let i = 0; i < 3; i++) await tryIncrementQuestionQuota(service, 'u1', 10);
    // 4th call on fixture 10 would be blocked, but fixture 11 is untouched.
    const onFixture11 = await tryIncrementQuestionQuota(service, 'u1', 11);
    expect(onFixture11.allowed).toBe(true);
    expect(onFixture11.current).toBe(1);
  });

  it('respects custom limit argument', async () => {
    const { service } = fakeRedis();
    const r1 = await tryIncrementQuestionQuota(service, 'u1', 1, /*limit=*/ 1);
    const r2 = await tryIncrementQuestionQuota(service, 'u1', 1, /*limit=*/ 1);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(false);
  });
});

describe('tryIncrementDailyQuota (Stage 4 global cap)', () => {
  function fakeRedis() {
    const store = new Map<string, number>();
    const expires = new Map<string, number>();
    const client = {
      incr: jest.fn(async (key: string) => {
        const next = (store.get(key) ?? 0) + 1;
        store.set(key, next);
        return next;
      }),
    };
    const service: any = {
      getClient: () => client,
      expire: jest.fn(async (key: string, ttl: number) => {
        expires.set(key, ttl);
      }),
    };
    return { service, store, expires };
  }

  const APR_18 = new Date('2026-04-18T10:00:00Z');
  const APR_19 = new Date('2026-04-19T10:00:00Z');

  it('allows 1–10 and blocks 11+ on the same day', async () => {
    const { service } = fakeRedis();
    const results = [];
    for (let i = 0; i < 11; i++) {
      results.push(await tryIncrementDailyQuota(service, 'u1', 10, APR_18));
    }
    expect(results.slice(0, 10).every((r) => r.allowed)).toBe(true);
    expect(results[10].allowed).toBe(false);
    expect(results[10].current).toBe(11);
  });

  it('EXPIRE 26h set exactly once on the first INCR of the day', async () => {
    const { service, expires } = fakeRedis();
    await tryIncrementDailyQuota(service, 'u1', 10, APR_18);
    await tryIncrementDailyQuota(service, 'u1', 10, APR_18);
    expect(service.expire).toHaveBeenCalledTimes(1);
    expect(expires.get('fcm:d:u1:2026-04-18')).toBe(26 * 60 * 60);
  });

  it('the next day uses a fresh key (user gets a new 10-cap)', async () => {
    const { service } = fakeRedis();
    for (let i = 0; i < 10; i++) {
      await tryIncrementDailyQuota(service, 'u1', 10, APR_18);
    }
    const tomorrow = await tryIncrementDailyQuota(service, 'u1', 10, APR_19);
    expect(tomorrow.allowed).toBe(true);
    expect(tomorrow.current).toBe(1);
  });
});
