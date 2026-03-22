import { Controller, Post, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ScoringService } from '../predictions/scoring.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { QuestionsService } from '../questions/questions.service';

const MOCK_FIXTURE_ID = 99001;

const MOCK_FIXTURE = {
  fixture: {
    id: MOCK_FIXTURE_ID,
    date: new Date().toISOString(),
    status: { short: '1H', elapsed: 25 },
  },
  league: { id: 39, name: 'Premier League', logo: '' },
  teams: {
    home: { id: 33, name: 'Manchester United', logo: '' },
    away: { id: 40, name: 'Liverpool', logo: '' },
  },
  goals: { home: 1, away: 0 },
  score: {
    halftime: { home: null, away: null },
    fulltime: { home: null, away: null },
  },
};

const MOCK_QUESTIONS = [
  {
    text: 'Who will score the next goal?',
    category: 'GOAL',
    difficulty: 'MEDIUM',
    rewardCoins: 150,
    answerWindowSec: 600, // 10 minutes for testing
    options: [
      { name: 'Man Utd — Rashford', emoji: '⚽', multiplier: 2.5 },
      { name: 'Man Utd — Fernandes', emoji: '⚽', multiplier: 3.0 },
      { name: 'Liverpool — Salah', emoji: '⚽', multiplier: 2.0 },
      { name: 'Other player', emoji: '⚽', multiplier: 4.0 },
    ],
  },
  {
    text: 'Yellow card in the next 15 minutes?',
    category: 'CARD',
    difficulty: 'EASY',
    rewardCoins: 80,
    answerWindowSec: 600, // 10 minutes for testing
    options: [
      { name: 'Yes — Man Utd player', emoji: '🟨', multiplier: 2.8 },
      { name: 'Yes — Liverpool player', emoji: '🟨', multiplier: 2.5 },
      { name: 'No yellow card', emoji: '✅', multiplier: 1.8 },
    ],
  },
  {
    text: 'Corner kick in the next 5 minutes?',
    category: 'CORNER',
    difficulty: 'EASY',
    rewardCoins: 60,
    answerWindowSec: 600, // 10 minutes for testing
    options: [
      { name: 'Yes — Man Utd', emoji: '🚩', multiplier: 2.2 },
      { name: 'Yes — Liverpool', emoji: '🚩', multiplier: 2.4 },
      { name: 'No corner', emoji: '🚫', multiplier: 2.0 },
    ],
  },
  {
    text: 'Which team has more possession at half-time?',
    category: 'STAT',
    difficulty: 'MEDIUM',
    rewardCoins: 100,
    answerWindowSec: 600, // 10 minutes for testing
    options: [
      { name: 'Man Utd over 55%', emoji: '📊', multiplier: 2.5 },
      { name: 'Liverpool over 55%', emoji: '📊', multiplier: 2.0 },
      { name: 'Balanced 45-55%', emoji: '⚖️', multiplier: 3.0 },
    ],
  },
  {
    text: 'Will there be a goal before minute 45?',
    category: 'GOAL',
    difficulty: 'EASY',
    rewardCoins: 70,
    answerWindowSec: 600, // 10 minutes for testing
    options: [
      { name: 'Yes', emoji: '⚽', multiplier: 1.8 },
      { name: 'No', emoji: '🚫', multiplier: 2.2 },
    ],
  },
];

@Controller('mock')
export class MockController {
  private readonly logger = new Logger(MockController.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private scoringService: ScoringService,
    private ws: WebsocketGateway,
    private questionsService: QuestionsService,
  ) {}

