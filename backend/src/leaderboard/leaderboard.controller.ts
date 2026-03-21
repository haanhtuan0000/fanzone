import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  @Get()
  async getLeaderboard(
    @Query('scope') scope: string = 'global',
    @Query('id') id?: string,
  ) {
    return this.leaderboardService.getLeaderboard(scope, id);
  }

  @Get('me')
  async getMyRank(
    @Request() req: any,
    @Query('scope') scope: string = 'global',
    @Query('id') id?: string,
  ) {
    return this.leaderboardService.getUserRank(req.user.id, scope, id);
  }
}
