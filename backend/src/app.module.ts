import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MatchesModule } from './matches/matches.module';
import { QuestionsModule } from './questions/questions.module';
import { PredictionsModule } from './predictions/predictions.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { FeedModule } from './feed/feed.module';
import { WebsocketModule } from './websocket/websocket.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    AuthModule,
    UsersModule,
    MatchesModule,
    QuestionsModule,
    PredictionsModule,
    LeaderboardModule,
    FeedModule,
    WebsocketModule,
  ],
})
export class AppModule {}
