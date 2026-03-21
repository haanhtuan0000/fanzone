import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from '../../common/api-football/api-football.service';
import { RedisService } from '../../common/redis/redis.service';
import { TRACKED_LEAGUE_IDS } from '../leagues.config';

@Injectable()
export class SchedulePoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulePoller.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly mockMode: boolean;

  constructor(
    private apiFootball: ApiFootballService,
    private redis: RedisService,
    private config: ConfigService,
  ) {
    this.mockMode = this.config.get('MOCK_MODE') === 'true';
  }

  onModuleInit() {
    if (this.mockMode) {
      this.logger.log('Schedule poller DISABLED (MOCK_MODE=true)');
      return;
    }
    this.logger.log('Starting schedule poller (every 6 hours + on startup)');
    this.poll();
    this.intervalId = setInterval(() => this.poll(), 6 * 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async poll() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const allFixtures = await this.apiFootball.getFixturesByDate(today);
      const fixtures = (allFixtures as any[]).filter(
        (f) => TRACKED_LEAGUE_IDS.has(f?.league?.id),
      );
      await this.redis.setJson('cache:fixtures:today', fixtures, 43200); // 12h TTL
      this.logger.log(`Cached ${(fixtures as any[]).length} fixtures for ${today}`);
    } catch (error) {
      this.logger.error(`Schedule poll failed: ${error}`);
    }
  }
}
