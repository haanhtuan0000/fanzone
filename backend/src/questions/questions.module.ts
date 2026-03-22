import { Module, forwardRef } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { QuestionGeneratorService } from './question-generator.service';
import { QuestionResolverService } from './question-resolver.service';
import { TemplateService } from './templates/template.service';
import { VariableResolverService } from './templates/variable-resolver.service';
import { MatchScenarioEngine } from './scenario/match-scenario.engine';
import { StartupService } from './startup.service';
import { PredictionsModule } from '../predictions/predictions.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { FeedModule } from '../feed/feed.module';

@Module({
  imports: [
    forwardRef(() => PredictionsModule),
    WebsocketModule,
    FeedModule,
  ],
  controllers: [QuestionsController],
  providers: [
    QuestionsService,
    QuestionGeneratorService,
    QuestionResolverService,
    TemplateService,
    VariableResolverService,
    MatchScenarioEngine,
    StartupService,
  ],
  exports: [
    QuestionsService,
    QuestionGeneratorService,
    QuestionResolverService,
    MatchScenarioEngine,
  ],
})
export class QuestionsModule {}
