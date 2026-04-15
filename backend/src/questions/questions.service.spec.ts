import { Test, TestingModule } from '@nestjs/testing';
import { QuestionsService } from './questions.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { createMockPrisma, createMockRedis, createMockQuestion, createMockPendingQuestion } from '../test/mock-factories';

describe('QuestionsService', () => {
  let service: QuestionsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    redis = createMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<QuestionsService>(QuestionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── hasOpenQuestion ───

  describe('hasOpenQuestion', () => {
    it('returns true when OPEN question exists', async () => {
      prisma.question.count.mockResolvedValue(1);
      expect(await service.hasOpenQuestion(12345)).toBe(true);
      expect(prisma.question.count).toHaveBeenCalledWith({
        where: { fixtureId: 12345, status: 'OPEN' },
      });
    });

    it('returns false when no OPEN question exists', async () => {
      prisma.question.count.mockResolvedValue(0);
      expect(await service.hasOpenQuestion(12345)).toBe(false);
    });
  });

  // ─── hasPendingQuestion ───

  describe('hasPendingQuestion', () => {
    it('returns true when PENDING question exists', async () => {
      prisma.question.count.mockResolvedValue(2);
      expect(await service.hasPendingQuestion(12345)).toBe(true);
      expect(prisma.question.count).toHaveBeenCalledWith({
        where: { fixtureId: 12345, status: 'PENDING' },
      });
    });

    it('returns false when no PENDING question', async () => {
      prisma.question.count.mockResolvedValue(0);
      expect(await service.hasPendingQuestion(12345)).toBe(false);
    });
  });

  // ─── openNextPending ───

  describe('openNextPending', () => {
    it('opens the earliest PENDING question with opensAt <= now', async () => {
      const pending = createMockPendingQuestion({
        opensAt: new Date(Date.now() - 1000),
        closesAt: new Date(Date.now() - 1000 + 40_000),
      });
      prisma.question.findFirst.mockResolvedValue(pending);
      prisma.question.update.mockResolvedValue({ ...pending, status: 'OPEN' });

      const result = await service.openNextPending(12345);

      expect(prisma.question.findFirst).toHaveBeenCalledWith({
        where: { fixtureId: 12345, status: 'PENDING', opensAt: { lte: expect.any(Date) } },
        orderBy: { opensAt: 'asc' },
      });
      expect(result).not.toBeNull();
      // Narrow for TS — jest assertions don't act as type guards. An explicit
      // throw gives a clear message if the mock ever regresses to null.
      if (!result) throw new Error('expected openNextPending to return a question');
      expect(result.status).toBe('OPEN');
    });

    it('returns null when no PENDING question is ready', async () => {
      prisma.question.findFirst.mockResolvedValue(null);
      const result = await service.openNextPending(12345);
      expect(result).toBeNull();
      expect(prisma.question.update).not.toHaveBeenCalled();
    });

    it('preserves answer window duration when resetting opensAt/closesAt', async () => {
      const windowMs = 40_000;
      const pending = createMockPendingQuestion({
        opensAt: new Date(Date.now() - 5000),
        closesAt: new Date(Date.now() - 5000 + windowMs),
      });
      prisma.question.findFirst.mockResolvedValue(pending);
      prisma.question.update.mockImplementation(({ data }) => {
        return Promise.resolve({ ...pending, ...data });
      });

      await service.openNextPending(12345);

      const updateCall = prisma.question.update.mock.calls[0][0];
      const newOpensAt = new Date(updateCall.data.opensAt).getTime();
      const newClosesAt = new Date(updateCall.data.closesAt).getTime();
      expect(newClosesAt - newOpensAt).toBe(windowMs);
    });
  });

  // ─── getActiveQuestions ───

  describe('getActiveQuestions', () => {
    it('returns open question with fan percentages from Redis', async () => {
      const openQ = createMockQuestion({ status: 'OPEN', closesAt: new Date(Date.now() + 30_000) });
      prisma.question.findFirst.mockResolvedValue(openQ);
      prisma.question.findMany.mockResolvedValue([]);
      redis.hgetall.mockResolvedValue({ 'opt-1': '5', 'opt-2': '3' });

      const result = await service.getActiveQuestions(12345);

      expect(result.active).not.toBeNull();
      // Narrow for TS — jest assertions don't act as type guards.
      if (!result.active) throw new Error('expected an active question');
      expect(result.active.options[0].fanCount).toBe(5);
      expect(result.active.options[0].fanPct).toBe(63);
      expect(result.active.options[1].fanCount).toBe(3);
      expect(result.active.options[1].fanPct).toBe(38);
    });

    it('auto-locks expired OPEN question', async () => {
      const expired = createMockQuestion({ status: 'OPEN', closesAt: new Date(Date.now() - 5000) });
      prisma.question.findFirst
        .mockResolvedValueOnce(expired)
        .mockResolvedValueOnce(null);
      prisma.question.update.mockResolvedValue({ ...expired, status: 'LOCKED' });
      prisma.question.findMany.mockResolvedValue([]);

      const result = await service.getActiveQuestions(12345);

      expect(prisma.question.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'LOCKED' } }),
      );
      expect(result.active).toBeNull();
    });

    it('opens next PENDING when no OPEN exists and opensAt is due', async () => {
      const pending = createMockPendingQuestion({
        opensAt: new Date(Date.now() - 1000),
        closesAt: new Date(Date.now() - 1000 + 40_000),
      });
      prisma.question.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(pending);
      prisma.question.update.mockResolvedValue({ ...pending, status: 'OPEN', options: pending.options });
      prisma.question.findMany.mockResolvedValue([]);
      redis.hgetall.mockResolvedValue({});

      const result = await service.getActiveQuestions(12345);

      expect(result.active).toBeTruthy();
    });

    it('returns empty state when no questions at all', async () => {
      prisma.question.findFirst.mockResolvedValue(null);
      prisma.question.findMany.mockResolvedValue([]);

      const result = await service.getActiveQuestions(12345);

      expect(result.active).toBeNull();
      expect(result.upcoming).toEqual([]);
      expect(result.pendingResults).toEqual([]);
      expect(result.resolved).toEqual([]);
    });

    it('returns upcoming, pendingResults, and resolved arrays', async () => {
      prisma.question.findFirst.mockResolvedValue(null);
      prisma.question.findMany
        .mockResolvedValueOnce([createMockPendingQuestion()])
        .mockResolvedValueOnce([createMockQuestion({ status: 'LOCKED' })])
        .mockResolvedValueOnce([createMockQuestion({ status: 'RESOLVED' })]);

      const result = await service.getActiveQuestions(12345);

      expect(result.upcoming).toHaveLength(1);
      expect(result.pendingResults).toHaveLength(1);
      expect(result.resolved).toHaveLength(1);
    });
  });

  // ─── nextEstimatedAt ───

  describe('nextEstimatedAt', () => {
    it('returns nextEstimatedAt when no upcoming questions exist', async () => {
      // Question at minute 12, opened 1 min ago => match is ~minute 13 now
      // Next boundary: 15, which is kickoff + 15 min = ~2 min from now (future)
      const latestOpensAt = new Date(Date.now() - 1 * 60_000);
      prisma.question.findFirst
        .mockResolvedValueOnce(null)   // no OPEN
        .mockResolvedValueOnce(null)   // no PENDING ready to open
        .mockResolvedValueOnce({       // latest question for estimation
          matchMinute: 12,
          opensAt: latestOpensAt,
        });
      prisma.question.findMany.mockResolvedValue([]); // empty upcoming, pendingResults, resolved

      const result = await service.getActiveQuestions(12345);

      expect(result.nextEstimatedAt).toBeTruthy();
      // Next future boundary after minute 12 is minute 15
      const estimated = new Date(result.nextEstimatedAt!);
      const estimatedKickoff = latestOpensAt.getTime() - 12 * 60_000;
      const expectedTime = new Date(estimatedKickoff + 15 * 60_000);
      expect(Math.abs(estimated.getTime() - expectedTime.getTime())).toBeLessThan(1000);
    });

    it('returns null nextEstimatedAt when upcoming questions exist', async () => {
      const pending = createMockPendingQuestion();
      prisma.question.findFirst.mockResolvedValue(null);
      prisma.question.findMany
        .mockResolvedValueOnce([pending]) // upcoming
        .mockResolvedValueOnce([])        // pendingResults
        .mockResolvedValueOnce([]);       // resolved

      const result = await service.getActiveQuestions(12345);

      expect(result.nextEstimatedAt).toBeNull();
    });

    it('returns null nextEstimatedAt when match is past 90 min', async () => {
      prisma.question.findFirst
        .mockResolvedValueOnce(null)   // no OPEN
        .mockResolvedValueOnce(null)   // no PENDING ready
        .mockResolvedValueOnce({       // latest at minute 92
          matchMinute: 92,
          opensAt: new Date(Date.now() - 5 * 60_000),
        });
      prisma.question.findMany.mockResolvedValue([]);

      const result = await service.getActiveQuestions(12345);

      expect(result.nextEstimatedAt).toBeNull();
    });

    it('returns null nextEstimatedAt when open question exists', async () => {
      const openQ = createMockQuestion({ status: 'OPEN', closesAt: new Date(Date.now() + 30_000) });
      prisma.question.findFirst.mockResolvedValue(openQ);
      prisma.question.findMany.mockResolvedValue([]);
      redis.hgetall.mockResolvedValue({});

      const result = await service.getActiveQuestions(12345);

      expect(result.nextEstimatedAt).toBeNull();
    });

    it('returns null nextEstimatedAt when no questions ever generated', async () => {
      prisma.question.findFirst
        .mockResolvedValueOnce(null)   // no OPEN
        .mockResolvedValueOnce(null)   // no PENDING ready
        .mockResolvedValueOnce(null);  // no latest question at all
      prisma.question.findMany.mockResolvedValue([]);

      const result = await service.getActiveQuestions(12345);

      expect(result.nextEstimatedAt).toBeNull();
    });

    it('nextEstimatedAt is always in the future', async () => {
      // Latest question at minute 10, opened 2 real minutes ago
      // => kickoff was 12 min ago, next boundary (15) is in 3 real min = future
      const latestOpensAt = new Date(Date.now() - 2 * 60_000);
      prisma.question.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ matchMinute: 10, opensAt: latestOpensAt });
      prisma.question.findMany.mockResolvedValue([]);

      const result = await service.getActiveQuestions(12345);

      expect(result.nextEstimatedAt).toBeTruthy();
      const estimated = new Date(result.nextEstimatedAt!);
      expect(estimated.getTime()).toBeGreaterThan(Date.now());
    });

    it('skips past boundaries and returns next future one', async () => {
      // Latest at minute 10, but opened 10 min ago => match is ~minute 20 now
      // Boundary 15 is in the past, boundary 35 should be returned
      const latestOpensAt = new Date(Date.now() - 10 * 60_000);
      prisma.question.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ matchMinute: 10, opensAt: latestOpensAt });
      prisma.question.findMany.mockResolvedValue([]);

      const result = await service.getActiveQuestions(12345);

      expect(result.nextEstimatedAt).toBeTruthy();
      const estimated = new Date(result.nextEstimatedAt!);
      expect(estimated.getTime()).toBeGreaterThan(Date.now());
      // Should be boundary 35, which is ~15 real min from now
      const estimatedKickoff = latestOpensAt.getTime() - 10 * 60_000;
      const boundary35Time = estimatedKickoff + 35 * 60_000;
      expect(Math.abs(estimated.getTime() - boundary35Time)).toBeLessThan(1000);
    });
  });

  // ─── getTemplateIdsForFixture ───

  describe('getTemplateIdsForFixture', () => {
    it('returns unique template IDs for a fixture', async () => {
      prisma.question.findMany.mockResolvedValue([
        { templateId: 'tpl-1' },
        { templateId: 'tpl-2' },
      ]);

      const result = await service.getTemplateIdsForFixture(12345);

      expect(result).toEqual(['tpl-1', 'tpl-2']);
      expect(prisma.question.findMany).toHaveBeenCalledWith({
        where: { fixtureId: 12345, templateId: { not: null } },
        select: { templateId: true },
        distinct: ['templateId'],
      });
    });
  });

  // ─── createQuestion ───

  describe('createQuestion', () => {
    it('creates question with nested options and correct defaults', async () => {
      const created = createMockQuestion();
      prisma.question.create.mockResolvedValue(created);

      const result = await service.createQuestion({
        fixtureId: 12345,
        category: 'GOAL',
        text: 'Who scores next?',
        rewardCoins: 150,
        opensAt: new Date().toISOString(),
        closesAt: new Date(Date.now() + 40_000).toISOString(),
        options: [
          { name: 'Player A', emoji: '⚽', multiplier: 2.0 },
          { name: 'Player B', emoji: '🎯', multiplier: 3.0 },
        ],
      });

      expect(prisma.question.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fixtureId: 12345,
            category: 'GOAL',
            rewardCoins: 150,
            options: { create: expect.arrayContaining([
              expect.objectContaining({ name: 'Player A', multiplier: 2.0 }),
              expect.objectContaining({ name: 'Player B', multiplier: 3.0 }),
            ]) },
          }),
          include: { options: true },
        }),
      );
      expect(result).toEqual(created);
    });

    it('uses default rewardCoins of 50 when not specified', async () => {
      prisma.question.create.mockResolvedValue(createMockQuestion());

      await service.createQuestion({
        fixtureId: 12345,
        category: 'GOAL',
        text: 'Test?',
        opensAt: new Date().toISOString(),
        closesAt: new Date().toISOString(),
        options: [{ name: 'A' }, { name: 'B' }],
      });

      expect(prisma.question.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rewardCoins: 50 }),
        }),
      );
    });
  });
});
