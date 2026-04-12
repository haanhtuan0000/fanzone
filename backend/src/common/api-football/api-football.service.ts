import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ApiFootballResponse<T> {
  get: string;
  parameters: Record<string, string>;
  errors: Record<string, string>;
  results: number;
  paging: { current: number; total: number };
  response: T;
}

@Injectable()
export class ApiFootballService {
  private readonly logger = new Logger(ApiFootballService.name);
  private readonly baseUrl: string;
  private readonly apiKeys: string[];
  private currentKeyIndex = 0;
  private exhaustedKeys: Set<number> = new Set();
  private lastResetCheck = 0;
  private rateLimitedUntil = 0; // epoch ms — pause all requests until this time
  private callsThisMinute = 0;
  private minuteStart = Date.now();

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get<string>('API_FOOTBALL_BASE_URL') || 'https://v3.football.api-sports.io';

    // Support comma-separated keys: API_FOOTBALL_KEY="key1,key2,key3"
    const keyString = this.config.get<string>('API_FOOTBALL_KEY') || '';
    this.apiKeys = keyString.split(',').map((k) => k.trim()).filter(Boolean);

    if (this.apiKeys.length === 0) {
      this.logger.warn('No API-Football keys configured');
    } else {
      this.logger.log(`Loaded ${this.apiKeys.length} API-Football key(s)`);
    }
  }

  private getCurrentKey(): string {
    if (this.apiKeys.length === 0) return '';

    // Reset exhausted keys every hour (API-Football resets daily, but check hourly)
    const now = Date.now();
    if (now - this.lastResetCheck > 3600_000) {
      this.exhaustedKeys.clear();
      this.lastResetCheck = now;
    }

    // Find next available key
    for (let i = 0; i < this.apiKeys.length; i++) {
      const idx = (this.currentKeyIndex + i) % this.apiKeys.length;
      if (!this.exhaustedKeys.has(idx)) {
        this.currentKeyIndex = idx;
        return this.apiKeys[idx];
      }
    }

    // All keys exhausted — use the first one anyway (will get rate limited)
    this.logger.warn('All API keys exhausted, falling back to first key');
    return this.apiKeys[0];
  }

  private rotateToNextKey(): boolean {
    // Mark current key as exhausted
    this.exhaustedKeys.add(this.currentKeyIndex);
    this.logger.warn(`Key #${this.currentKeyIndex + 1} exhausted (${this.exhaustedKeys.size}/${this.apiKeys.length} exhausted)`);

    // Try to find a non-exhausted key
    for (let i = 0; i < this.apiKeys.length; i++) {
      const idx = (this.currentKeyIndex + 1 + i) % this.apiKeys.length;
      if (!this.exhaustedKeys.has(idx)) {
        this.currentKeyIndex = idx;
        this.logger.log(`Rotated to key #${idx + 1}`);
        return true;
      }
    }

    this.logger.error('All API keys exhausted — no more keys available');
    return false;
  }

  /** Check if currently in rate limit cooldown */
  isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  /** Serial queue: ensures only one API request runs at a time with 500ms gap */
  private requestQueue: Promise<void> = Promise.resolve();

  async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    // Chain onto the queue — each request waits for the previous to finish
    // The queue chain NEVER rejects (errors are caught per-request) so it keeps flowing
    return new Promise<T>((resolve, reject) => {
      this.requestQueue = this.requestQueue.then(async () => {
        try {
          const result = await this.doRequest<T>(endpoint, params);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  private async doRequest<T>(endpoint: string, params: Record<string, string>): Promise<T> {
    const url = new URL(endpoint, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    // Gap between requests — 500ms = max 2/sec (Pro plan burst limit: 5/sec)
    await new Promise((r) => setTimeout(r, 500));

    // Check rate limit cooldown AFTER the gap
    if (Date.now() < this.rateLimitedUntil) {
      const waitSec = Math.round((this.rateLimitedUntil - Date.now()) / 1000);
      throw new Error(`Rate limited — ${waitSec}s cooldown remaining`);
    }

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      const apiKey = this.getCurrentKey();
      try {
        // Track calls per minute for debugging
        const now = Date.now();
        if (now - this.minuteStart > 60_000) {
          if (this.callsThisMinute > 0) {
            this.logger.log(`API calls last minute: ${this.callsThisMinute}`);
          }
          this.callsThisMinute = 0;
          this.minuteStart = now;
        }
        this.callsThisMinute++;

        const response = await fetch(url.toString(), {
          headers: { 'x-apisports-key': apiKey },
        });

        if (response.status === 429) {
          // Set cooldown so queued requests don't also hit 429
          this.rateLimitedUntil = Date.now() + 20_000;
          this.logger.warn('HTTP 429 — pausing all requests for 20s');
          throw new Error('Rate limited (429)');
        }

        if (!response.ok) {
          throw new Error(`API-Football error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as ApiFootballResponse<T>;

        // Check for errors in response body
        if (Object.keys(data.errors).length > 0) {
          const errorMsg = JSON.stringify(data.errors);
          this.logger.warn(`API-Football response errors for ${endpoint}: ${errorMsg}`);

          if (errorMsg.includes('request limit') || errorMsg.includes('requests')) {
            if (errorMsg.includes('per minute')) {
              // Per-minute rate limit — don't exhaust key, just cooldown 60s
              this.rateLimitedUntil = Date.now() + 20_000;
              this.logger.warn(`Per-minute rate limit hit — pausing all requests for 20s`);
              throw new Error(`API-Football per-minute rate limit — cooling down`);
            }
            // Daily limit — rotate key
            this.logger.warn(`Key #${this.currentKeyIndex + 1} hit daily limit — rotating`);
            const rotated = this.rotateToNextKey();
            if (rotated) {
              retries++;
              continue; // Retry with new key
            }
            throw new Error(`API-Football rate limit: ${errorMsg}`);
          }
        }

        return data.response;
      } catch (error) {
        // Don't retry rate limit errors — they already set cooldown
        const msg = (error as Error).message ?? '';
        if (msg.includes('Rate limited') || msg.includes('rate limit') || msg.includes('cooldown')) {
          throw error;
        }
        if (retries >= maxRetries - 1) throw error;
        retries++;
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 1000));
      }
    }

    throw new Error('Max retries exceeded for API-Football request');
  }

  async getLiveFixtures(): Promise<unknown[]> {
    return this.request<unknown[]>('/fixtures', { live: 'all' });
  }

  async getFixturesByDate(date: string): Promise<unknown[]> {
    return this.request<unknown[]>('/fixtures', { date });
  }

  async getFixtureEvents(fixtureId: number): Promise<unknown[]> {
    return this.request<unknown[]>('/fixtures/events', { fixture: fixtureId.toString() });
  }

  async getFixtureStatistics(fixtureId: number): Promise<unknown[]> {
    return this.request<unknown[]>('/fixtures/statistics', { fixture: fixtureId.toString() });
  }

  async getFixtureLineups(fixtureId: number): Promise<unknown[]> {
    return this.request<unknown[]>('/fixtures/lineups', { fixture: fixtureId.toString() });
  }

  async getStandings(league: number, season: number): Promise<unknown[]> {
    return this.request<unknown[]>('/standings', { league: league.toString(), season: season.toString() });
  }
}
