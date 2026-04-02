/**
 * Seed script for QuestionTemplate table.
 * Upserts all 55 templates from question-bank.ts (v2.2) into the database.
 *
 * Usage:
 *   npx ts-node src/questions/templates/seed-templates.ts
 *
 * Or call SeedTemplatesService.seed() from within the app.
 */
import { PrismaClient, QuestionCategory, QuestionDifficulty, MatchPhase } from '@prisma/client';
import { QUESTION_BANK } from './question-bank';

const prisma = new PrismaClient();

async function seed() {
  console.log(`Seeding ${QUESTION_BANK.length} question templates...`);

  let created = 0;
  let updated = 0;

  for (const tpl of QUESTION_BANK) {
    const data = {
      category: tpl.category as QuestionCategory,
      difficulty: tpl.difficulty as QuestionDifficulty,
      trigger: tpl.trigger,
      phases: tpl.phases as MatchPhase[],
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
    };

    const result = await prisma.questionTemplate.upsert({
      where: { code: tpl.code },
      update: data,
      create: { code: tpl.code, ...data },
    });

    if (result.createdAt.getTime() === result.createdAt.getTime()) {
      // Can't easily tell upsert create vs update, just count
    }
    console.log(`  [${tpl.code}] ${tpl.textVi.substring(0, 40)}...`);
  }

  console.log(`Done. ${QUESTION_BANK.length} templates upserted.`);
}

// Allow running as standalone script
if (require.main === module) {
  seed()
    .catch((e) => {
      console.error('Seed failed:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

export { seed };
