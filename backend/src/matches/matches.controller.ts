import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { MatchesService } from './matches.service';
import { RedisService } from '../common/redis/redis.service';

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
