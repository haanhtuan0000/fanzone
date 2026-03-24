import { Controller, Post, Logger, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ScoringService } from '../predictions/scoring.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { QuestionsService } from '../questions/questions.service';

// ── Mock Fixture IDs ──
const MOCK_IDS = [99001, 99002, 99003];

// ── Mock Fixtures (API-Football format) ──
const MOCK_FIXTURES_LIVE = [
  {
    fixture: { id: 99001, date: new Date().toISOString(), status: { short: '2H', elapsed: 67 } },
    league: { id: 2, name: 'Champions League', logo: 'https://media.api-sports.io/football/leagues/2.png', round: 'Round of 16' },
    teams: {
      home: { id: 50, name: 'Manchester City', logo: 'https://media.api-sports.io/football/teams/50.png' },
      away: { id: 157, name: 'Bayern Munich', logo: 'https://media.api-sports.io/football/teams/157.png' },
    },
    goals: { home: 2, away: 1 },
    score: { halftime: { home: 1, away: 1 }, fulltime: { home: null, away: null } },
  },
  {
    fixture: { id: 99002, date: new Date().toISOString(), status: { short: '1H', elapsed: 34 } },
    league: { id: 140, name: 'La Liga', logo: 'https://media.api-sports.io/football/leagues/140.png', round: 'Regular Season - 30' },
    teams: {
      home: { id: 529, name: 'Barcelona', logo: 'https://media.api-sports.io/football/teams/529.png' },
      away: { id: 541, name: 'Real Madrid', logo: 'https://media.api-sports.io/football/teams/541.png' },
    },
    goals: { home: 1, away: 0 },
    score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
  },
  {
    fixture: { id: 99003, date: new Date().toISOString(), status: { short: '1H', elapsed: 12 } },
    league: { id: 39, name: 'Premier League', logo: 'https://media.api-sports.io/football/leagues/39.png', round: 'Regular Season - 32' },
    teams: {
      home: { id: 40, name: 'Liverpool', logo: 'https://media.api-sports.io/football/teams/40.png' },
      away: { id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' },
    },
    goals: { home: 0, away: 0 },
    score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
  },
];

const MOCK_FIXTURES_TODAY = [
  {
    fixture: {
      id: 99004,
      date: (() => { const d = new Date(); d.setHours(20, 0, 0, 0); return d.toISOString(); })(),
      status: { short: 'NS', elapsed: null },
    },
    league: { id: 39, name: 'Premier League', logo: 'https://media.api-sports.io/football/leagues/39.png', round: 'Regular Season - 32' },
    teams: {
      home: { id: 42, name: 'Arsenal', logo: 'https://media.api-sports.io/football/teams/42.png' },
      away: { id: 49, name: 'Chelsea', logo: 'https://media.api-sports.io/football/teams/49.png' },
    },
    goals: { home: 0, away: 0 },
    score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
  },
  {
    fixture: {
      id: 99005,
      date: (() => { const d = new Date(); d.setHours(21, 45, 0, 0); return d.toISOString(); })(),
      status: { short: 'NS', elapsed: null },
    },
    league: { id: 135, name: 'Serie A', logo: 'https://media.api-sports.io/football/leagues/135.png', round: 'Regular Season - 31' },
    teams: {
      home: { id: 496, name: 'Juventus', logo: 'https://media.api-sports.io/football/teams/496.png' },
      away: { id: 489, name: 'AC Milan', logo: 'https://media.api-sports.io/football/teams/489.png' },
    },
    goals: { home: 0, away: 0 },
    score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null } },
  },
];

// ── Mock Statistics (API-Football format) ──
const MOCK_STATS: Record<number, any[]> = {
  99001: [
    { team: { id: 50 }, statistics: [
      { type: 'Ball Possession', value: '58%' }, { type: 'Total Shots', value: '14' },
      { type: 'Yellow Cards', value: '1' }, { type: 'Corner Kicks', value: '4' },
    ]},
    { team: { id: 157 }, statistics: [
      { type: 'Ball Possession', value: '42%' }, { type: 'Total Shots', value: '7' },
      { type: 'Yellow Cards', value: '2' }, { type: 'Corner Kicks', value: '3' },
    ]},
  ],
  99002: [
    { team: { id: 529 }, statistics: [
      { type: 'Ball Possession', value: '63%' }, { type: 'Total Shots', value: '8' },
      { type: 'Yellow Cards', value: '0' }, { type: 'Corner Kicks', value: '5' },
    ]},
    { team: { id: 541 }, statistics: [
      { type: 'Ball Possession', value: '37%' }, { type: 'Total Shots', value: '4' },
      { type: 'Yellow Cards', value: '1' }, { type: 'Corner Kicks', value: '2' },
    ]},
  ],
  99003: [
    { team: { id: 40 }, statistics: [
      { type: 'Ball Possession', value: '52%' }, { type: 'Total Shots', value: '3' },
      { type: 'Yellow Cards', value: '0' }, { type: 'Corner Kicks', value: '1' },
    ]},
    { team: { id: 42 }, statistics: [
      { type: 'Ball Possession', value: '48%' }, { type: 'Total Shots', value: '2' },
      { type: 'Yellow Cards', value: '0' }, { type: 'Corner Kicks', value: '0' },
    ]},
  ],
};

