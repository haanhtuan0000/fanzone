import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { QuestionsModule } from '../questions/questions.module';
import { MatchDataManager } from './match-data-manager.service';
import { ScheduleTracker } from './schedule-tracker';
import { PollBudgetService } from './poll-budget.service';

@Module({
  imports: [WebsocketModule, QuestionsModule],
  controllers: [MatchesController],
  providers: [
    MatchesService,
    MatchDataManager,
    ScheduleTracker,
    PollBudgetService,
  ],
  exports: [MatchesService],
})
export class MatchesModule {}
