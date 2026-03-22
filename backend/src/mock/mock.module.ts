import { Module } from '@nestjs/common';
import { MockController } from './mock.controller';
import { QuestionsModule } from '../questions/questions.module';
import { PredictionsModule } from '../predictions/predictions.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [QuestionsModule, PredictionsModule, WebsocketModule],
  controllers: [MockController],
})
export class MockModule {}
