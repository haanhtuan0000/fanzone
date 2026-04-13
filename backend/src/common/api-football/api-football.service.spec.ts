import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from './api-football.service';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Helper: build a successful API-Football response */
/** Mock fetch Headers object — supports .get() and .entries() like real Response.headers */
function mockHeaders(headers: Record<string, string> = {}) {
  return {
    get: (key: string) => headers[key.toLowerCase()] ?? null,
    entries: () => Object.entries(headers)[Symbol.iterator](),
  };
}

function okResponse(data: any = [], extraHeaders: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: mockHeaders({
      'x-ratelimit-requests-limit': '7500',
      'x-ratelimit-requests-remaining': '7000',
      ...extraHeaders,
    }),
    json: async () => ({
      get: 'fixtures',
      parameters: {},
      errors: {},
      results: Array.isArray(data) ? data.length : 1,
      paging: { current: 1, total: 1 },
      response: data,
    }),
  };
}

/** Helper: build a response with error in body (API-Football pattern) */
function errorBodyResponse(errors: Record<string, string>) {
  return {
    ok: true,
    status: 200,
    headers: mockHeaders({ 'server': 'cloudflare', 'cf-ray': 'test-ray' }),
    json: async () => ({
      get: 'fixtures',
      parameters: {},
      errors,
      results: 0,
      paging: { current: 1, total: 1 },
      response: [],
    }),
  };
}

/** Helper: build an HTTP 429 response */
function http429Response() {
  return {
    ok: false,
    status: 429,
    statusText: 'Too Many Requests',
    headers: mockHeaders({ 'server': 'cloudflare', 'retry-after': '5' }),
  };
}

/**
 * Create service with overridden request gap for fast tests.
 * We access the private doRequest via the public request() method.
 */
async function createService(keys = 'test-key-1') {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ApiFootballService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            if (key === 'API_FOOTBALL_KEY') return keys;
            if (key === 'API_FOOTBALL_BASE_URL') return 'https://api.test.com';
            return undefined;
          },
        },
      },
    ],
  }).compile();

  const service = module.get<ApiFootballService>(ApiFootballService);
  // Override the 2s gap to 10ms for fast tests
  const origDoRequest = (service as any).doRequest.bind(service);
  (service as any).doRequest = async function<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    // Replace the 2s setTimeout with 10ms
    const url = new URL(endpoint, (this as any).baseUrl);
    Object.entries(params).forEach(([key, value]: [string, string]) => url.searchParams.set(key, value));
    await new Promise((r) => setTimeout(r, 10));
    if (Date.now() < (this as any).rateLimitedUntil) {
      const waitSec = Math.round(((this as any).rateLimitedUntil - Date.now()) / 1000);
      throw new Error(`Rate limited — ${waitSec}s cooldown remaining`);
    }
    // Call the rest of the original logic via a trimmed version
    return origDoRequest(endpoint, params).then(
      (r: T) => r,
      // If origDoRequest also waited 2s, we double-wait. Instead, inline the retry logic.
    );
  };

  // Simpler approach: just set the gap to 10ms by patching setTimeout usage
  // Actually, let's just test via the internal methods directly
  return service;
}

