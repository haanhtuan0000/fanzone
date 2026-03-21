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
  private readonly apiKey: string;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get<string>('API_FOOTBALL_BASE_URL') || 'https://v3.football.api-sports.io';
    this.apiKey = this.config.get<string>('API_FOOTBALL_KEY') || '';
  }

  async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(endpoint, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        const response = await fetch(url.toString(), {
          headers: {
            'x-apisports-key': this.apiKey,
          },
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
        if (Object.keys(data.errors).length > 0) {
          this.logger.error(`API-Football errors: ${JSON.stringify(data.errors)}`);
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
