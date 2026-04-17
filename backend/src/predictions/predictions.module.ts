import { Module } from '@nestjs/common';
import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';
import { ScoringService } from './scoring.service';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [PredictionsController],
  providers: [PredictionsService, ScoringService],
  exports: [PredictionsService, ScoringService],
})
export class PredictionsModule {}
