import { Controller, Get, Param } from '@nestjs/common';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private matchesService: MatchesService) {}

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
}
