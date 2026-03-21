import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from '../../common/api-football/api-football.service';
import { RedisService } from '../../common/redis/redis.service';
import { TRACKED_LEAGUES } from '../leagues.config';

@Injectable()
export class StandingsPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StandingsPoller.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly mockMode: boolean;

  private readonly leagues = TRACKED_LEAGUES;

  constructor(
    private apiFootball: ApiFootballService,
    private redis: RedisService,
    private config: ConfigService,
  ) {
    this.mockMode = this.config.get('MOCK_MODE') === 'true';
  }

  onModuleInit() {
    if (this.mockMode) {
      this.logger.log('Standings poller DISABLED (MOCK_MODE=true)');
      return;
    }
    this.logger.log('Starting standings poller (every 5 minutes)');
    this.poll();
    this.intervalId = setInterval(() => this.poll(), 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async poll() {
    try {
      for (const league of this.leagues) {
        const standings = await this.apiFootball.getStandings(league.id, league.season);
        await this.redis.setJson(`cache:standings:${league.id}`, standings, 300); // 5min TTL
      }
      this.logger.debug(`Updated standings for ${this.leagues.length} leagues`);
    } catch (error) {
      this.logger.error(`Standings poll failed: ${error}`);
    }
  }
}
