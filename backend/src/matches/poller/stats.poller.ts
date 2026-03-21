import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from '../../common/api-football/api-football.service';
import { RedisService } from '../../common/redis/redis.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';

@Injectable()
export class StatsPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatsPoller.name);
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
      this.logger.log('Stats poller DISABLED (MOCK_MODE=true)');
      return;
    }
    this.logger.log('Starting stats poller (every 60s for live fixtures)');
    this.intervalId = setInterval(() => this.poll(), 60_000);
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async poll() {
    try {
      const liveFixtures = await this.redis.getJson<any[]>('cache:fixtures:live');
      if (!liveFixtures || liveFixtures.length === 0) return;

      for (const fixture of liveFixtures) {
        const fixtureId = fixture?.fixture?.id;
        if (!fixtureId) continue;

        const stats = await this.apiFootball.getFixtureStatistics(fixtureId);
        await this.redis.setJson(`cache:fixture:${fixtureId}:stats`, stats, 65);

        // Extract key stats for broadcast
        const parsed = this.parseStats(stats as any[]);
        this.ws.emitToMatch(fixtureId, 'stats_update', {
          fixtureId,
          ...parsed,
        });
      }
    } catch (error) {
      this.logger.error(`Stats poll failed: ${error}`);
    }
  }

  private parseStats(stats: any[]): Record<string, any> {
    const result: Record<string, any> = {};
    if (!stats || stats.length < 2) return result;

    const findStat = (team: any[], type: string) =>
      team?.find((s: any) => s.type === type)?.value;

    const home = stats[0]?.statistics;
    const away = stats[1]?.statistics;

    result.possession = {
      home: findStat(home, 'Ball Possession') ?? '50%',
      away: findStat(away, 'Ball Possession') ?? '50%',
    };
    result.shots = {
      home: findStat(home, 'Total Shots') ?? 0,
      away: findStat(away, 'Total Shots') ?? 0,
    };
    result.yellowCards = {
      home: findStat(home, 'Yellow Cards') ?? 0,
      away: findStat(away, 'Yellow Cards') ?? 0,
    };
    result.corners = {
      home: findStat(home, 'Corner Kicks') ?? 0,
      away: findStat(away, 'Corner Kicks') ?? 0,
    };

    return result;
  }
}
