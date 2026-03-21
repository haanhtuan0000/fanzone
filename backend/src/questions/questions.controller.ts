import { Controller, Get, Param, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuestionsService } from './questions.service';
import { ScoringService } from '../predictions/scoring.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Controller('questions')
export class QuestionsController {
  constructor(
    private questionsService: QuestionsService,
    private scoringService: ScoringService,
    private ws: WebsocketGateway,
  ) {}

  @Get('active/:fixtureId')
  @UseGuards(JwtAuthGuard)
  async getActiveQuestions(@Param('fixtureId') fixtureId: string) {
    return this.questionsService.getActiveQuestions(parseInt(fixtureId));
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createQuestion(@Body() body: any) {
    return this.questionsService.createQuestion(body);
  }

  /**
   * Resolve a question with the correct answer.
   * Scores all predictions, updates coins/XP, and broadcasts results.
   * For testing: curl -X POST localhost:3000/questions/:id/resolve -d '{"correctOptionId":"..."}'
   */
  @Post(':id/open')
  async openQuestion(@Param('id') questionId: string) {
    return this.questionsService.openQuestion(questionId);
  }

  @Post(':id/resolve')
  async resolveQuestion(
    @Param('id') questionId: string,
    @Body() body: { correctOptionId: string },
  ) {
    // 1. Mark question as resolved
    await this.questionsService.resolveQuestion(questionId, body.correctOptionId);

    // 2. Score all predictions (update coins, XP, leaderboards)
    const results = await this.scoringService.scoreQuestion(questionId, body.correctOptionId);

    // 3. Get the question to know the fixtureId
    const question = await this.questionsService.getQuestion(questionId);

    // 4. Auto-open the next pending question for this fixture
    let nextQuestion = null;
    if (question) {
      nextQuestion = await this.questionsService.openNextPending(question.fixtureId);

      // 5. Broadcast result to all users watching the match
      this.ws.emitToMatch(question.fixtureId, 'prediction_result', {
        questionId,
        correctOptionId: body.correctOptionId,
        results: results.map((r) => ({
          userId: r.userId,
          isCorrect: r.isCorrect,
          coinsResult: r.coinsResult,
          xpEarned: r.xpEarned,
        })),
      });
    }

    return { resolved: true, scoredCount: results.length, results, nextQuestion };
  }
}
