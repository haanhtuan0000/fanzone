import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { QuestionGeneratorService } from './question-generator.service';
import { QUESTION_BANK } from './templates/question-bank';

/**
 * On startup:
 * 1. Seed/upsert all 30 question templates into the DB
 * 2. Check for in-progress live matches and generate questions
 *    for them (catches up after server restart mid-match)
 */
@Injectable()
export class StartupService implements OnModuleInit {
  private readonly logger = new Logger(StartupService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private questionGenerator: QuestionGeneratorService,
  ) {}

  async onModuleInit() {
    await this.seedTemplates();
    // Delay catch-up slightly to let pollers populate Redis first
    setTimeout(() => this.catchUpLiveMatches(), 20_000);
  }

  private async seedTemplates() {
    this.logger.log(`Seeding ${QUESTION_BANK.length} question templates...`);
    let count = 0;

    for (const tpl of QUESTION_BANK) {
      await this.prisma.questionTemplate.upsert({
        where: { code: tpl.code },
        update: {
          textVi: tpl.textVi,
          textEn: tpl.textEn,
          rewardCoins: tpl.rewardCoins,
          answerWindowSec: tpl.answerWindowSec,
          options: tpl.options as any,
          resolutionStrategy: tpl.resolutionStrategy,
          weight: tpl.weight,
          trigger: tpl.trigger,
          phases: tpl.phases as any,
          category: tpl.category as any,
          difficulty: tpl.difficulty as any,
          isActive: true,
        },
        create: {
          code: tpl.code,
          category: tpl.category as any,
          difficulty: tpl.difficulty as any,
          trigger: tpl.trigger,
          phases: tpl.phases as any,
          textVi: tpl.textVi,
          textEn: tpl.textEn,
          rewardCoins: tpl.rewardCoins,
          answerWindowSec: tpl.answerWindowSec,
          options: tpl.options as any,
          defaultFanPcts: tpl.options.map((o) => o.defaultPct),
          resolutionStrategy: tpl.resolutionStrategy,
          weight: tpl.weight,
          isActive: true,
        },
      });
      count++;
    }

    this.logger.log(`Seeded ${count} question templates`);
  }

  /**
   * For any live match that has 0 questions in the DB,
   * generate questions for the current phase.
   */
  private async catchUpLiveMatches() {
    try {
      const liveFixtures = await this.redis.getJson<any[]>('cache:fixtures:live');
      if (!liveFixtures || liveFixtures.length === 0) {
        this.logger.log('No live fixtures to catch up on');
        return;
      }

      for (const fixture of liveFixtures) {
        const fixtureId = fixture?.fixture?.id;
        if (!fixtureId) continue;

        const homeTeam = fixture?.teams?.home?.name;
        const awayTeam = fixture?.teams?.away?.name;
        if (!homeTeam || !awayTeam) continue;

        // Check if questions already exist for this fixture
        const existingCount = await this.prisma.question.count({
          where: { fixtureId },
        });

        if (existingCount > 0) {
          this.logger.debug(`Fixture ${fixtureId}: already has ${existingCount} questions, skipping`);
          continue;
        }

        const elapsed = fixture?.fixture?.status?.elapsed ?? 0;
        const period = fixture?.fixture?.status?.short ?? '';
        const homeScore = fixture?.goals?.home ?? 0;
        const awayScore = fixture?.goals?.away ?? 0;

        this.logger.log(
          `Catching up fixture ${fixtureId}: ${homeTeam} vs ${awayTeam} (${period} ${elapsed}')`,
        );

        await this.questionGenerator.generateForPhase(
          fixtureId,
          elapsed,
          { home: homeTeam, away: awayTeam },
          { home: homeScore, away: awayScore },
          period,
        );
      }
    } catch (e) {
      this.logger.error(`Catch-up failed: ${e}`);
    }
  }
}