// ── Questions per fixture ──
const QUESTIONS_PER_MATCH: Record<number, any[]> = {
  99001: [
    {
      text: 'Ai ghi bàn tiếp theo? ⚽|Who scores next? ⚽',
      category: 'GOAL', difficulty: 'MEDIUM', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: 'Man City', emoji: '🔵', multiplier: 2.5 },
        { name: 'Bayern', emoji: '🔴', multiplier: 3.0 },
        { name: 'Không ai', emoji: '🚫', multiplier: 1.5 },
      ],
    },
    {
      text: 'Có phạt góc trong 5 phút tới không?|Corner kick in next 5 minutes?',
      category: 'CORNER', difficulty: 'EASY', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: 'Có — Man City', emoji: '🚩', multiplier: 2.2 },
        { name: 'Có — Bayern', emoji: '🚩', multiplier: 2.4 },
        { name: 'Không có', emoji: '🚫', multiplier: 2.0 },
      ],
    },
    {
      text: 'Thẻ vàng tiếp theo cho đội nào?|Next yellow card for which team?',
      category: 'CARD', difficulty: 'EASY', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: 'Man City', emoji: '🟨', multiplier: 2.0 },
        { name: 'Bayern', emoji: '🟨', multiplier: 2.0 },
        { name: 'Không có', emoji: '✅', multiplier: 2.5 },
      ],
    },
    {
      text: 'Tỷ số cuối trận?|Final score?',
      category: 'STAT', difficulty: 'HARD', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: '2-1 (giữ nguyên)', emoji: '📊', multiplier: 2.5 },
        { name: '3-1 Man City', emoji: '📊', multiplier: 3.0 },
        { name: '2-2 hoà', emoji: '📊', multiplier: 3.5 },
        { name: 'Bayern thắng ngược', emoji: '📊', multiplier: 5.0 },
      ],
    },
    {
      text: 'Có bàn thắng trước phút 80 không?|Goal before minute 80?',
      category: 'GOAL', difficulty: 'EASY', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: 'Có', emoji: '⚽', multiplier: 1.8 },
        { name: 'Không', emoji: '🚫', multiplier: 2.2 },
      ],
    },
  ],
  99002: [
    {
      text: 'Barca ghi bàn tiếp không?|Will Barca score again?',
      category: 'GOAL', difficulty: 'MEDIUM', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: 'Có — trước HT', emoji: '⚽', multiplier: 2.8 },
        { name: 'Không — giữ 1-0', emoji: '🛡️', multiplier: 1.6 },
        { name: 'Real gỡ hoà', emoji: '⚽', multiplier: 3.0 },
      ],
    },
    {
      text: 'Ai kiểm soát bóng nhiều hơn lúc HT?|Who has more possession at HT?',
      category: 'STAT', difficulty: 'EASY', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: 'Barca > 55%', emoji: '📊', multiplier: 1.5 },
        { name: 'Real > 55%', emoji: '📊', multiplier: 3.0 },
        { name: 'Cân bằng', emoji: '⚖️', multiplier: 2.5 },
      ],
    },
    {
      text: 'Thẻ đỏ trong trận El Clasico?|Red card in El Clasico?',
      category: 'CARD', difficulty: 'HARD', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: 'Có', emoji: '🟥', multiplier: 4.0 },
        { name: 'Không', emoji: '✅', multiplier: 1.3 },
      ],
    },
  ],
  99003: [
    {
      text: 'Đội nào ghi bàn trước?|Who scores first?',
      category: 'GOAL', difficulty: 'MEDIUM', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: 'Liverpool', emoji: '🔴', multiplier: 2.2 },
        { name: 'Arsenal', emoji: '🔴', multiplier: 2.5 },
        { name: 'Hoà 0-0 hiệp 1', emoji: '🤝', multiplier: 2.0 },
      ],
    },
    {
      text: 'Phạt góc đầu tiên cho ai?|First corner for who?',
      category: 'CORNER', difficulty: 'EASY', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: 'Liverpool', emoji: '🚩', multiplier: 2.0 },
        { name: 'Arsenal', emoji: '🚩', multiplier: 2.0 },
      ],
    },
    {
      text: 'Tổng bàn thắng trận này?|Total goals this match?',
      category: 'GOAL', difficulty: 'HARD', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: '0-1 bàn', emoji: '🤏', multiplier: 2.5 },
        { name: '2-3 bàn', emoji: '⚽', multiplier: 1.8 },
        { name: '4+ bàn', emoji: '🔥', multiplier: 3.0 },
      ],
    },
    {
      text: 'VAR can thiệp trong hiệp 1?|VAR intervention in first half?',
      category: 'VAR', difficulty: 'MEDIUM', rewardCoins: 50, answerWindowSec: 120,
      options: [
        { name: 'Có', emoji: '📺', multiplier: 3.5 },
        { name: 'Không', emoji: '❌', multiplier: 1.4 },
      ],
    },
  ],
};