describe('ApiFootballService', () => {
  let service: ApiFootballService;

  beforeEach(async () => {
    mockFetch.mockReset();
    service = await createTestService();
  });

  async function createTestService(keys = 'test-key-1') {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiFootballService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'API_FOOTBALL_KEY') return keys;
              if (key === 'API_FOOTBALL_BASE_URL') return 'https://api.test.com';
              return undefined;
            },
          },
        },
      ],
    }).compile();

    return module.get<ApiFootballService>(ApiFootballService);
  }

  // ═══ Successful requests ═══

  describe('successful requests', () => {
    it('returns response data on success', async () => {
      mockFetch.mockResolvedValue(okResponse([{ id: 1 }]));
      const result = await service.getLiveFixtures();
      expect(result).toEqual([{ id: 1 }]);
    });

    it('passes API key in header', async () => {
      mockFetch.mockResolvedValue(okResponse([]));
      await service.getLiveFixtures();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'x-apisports-key': 'test-key-1' },
        }),
      );
    });

    it('passes query params in URL', async () => {
      mockFetch.mockResolvedValue(okResponse([]));
      await service.getFixtureEvents(12345);
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('fixture=12345');
    });
  });

  // ═══ Rate limit header logging (debugging visibility) ═══

  describe('rate limit header logging', () => {
    it('reads x-ratelimit headers from successful responses', async () => {
      const loggerSpy = jest.spyOn((service as any).logger, 'debug');
      mockFetch.mockResolvedValue(okResponse([], {
        'x-ratelimit-requests-limit': '7500',
        'x-ratelimit-requests-remaining': '6500',
      }));
      await service.getLiveFixtures();
      // Should log remaining/limit so we can see actual quota usage
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('6500/7500'),
      );
    });

    it('logs full headers on rate limit so source can be identified', async () => {
      const loggerSpy = jest.spyOn((service as any).logger, 'warn');
      mockFetch.mockResolvedValueOnce(errorBodyResponse({
        rateLimit: 'Too many requests. You have exceeded the limit of requests per minute of your subscription.',
      }));
      await expect(service.getLiveFixtures()).rejects.toThrow();
      // Should log "cloudflare" or other server identifier
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('cloudflare'),
      );
    });
  });

  // ═══ HTTP 429 handling ═══

  describe('HTTP 429', () => {
    it('sets cooldown and throws on 429', async () => {
      mockFetch.mockResolvedValueOnce(http429Response());
      await expect(service.getLiveFixtures()).rejects.toThrow('Rate limited (429)');
      expect((service as any).rateLimitedUntil).toBeGreaterThan(Date.now());
    });

    it('does not mark key as exhausted on 429', async () => {
      mockFetch.mockResolvedValueOnce(http429Response());
      await expect(service.getLiveFixtures()).rejects.toThrow();
      expect((service as any).exhaustedKeys.size).toBe(0);
    });

    it('rejects subsequent requests during cooldown', async () => {
      mockFetch.mockResolvedValueOnce(http429Response());
      await expect(service.getLiveFixtures()).rejects.toThrow('Rate limited');

      // Next request should hit cooldown
      await expect(service.getLiveFixtures()).rejects.toThrow('cooldown remaining');
      // fetch only called once — second rejected before fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('recovers after cooldown expires', async () => {
      mockFetch.mockResolvedValueOnce(http429Response());
      await expect(service.getLiveFixtures()).rejects.toThrow();

      // Manually expire cooldown
      (service as any).rateLimitedUntil = Date.now() - 1;

      mockFetch.mockResolvedValueOnce(okResponse([{ id: 2 }]));
      const result = await service.getLiveFixtures();
      expect(result).toEqual([{ id: 2 }]);
    });
  });

  // ═══ Per-minute rate limit (in response body) ═══

  describe('per-minute rate limit', () => {
    const perMinuteError = {
      rateLimit: 'Too many requests. You have exceeded the limit of requests per minute of your subscription.',
    };

    it('sets cooldown and does not exhaust key', async () => {
      mockFetch.mockResolvedValueOnce(errorBodyResponse(perMinuteError));
      await expect(service.getLiveFixtures()).rejects.toThrow('per-minute rate limit');
      expect((service as any).rateLimitedUntil).toBeGreaterThan(Date.now());
      expect((service as any).exhaustedKeys.size).toBe(0);
    });

    it('does not retry', async () => {
      mockFetch.mockResolvedValue(errorBodyResponse(perMinuteError));
      await expect(service.getLiveFixtures()).rejects.toThrow('per-minute rate limit');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ═══ Daily rate limit (in response body) ═══

  describe('daily rate limit', () => {
    const dailyError = {
      requests: 'You have reached the request limit for the day',
    };

    it('marks key as exhausted', async () => {
      mockFetch.mockResolvedValue(errorBodyResponse(dailyError));
      await expect(service.getLiveFixtures()).rejects.toThrow();
      expect((service as any).exhaustedKeys.size).toBe(1);
    });

    it('does not set per-minute cooldown', async () => {
      mockFetch.mockResolvedValue(errorBodyResponse(dailyError));
      await expect(service.getLiveFixtures()).rejects.toThrow();
      expect((service as any).rateLimitedUntil).toBe(0);
    });
  });

  // ═══ Key rotation (multi-key) ═══

  describe('key rotation', () => {
    it('rotates to second key when first hits daily limit', async () => {
      service = await createTestService('key-a,key-b');

      mockFetch
        .mockResolvedValueOnce(errorBodyResponse({
          requests: 'You have reached the request limit for the day',
        }))
        .mockResolvedValueOnce(okResponse([{ id: 3 }]));

      const result = await service.getLiveFixtures();

      expect(result).toEqual([{ id: 3 }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][1].headers['x-apisports-key']).toBe('key-a');
      expect(mockFetch.mock.calls[1][1].headers['x-apisports-key']).toBe('key-b');
    });

    it('fails when all keys exhausted', async () => {
      service = await createTestService('key-a,key-b');

      mockFetch.mockResolvedValue(errorBodyResponse({
        requests: 'You have reached the request limit for the day',
      }));

      await expect(service.getLiveFixtures()).rejects.toThrow('rate limit');
      expect((service as any).exhaustedKeys.size).toBe(2);
    });
  });

  // ═══ Hourly exhaustion reset ═══

  describe('exhaustion reset', () => {
    it('clears exhausted keys after 1 hour', async () => {
      mockFetch.mockResolvedValueOnce(errorBodyResponse({
        requests: 'You have reached the request limit for the day',
      }));

      await expect(service.getLiveFixtures()).rejects.toThrow();
      expect((service as any).exhaustedKeys.size).toBe(1);

      // Simulate 1 hour passing
      (service as any).lastResetCheck = Date.now() - 3600_001;

      mockFetch.mockResolvedValueOnce(okResponse([{ id: 4 }]));
      const result = await service.getLiveFixtures();

      expect(result).toEqual([{ id: 4 }]);
      expect((service as any).exhaustedKeys.size).toBe(0);
    });
  });

  // ═══ Network error retries ═══

  describe('network error retries', () => {
    it('retries on network error and succeeds', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(okResponse([{ id: 5 }]));

      const result = await service.getLiveFixtures();

      expect(result).toEqual([{ id: 5 }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws after max retries exhausted', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(service.getLiveFixtures()).rejects.toThrow('ECONNREFUSED');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 30_000);

    it('does not retry rate limit errors', async () => {
      mockFetch.mockResolvedValueOnce(http429Response());
      await expect(service.getLiveFixtures()).rejects.toThrow('Rate limited');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
