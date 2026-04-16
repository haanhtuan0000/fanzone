import { Test, TestingModule } from '@nestjs/testing';
import { QuestionsService } from './questions.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { createMockRedis } from '../test/mock-factories';

/**
 * Pins the rule: createQuestion must NEVER persist a row whose text or
 * option name/info still contains an unresolved `{placeholder}`. That's
 * how the Mutondo Stars "striker" bug slipped into production — nobody
 * was asserting this at the persistence boundary, so a template whose
 * variables weren't fully substituted looked fine to the test harness
 * but broken to the user.
 *
 * These tests cover the shape regardless of WHICH upstream produced the
 * bad string: resolver typo, context missing a field, or someone
 * bypassing the resolver altogether.
 */
describe('QuestionsService.createQuestion — unresolved-placeholder contract', () => {
  let service: QuestionsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      question: {
        create: jest.fn().mockResolvedValue({ id: 'q-ok', options: [] }),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: createMockRedis() },
      ],
    }).compile();
    service = module.get(QuestionsService);
  });

  const baseData = {
    fixtureId: 1,
    category: 'GOAL',
    text: 'Who will score next?',
    opensAt: new Date().toISOString(),
    closesAt: new Date(Date.now() + 30_000).toISOString(),
    options: [{ name: 'Home striker', emoji: '⚽' }],
  };

  it('throws when text still contains a placeholder', async () => {
    await expect(
      service.createQuestion({
        ...baseData,
        text: 'Will {home_striker} score in this match?',
      }),
    ).rejects.toThrow(/unresolved placeholder in text/);
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('throws when any option.name contains a placeholder (the Mutondo Stars shape)', async () => {
    await expect(
      service.createQuestion({
        ...baseData,
        options: [
          { name: 'Harry Kane', emoji: '⚽' },
          { name: '{away_striker}', emoji: '⚽' }, // <-- bug
        ],
      }),
    ).rejects.toThrow(/unresolved placeholder in options\[1\]\.name/);
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('throws when option.info contains a placeholder', async () => {
    await expect(
      service.createQuestion({
        ...baseData,
        options: [{ name: 'Yes', info: '{home_team} leads', emoji: '⚽' }],
      }),
    ).rejects.toThrow(/unresolved placeholder in options\[0\]\.info/);
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it('accepts fully-resolved text and options (happy path)', async () => {
    await service.createQuestion({
      ...baseData,
      text: 'Who will score next?',
      options: [
        { name: 'Lukas Nmecha', emoji: '⚽' },
        { name: 'Harry Kane', emoji: '⚽' },
        { name: 'Other player', emoji: '⚽' },
      ],
    });
    expect(prisma.question.create).toHaveBeenCalledTimes(1);
  });

  it('does not reject emoji or curly-quote-adjacent strings (regex requires an identifier inside braces)', async () => {
    // e.g., a translation that uses the literal brace "{!}" or a score
    // like "{0-1}" must not trip the contract. Regex only matches
    // `[A-Za-z_][A-Za-z0-9_]*` inside braces.
    await service.createQuestion({
      ...baseData,
      text: 'Score now {0-1}?',
      options: [{ name: '{!} surprise', emoji: '⚽' }],
    });
    expect(prisma.question.create).toHaveBeenCalledTimes(1);
  });

  it('first offending field wins — error message points to it', async () => {
    // If BOTH text and an option are bad, the text check runs first.
    await expect(
      service.createQuestion({
        ...baseData,
        text: 'Will {home_striker} do it?',
        options: [{ name: '{away_striker}', emoji: '⚽' }],
      }),
    ).rejects.toThrow(/unresolved placeholder in text/);
  });
});