// ── Mock users for feed ──
const MOCK_USERS = [
  { email: 'mock-1@fanzone.test', displayName: 'JP TokyoKicker', avatarEmoji: '⚽', countryCode: 'JP' },
  { email: 'mock-2@fanzone.test', displayName: 'VN SaigonFan', avatarEmoji: '🎯', countryCode: 'VN' },
  { email: 'mock-3@fanzone.test', displayName: 'KR SeoulStriker', avatarEmoji: '🏆', countryCode: 'KR' },
  { email: 'mock-4@fanzone.test', displayName: 'US NYGoalHunter', avatarEmoji: '🦁', countryCode: 'US' },
  { email: 'mock-5@fanzone.test', displayName: 'BR RioFan99', avatarEmoji: '🔥', countryCode: 'BR' },
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
   * Seeds 3 live matches + upcoming matches + questions + stats + feed events.
   */
  @Post('seed')
  async seed() {
    // ── Cleanup previous mock data ──
    for (const fid of [...MOCK_IDS, 99004, 99005]) {
      await this.prisma.prediction.deleteMany({ where: { question: { fixtureId: fid } } });
      await this.prisma.questionOption.deleteMany({ where: { question: { fixtureId: fid } } });
      await this.prisma.question.deleteMany({ where: { fixtureId: fid } });
      await this.prisma.feedEvent.deleteMany({ where: { fixtureId: fid } });
    }

    // ── Seed fixtures in Redis ──
    await this.redis.setJson('cache:fixtures:live', MOCK_FIXTURES_LIVE, 86400);
    await this.redis.setJson('cache:fixtures:today', [...MOCK_FIXTURES_LIVE, ...MOCK_FIXTURES_TODAY], 86400);

    // ── Seed stats in Redis ──
    for (const [fid, stats] of Object.entries(MOCK_STATS)) {
      await this.redis.setJson(`cache:fixture:${fid}:stats`, stats, 86400);
    }

    // ── Create questions for each live match ──
    const allQuestions: Record<number, any[]> = {};

    for (const fixtureId of MOCK_IDS) {
      const questions = QUESTIONS_PER_MATCH[fixtureId] || [];
      const now = new Date();
      const created: any[] = [];

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const opensAt = new Date(now.getTime() + i * 60_000);
        const closesAt = new Date(opensAt.getTime() + q.answerWindowSec * 1000);

        const question = await this.questionsService.createQuestion({
          fixtureId,
          category: q.category,
          difficulty: q.difficulty,
          text: q.text,
          rewardCoins: q.rewardCoins,
          opensAt: opensAt.toISOString(),
          closesAt: closesAt.toISOString(),
          options: q.options,
        });
        created.push(question);
      }

      // Open the first question for each match
      if (created.length > 0) {
        await this.questionsService.openQuestion(created[0].id);
      }

      allQuestions[fixtureId] = created;
    }

    // ── Ensure mock users exist ──
    const userIds: string[] = [];
    for (const mu of MOCK_USERS) {
      const user = await this.prisma.user.upsert({
        where: { email: mu.email },
        update: { displayName: mu.displayName, avatarEmoji: mu.avatarEmoji },
        create: { email: mu.email, passwordHash: 'mock', displayName: mu.displayName, avatarEmoji: mu.avatarEmoji, countryCode: mu.countryCode },
      });
      userIds.push(user.id);
    }

    // ── Seed feed events ──
    const feedMessages = [
      { vi: 'Dự đoán đúng: Phạt góc trong 5\'', en: 'Correct: Corner in 5\'', type: 'CORRECT' as const, coins: 80 },
      { vi: 'Dự đoán sai: Ai ghi bàn tiếp', en: 'Wrong: Who scores next', type: 'WRONG' as const, coins: -50 },
      { vi: 'Dự đoán đúng: Thẻ vàng cho đội khách', en: 'Correct: Yellow card for away', type: 'CORRECT' as const, coins: 100 },
      { vi: 'Dự đoán sai: Tỷ số hiệp 1', en: 'Wrong: Half-time score', type: 'WRONG' as const, coins: -50 },
      { vi: 'Dự đoán đúng: Đội nhà ghi bàn trước', en: 'Correct: Home scores first', type: 'CORRECT' as const, coins: 125 },
      { vi: 'Dự đoán đúng: Có VAR', en: 'Correct: VAR intervention', type: 'CORRECT' as const, coins: 175 },
      { vi: 'Dự đoán sai: Phạt góc đầu tiên', en: 'Wrong: First corner', type: 'WRONG' as const, coins: -50 },
      { vi: 'Dự đoán đúng: Thay người trước 60\'', en: 'Correct: Sub before 60\'', type: 'CORRECT' as const, coins: 90 },
    ];

    for (const fixtureId of MOCK_IDS) {
      for (let i = 0; i < feedMessages.length; i++) {
        const fm = feedMessages[i];
        await this.prisma.feedEvent.create({
          data: {
            fixtureId,
            userId: userIds[i % userIds.length],
            type: fm.type,
            message: `${fm.en}|${fm.vi}`,
            coinsDelta: fm.coins,
          },
        });
      }
    }

    const summary = MOCK_IDS.map((fid) => {
      const fixture = MOCK_FIXTURES_LIVE.find((f) => f.fixture.id === fid);
      return {
        fixtureId: fid,
        match: `${fixture?.teams.home.name} vs ${fixture?.teams.away.name}`,
        questionsCount: allQuestions[fid]?.length ?? 0,
        firstQuestionId: allQuestions[fid]?.[0]?.id,
      };
    });

    this.logger.log(`Mock seed complete: ${MOCK_IDS.length} matches, ${Object.values(allQuestions).flat().length} questions`);

    return { matches: summary, upcomingMatches: MOCK_FIXTURES_TODAY.length };
  }

  /**
   * POST /mock/seed-scenario
   * Requires JWT. Seeds mock data + creates predictions for the authenticated user:
   * - Q1, Q2, Q3: RESOLVED with user predictions (correct/wrong/correct)
   * - Q4, Q5: LOCKED with user predictions (pending results)
   * - Q6 (next match): OPEN for user to answer
   * Produces the rich predict screen shown in the design doc.
   */
  @Post('seed-scenario')
  @UseGuards(JwtAuthGuard)
  async seedScenario(@Request() req: any) {
    const userId = req.user.id;

    // First, run normal seed
    const seedResult = await this.seed();

    // Work with fixture 99001 (Man City vs Bayern — 5 questions)
    const fixtureId = 99001;
    const questions = await this.prisma.question.findMany({
      where: { fixtureId },
      orderBy: { opensAt: 'asc' },
      include: { options: true },
    });

    if (questions.length < 5) {
      return { ...seedResult, scenario: 'not enough questions' };
    }

    const now = new Date();

    // Q1: RESOLVED — user predicted option[0], correct answer is option[0] → CORRECT
    const q1 = questions[0];
    await this.prisma.question.update({
      where: { id: q1.id },
      data: { status: 'RESOLVED', correctOptionId: q1.options[0].id, closesAt: new Date(now.getTime() - 300_000) },
    });
    await this.prisma.questionOption.update({ where: { id: q1.options[0].id }, data: { isCorrect: true, fanCount: 12 } });
    await this.prisma.prediction.create({
      data: { userId, questionId: q1.id, optionId: q1.options[0].id, coinsBet: 50, coinsResult: 125, isCorrect: true },
    });

    // Q2: RESOLVED — user predicted option[0], correct answer is option[1] → WRONG
    const q2 = questions[1];
    await this.prisma.question.update({
      where: { id: q2.id },
      data: { status: 'RESOLVED', correctOptionId: q2.options[1].id, closesAt: new Date(now.getTime() - 240_000) },
    });
    await this.prisma.questionOption.update({ where: { id: q2.options[1].id }, data: { isCorrect: true, fanCount: 8 } });
    await this.prisma.prediction.create({
      data: { userId, questionId: q2.id, optionId: q2.options[0].id, coinsBet: 50, coinsResult: -50, isCorrect: false },
    });

    // Q3: RESOLVED — user predicted option[0], correct answer is option[0] → CORRECT
    const q3 = questions[2];
    await this.prisma.question.update({
      where: { id: q3.id },
      data: { status: 'RESOLVED', correctOptionId: q3.options[0].id, closesAt: new Date(now.getTime() - 180_000) },
    });
    await this.prisma.questionOption.update({ where: { id: q3.options[0].id }, data: { isCorrect: true, fanCount: 15 } });
    await this.prisma.prediction.create({
      data: { userId, questionId: q3.id, optionId: q3.options[0].id, coinsBet: 50, coinsResult: 260, isCorrect: true },
    });

    // Q4: LOCKED — user predicted option[0], waiting for result
    const q4 = questions[3];
    await this.prisma.question.update({
      where: { id: q4.id },
      data: { status: 'CLOSED', closesAt: new Date(now.getTime() - 60_000) },
    });
    await this.prisma.prediction.create({
      data: { userId, questionId: q4.id, optionId: q4.options[0].id, coinsBet: 50 },
    });

    // Q5: OPEN — fresh for user to answer (10 min window)
    const q5 = questions[4];
    await this.prisma.question.update({
      where: { id: q5.id },
      data: { status: 'OPEN', opensAt: now, closesAt: new Date(now.getTime() + 600_000) },
    });

    // Update fan percentages for open question options
    for (const opt of q5.options) {
      const fakeFanCount = Math.floor(Math.random() * 20) + 5;
      await this.prisma.questionOption.update({ where: { id: opt.id }, data: { fanCount: fakeFanCount } });
    }

    this.logger.log(`Scenario seeded for user ${userId}: 3 resolved + 1 pending + 1 open`);

    return {
      ...seedResult,
      scenario: {
        userId,
        resolved: [q1.id, q2.id, q3.id],
        pending: [q4.id],
        open: q5.id,
        message: 'Pull to refresh on predict screen',
      },
    };
  }

  /**
   * POST /mock/auto-resolve
   * Auto-resolves predictions after ~3 seconds for ALL mock matches.
   */
  @Post('auto-resolve')
  async enableAutoResolve() {
    if (this.autoResolveActive) {
      return { status: 'already active' };
    }
    this.autoResolveActive = true;
    this.runAutoResolveLoop();
    this.logger.log('Auto-resolve mode ENABLED for all mock matches');
    return { status: 'enabled', message: 'Predictions will resolve randomly after ~3 seconds' };
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
        for (const fixtureId of MOCK_IDS) {
          const questionsWithPredictions = await this.prisma.question.findMany({
            where: {
              fixtureId,
              status: 'OPEN',
              predictions: { some: { isCorrect: null } },
            },
            include: { options: true, predictions: { where: { isCorrect: null } } },
          });

          for (const question of questionsWithPredictions) {
            const oldestPrediction = question.predictions
              .sort((a, b) => a.predictedAt.getTime() - b.predictedAt.getTime())[0];

            if (!oldestPrediction) continue;
            const ageMs = Date.now() - oldestPrediction.predictedAt.getTime();
            if (ageMs < 3000) continue;

            const randomOption = question.options[
              Math.floor(Math.random() * question.options.length)
            ];

            this.logger.log(`[AUTO-RESOLVE] fixture ${fixtureId}: "${question.text}" → "${randomOption.name}"`);

            await this.questionsService.resolveQuestion(question.id, randomOption.id);
            const results = await this.scoringService.scoreQuestion(question.id, randomOption.id);

            const nextQuestion = await this.questionsService.openNextPending(fixtureId);

            this.ws.emitToMatch(fixtureId, 'prediction_result', {
              questionId: question.id,
              correctOptionId: randomOption.id,
              results: results.map((r) => ({
                userId: r.userId,
                isCorrect: r.isCorrect,
                coinsResult: r.coinsResult,
                xpEarned: r.xpEarned,
              })),
            });

            if (nextQuestion) {
              this.ws.emitToMatch(fixtureId, 'new_question', {
                fixtureId,
                questionId: nextQuestion.id,
                text: nextQuestion.text,
                category: nextQuestion.category,
              });
            }
          }
        }
      } catch (e) {
        this.logger.error(`Auto-resolve error: ${e}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
