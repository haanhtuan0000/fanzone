import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PredictionsService } from './predictions.service';

@Controller('predictions')
@UseGuards(JwtAuthGuard)
export class PredictionsController {
  constructor(private predictionsService: PredictionsService) {}

  @Post()
  async submitPrediction(
    @Request() req: any,
    @Body() body: { questionId: string; optionId: string },
  ) {
    return this.predictionsService.submitPrediction(req.user.id, body.questionId, body.optionId);
  }

  @Get('history')
  async getHistory(
    @Request() req: any,
    @Query('page') page: string = '1',
  ) {
    return this.predictionsService.getHistory(req.user.id, parseInt(page));
  }

  /**
   * Returns a per-fixture prediction summary for today's finished matches
   * that the user participated in. Used by the Live screen's "Đã trả lời"
   * (Answered) category to show N✓ · N✗ · +Nxu on each card.
   *
   * Returns: [{ fixtureId, correct, wrong, coinsEarned }]
   */
  @Get('today-summary')
  async getTodaySummary(@Request() req: any) {
    return this.predictionsService.getTodaySummary(req.user.id);
  }
}
