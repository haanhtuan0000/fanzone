import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AchievementService } from './achievement.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AchievementService],
  exports: [UsersService, AchievementService],
})
export class UsersModule {}
