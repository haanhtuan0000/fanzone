import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { QuestionsModule } from '../questions/questions.module';
import { FixturePoller } from './poller/fixture.poller';
import { EventPoller } from './poller/event.poller';
import { StatsPoller } from './poller/stats.poller';
import { SchedulePoller } from './poller/schedule.poller';
import { StandingsPoller } from './poller/standings.poller';

@Module({
  imports: [WebsocketModule, QuestionsModule],
  controllers: [MatchesController],
  providers: [
    MatchesService,
    FixturePoller,
    EventPoller,
    StatsPoller,
    SchedulePoller,
    StandingsPoller,
  ],
  exports: [MatchesService],
})
export class MatchesModule {}