  /**
   * POST /mock/seed
   * Seeds a fake live match + 5 questions (1 OPEN, 4 PENDING).
   * Cleans up any existing mock data first.
   */
  @Post('seed')
  async seed() {
    // ── Cleanup previous mock data ──
    await this.prisma.prediction.deleteMany({
      where: { question: { fixtureId: MOCK_FIXTURE_ID } },
    });
    await this.prisma.questionOption.deleteMany({
      where: { question: { fixtureId: MOCK_FIXTURE_ID } },
    });
    await this.prisma.question.deleteMany({
      where: { fixtureId: MOCK_FIXTURE_ID },
    });
    await this.prisma.feedEvent.deleteMany({
      where: { fixtureId: MOCK_FIXTURE_ID },
    });

    // ── Seed mock fixture in Redis ──
    await this.redis.setJson('cache:fixtures:live', [MOCK_FIXTURE], 86400);
    await this.redis.setJson('cache:fixtures:today', [MOCK_FIXTURE], 86400);

    // ── Create questions ──
    const now = new Date();
    const createdQuestions = [];

    for (let i = 0; i < MOCK_QUESTIONS.length; i++) {
      const q = MOCK_QUESTIONS[i];
      const opensAt = new Date(now.getTime() + i * 60_000); // stagger by 1 min
      const closesAt = new Date(opensAt.getTime() + q.answerWindowSec * 1000);

      const question = await this.questionsService.createQuestion({
        fixtureId: MOCK_FIXTURE_ID,
        category: q.category,
        difficulty: q.difficulty,
        text: q.text,
        rewardCoins: q.rewardCoins,
        opensAt: opensAt.toISOString(),
        closesAt: closesAt.toISOString(),
        options: q.options,
      });

      createdQuestions.push(question);
    }

    // Open the first question
    if (createdQuestions.length > 0) {
      await this.questionsService.openQuestion(createdQuestions[0].id);
    }

    this.logger.log(`Mock seed complete: fixture ${MOCK_FIXTURE_ID}, ${createdQuestions.length} questions`);

    return {
      fixtureId: MOCK_FIXTURE_ID,
      match: `${MOCK_FIXTURE.teams.home.name} vs ${MOCK_FIXTURE.teams.away.name}`,
      questions: createdQuestions.map((q) => ({
        id: q.id,
        text: q.text,
        status: q.status,
        options: q.options.map((o: any) => ({ id: o.id, name: o.name })),
      })),
    };
  }

  /**
   * POST /mock/auto-resolve
   * Enables auto-resolve mode: whenever a prediction is submitted,
   * wait 3 seconds then randomly pick a correct option and resolve.
   *
   * This works by polling for unresolved predictions every 2s.
   */
  @Post('auto-resolve')
  async enableAutoResolve() {
    if (this.autoResolveActive) {
      return { status: 'already active' };
    }
    this.autoResolveActive = true;
    this.runAutoResolveLoop();
    this.logger.log('Auto-resolve mode ENABLED — predictions resolve randomly after 3s');
    return { status: 'enabled', message: 'Predictions will now resolve randomly after ~3 seconds' };
  }

  @Post('auto-resolve/stop')
  async disableAutoResolve() {
    this.autoResolveActive = false;
    this.logger.log('Auto-resolve mode DISABLED');
    return { status: 'disabled' };
  }

  private autoResolveActive = false;

  private async runAutoResolveLoop() {
    while (this.autoResolveActive) {
      try {
        // Find OPEN questions that have at least 1 prediction and have been open for > 3s
        const questionsWithPredictions = await this.prisma.question.findMany({
          where: {
            fixtureId: MOCK_FIXTURE_ID,
            status: 'OPEN',
            predictions: { some: { isCorrect: null } },
          },
          include: { options: true, predictions: { where: { isCorrect: null } } },
        });

        for (const question of questionsWithPredictions) {
          // Check if oldest unresolved prediction is > 3s old
          const oldestPrediction = question.predictions
            .sort((a, b) => a.predictedAt.getTime() - b.predictedAt.getTime())[0];

          if (!oldestPrediction) continue;

          const ageMs = Date.now() - oldestPrediction.predictedAt.getTime();
          if (ageMs < 3000) continue;

          // Pick a random correct option
          const randomOption = question.options[
            Math.floor(Math.random() * question.options.length)
          ];

          this.logger.log(
            `[AUTO-RESOLVE] "${question.text}" → correct: "${randomOption.name}"`,
          );

          // Resolve via the same path as the real system
          await this.questionsService.resolveQuestion(question.id, randomOption.id);
          const results = await this.scoringService.scoreQuestion(question.id, randomOption.id);

          // Open next pending question
          const nextQuestion = await this.questionsService.openNextPending(MOCK_FIXTURE_ID);

          // Broadcast result
          this.ws.emitToMatch(MOCK_FIXTURE_ID, 'prediction_result', {
            questionId: question.id,
            correctOptionId: randomOption.id,
            results: results.map((r) => ({
              userId: r.userId,
              isCorrect: r.isCorrect,
              coinsResult: r.coinsResult,
              xpEarned: r.xpEarned,
            })),
          });

          // Broadcast new question if one was opened
          if (nextQuestion) {
            this.ws.emitToMatch(MOCK_FIXTURE_ID, 'new_question', {
              fixtureId: MOCK_FIXTURE_ID,
              questionId: nextQuestion.id,
              text: nextQuestion.text,
              category: nextQuestion.category,
            });
          }
        }
      } catch (e) {
        this.logger.error(`Auto-resolve error: ${e}`);
      }

      // Poll every 2 seconds
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
