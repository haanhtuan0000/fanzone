import { Controller, Get, Param, Query } from '@nestjs/common';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(private feedService: FeedService) {}

  @Get(':fixtureId')
  async getFeed(
    @Param('fixtureId') fixtureId: string,
    @Query('limit') limit: string = '50',
  ) {
    return this.feedService.getFeed(parseInt(fixtureId), parseInt(limit));
  }
}
