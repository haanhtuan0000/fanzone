import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { seed as seedTemplates } from './questions/templates/seed-templates';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  // Auto-seed question templates from question-bank.ts → DB on every start.
  // Uses upsert so it's idempotent — no duplicates, just updates changed
  // fields (textEn, textZh, options, phases, etc.). Removes the manual
  // "remember to run seed-templates.ts after deploy" step that was easy to
  // forget and left the DB out of sync with the code.
  try {
    await seedTemplates();
  } catch (e) {
    console.error('Template seed failed (non-fatal, app continues):', e);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`FanZone backend running on port ${port}`);
}
bootstrap();
