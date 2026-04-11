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

  private lastRequestTime = 0;

  async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(endpoint, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    // Minimum 2s between requests — API-Football has per-minute rate limits
    // (e.g., 30/min = 1 every 2s). This prevents "Too many requests" errors.
    const minGapMs = 2000;
    const timeSinceLast = Date.now() - this.lastRequestTime;
    if (timeSinceLast < minGapMs) {
      await new Promise((r) => setTimeout(r, minGapMs - timeSinceLast));
    }
    this.lastRequestTime = Date.now();

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      const apiKey = this.getCurrentKey();
      try {
        const response = await fetch(url.toString(), {
          headers: { 'x-apisports-key': apiKey },
        });

        if (response.status === 429) {
          retries++;
          const waitTime = Math.pow(2, retries) * 1000;
          this.logger.warn(`Rate limited, retrying in ${waitTime}ms (attempt ${retries}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
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
            this.logger.warn(`Key #${this.currentKeyIndex + 1} hit request limit — rotating`);
            const rotated = this.rotateToNextKey();
            if (rotated) {
              retries++;
              continue; // Retry with new key
            }
          }
        }

        return data.response;
      } catch (error) {
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
