import { Module, forwardRef } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { QuestionGeneratorService } from './question-generator.service';
import { QuestionResolverService } from './question-resolver.service';
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
  providers: [QuestionsService, QuestionGeneratorService, QuestionResolverService],
  exports: [QuestionsService, QuestionGeneratorService, QuestionResolverService],
})
export class QuestionsModule {}
