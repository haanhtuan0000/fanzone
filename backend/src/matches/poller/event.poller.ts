import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiFootballService } from '../../common/api-football/api-football.service';
import { RedisService } from '../../common/redis/redis.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { QuestionGeneratorService } from '../../questions/question-generator.service';
import { QuestionResolverService } from '../../questions/question-resolver.service';

@Injectable()
export class EventPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventPoller.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly mockMode: boolean;

  constructor(
    private apiFootball: ApiFootballService,
    private redis: RedisService,
    private ws: WebsocketGateway,
    private questionGenerator: QuestionGeneratorService,
    private questionResolver: QuestionResolverService,
    private config: ConfigService,
  ) {
    this.mockMode = this.config.get('MOCK_MODE') === 'true';
  }

  onModuleInit() {
    if (this.mockMode) {
      this.logger.log('Event poller DISABLED (MOCK_MODE=true) — use manual resolve endpoints');
      return;
    }
    this.logger.log('Starting event poller (every 15s for live fixtures)');
    this.intervalId = setInterval(() => this.poll(), 15_000);
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

        const homeTeam = fixture?.teams?.home?.name;
        const awayTeam = fixture?.teams?.away?.name;
        if (!homeTeam || !awayTeam) continue;

        const teams = { home: homeTeam, away: awayTeam };
        const score = {
          home: fixture?.goals?.home ?? 0,
          away: fixture?.goals?.away ?? 0,
        };

        await this.questionResolver.closeExpiredQuestions(fixtureId);

        const events = await this.apiFootball.getFixtureEvents(fixtureId);
        const prevEvents = await this.redis.getJson<any[]>(`cache:fixture:${fixtureId}:events`);
        await this.redis.setJson(`cache:fixture:${fixtureId}:events`, events, 20);

        const prevCount = prevEvents?.length ?? 0;
        const newEvents = (events as any[]).slice(prevCount);

        for (const event of newEvents) {
          this.ws.emitToMatch(fixtureId, 'match_event', {
            fixtureId,
            type: event.type,
            detail: event.detail,
            player: event.player?.name,
            minute: event.time?.elapsed,
            team: event.team?.name,
          });
          this.logger.log(`New event in fixture ${fixtureId}: ${event.type} - ${event.detail}`);

          const resolved = await this.questionResolver.tryResolveFromEvent(fixtureId, event, teams);

          if (!resolved) {
            const question = await this.questionGenerator.generateFromEvent(fixtureId, event, teams, score);
            if (question) {
              // question is already OPEN (createFromTemplate auto-opens)
              this.logger.log(`Auto-generated question: "${question.text}" for fixture ${fixtureId}`);
              this.ws.emitToMatch(fixtureId, 'new_question', {
                fixtureId,
                questionId: question.id,
                text: question.text,
                category: question.category,
              });
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Event poll failed: ${error}`);
    }
  }
}
