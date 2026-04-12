import { Controller, Get, Post, Param, Body, UseGuards, Request } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { RedisService } from '../common/redis/redis.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('matches')
export class MatchesController {
  constructor(
    private matchesService: MatchesService,
    private redis: RedisService,
  ) {}

  @Get('live')
  async getLiveMatches() {
    return this.matchesService.getLiveMatches();
  }

  @Get('today')
  async getTodayMatches() {
    return this.matchesService.getTodayMatches();
  }

  @Get(':fixtureId')
  async getMatch(@Param('fixtureId') fixtureId: string) {
    return this.matchesService.getMatch(parseInt(fixtureId));
  }

  @UseGuards(JwtAuthGuard)
  @Get(':fixtureId/fan-vote')
  async getFanVote(@Param('fixtureId') fixtureId: string, @Request() req: any) {
    return this.matchesService.getFanVote(parseInt(fixtureId), req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':fixtureId/fan-vote')
  async submitFanVote(
    @Param('fixtureId') fixtureId: string,
    @Body() body: { vote: string },
    @Request() req: any,
  ) {
    return this.matchesService.submitFanVote(parseInt(fixtureId), req.user.id, body.vote);
  }

  /**
   * Seed mock live fixtures for testing.
   * POST /matches/mock with array of fixture objects.
   */
  @Post('mock')
  async seedMockFixtures(@Body() fixtures: any[]) {
    await this.redis.setJson('cache:fixtures:live', fixtures, 86400);
    return { seeded: fixtures.length };
  }
}
