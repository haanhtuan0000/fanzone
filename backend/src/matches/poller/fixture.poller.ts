import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from '../../common/api-football/api-football.service';
import { RedisService } from '../../common/redis/redis.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { TRACKED_LEAGUE_IDS } from '../leagues.config';

@Injectable()
export class FixturePoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FixturePoller.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly mockMode: boolean;

  constructor(
    private apiFootball: ApiFootballService,
    private redis: RedisService,
    private ws: WebsocketGateway,
    private config: ConfigService,
  ) {
    this.mockMode = this.config.get('MOCK_MODE') === 'true';
  }

  onModuleInit() {
    if (this.mockMode) {
      this.logger.log('Fixture poller DISABLED (MOCK_MODE=true)');
      return;
    }
    this.logger.log('Starting fixture poller (every 15s)');
    this.poll();
    this.intervalId = setInterval(() => this.poll(), 15_000);
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async poll() {
    try {
      const allFixtures = await this.apiFootball.getLiveFixtures();
      const fixtures = (allFixtures as any[]).filter(
        (f) => TRACKED_LEAGUE_IDS.has(f?.league?.id),
      );
      await this.redis.setJson('cache:fixtures:live', fixtures, 20);

      for (const fixture of fixtures) {
        const id = fixture?.fixture?.id;
        if (!id) continue;

        const homeScore = fixture?.goals?.home ?? 0;
        const awayScore = fixture?.goals?.away ?? 0;
        const elapsed = fixture?.fixture?.status?.elapsed;
        const period = fixture?.fixture?.status?.short;

        await this.redis.setJson(`cache:fixture:${id}:score`, {
          homeScore, awayScore, elapsed, period,
        }, 20);

        this.ws.emitToMatch(id, 'score_update', {
          fixtureId: id, homeScore, awayScore, clock: elapsed, period,
        });
      }

      if (fixtures.length > 0) {
        this.logger.debug(`Polled ${fixtures.length} live fixtures`);
      }
    } catch (error) {
      this.logger.error(`Fixture poll failed: ${error}`);
    }
  }
}
