import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { QUESTION_BANK } from './templates/question-bank';

/**
 * On startup: seed/upsert all 30 question templates into the DB.
 * Live match catch-up is handled by MatchDataManager.
 */
@Injectable()
export class StartupService implements OnModuleInit {
  private readonly logger = new Logger(StartupService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedTemplates();
  }

  private async seedTemplates() {
    this.logger.log(`Seeding ${QUESTION_BANK.length} question templates...`);

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
          timeoutWindowMin: tpl.timeoutWindowMin ?? null,
          voidCondition: tpl.voidCondition ?? null,
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
          timeoutWindowMin: tpl.timeoutWindowMin ?? null,
          voidCondition: tpl.voidCondition ?? null,
          weight: tpl.weight,
          isActive: true,
        },
      });
    }

    this.logger.log(`Seeded ${QUESTION_BANK.length} question templates`);
  }
}
