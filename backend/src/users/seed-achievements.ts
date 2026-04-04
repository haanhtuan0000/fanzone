import { PrismaClient } from '@prisma/client';

const ACHIEVEMENTS = [
  { name: 'First Prediction', description: 'Make your first prediction', conditionType: 'TOTAL', conditionValue: 1, rewardXp: 50 },
  { name: 'Beginner', description: 'Make 10 predictions', conditionType: 'TOTAL', conditionValue: 10, rewardXp: 100 },
  { name: 'Active Fan', description: 'Make 50 predictions', conditionType: 'TOTAL', conditionValue: 50, rewardXp: 200 },
  { name: 'Prediction Master', description: 'Make 200 predictions', conditionType: 'TOTAL', conditionValue: 200, rewardXp: 500 },
  { name: 'Sharp Eye', description: 'Reach 60% accuracy', conditionType: 'ACCURACY', conditionValue: 60, rewardXp: 150 },
  { name: 'Oracle', description: 'Reach 75% accuracy', conditionType: 'ACCURACY', conditionValue: 75, rewardXp: 300 },
  { name: 'Nostradamus', description: 'Reach 90% accuracy', conditionType: 'ACCURACY', conditionValue: 90, rewardXp: 1000 },
  { name: 'On Fire', description: '3 day streak', conditionType: 'STREAK', conditionValue: 3, rewardXp: 100 },
  { name: 'Dedicated', description: '7 day streak', conditionType: 'STREAK', conditionValue: 7, rewardXp: 250 },
  { name: 'Unstoppable', description: '30 day streak', conditionType: 'STREAK', conditionValue: 30, rewardXp: 1000 },
  { name: 'Lucky Streak', description: '3 correct in a row', conditionType: 'CONSECUTIVE_CORRECT', conditionValue: 3, rewardXp: 100 },
  { name: 'Hot Hand', description: '5 correct in a row', conditionType: 'CONSECUTIVE_CORRECT', conditionValue: 5, rewardXp: 250 },
  { name: 'Untouchable', description: '10 correct in a row', conditionType: 'CONSECUTIVE_CORRECT', conditionValue: 10, rewardXp: 1000 },
];

async function seed() {
  const prisma = new PrismaClient();
  console.log('Seeding achievements...');
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { name: a.name },
      update: { description: a.description, conditionType: a.conditionType as any, conditionValue: a.conditionValue, rewardXp: a.rewardXp },
      create: { name: a.name, description: a.description, conditionType: a.conditionType as any, conditionValue: a.conditionValue, rewardXp: a.rewardXp },
    });
    console.log(`  [${a.name}] ${a.description}`);
  }
  console.log(`Done. ${ACHIEVEMENTS.length} achievements seeded.`);
  await prisma.$disconnect();
}

seed();
