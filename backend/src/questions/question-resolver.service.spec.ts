import { Test, TestingModule } from '@nestjs/testing';
import { QuestionResolverService } from './question-resolver.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ScoringService } from '../predictions/scoring.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { FeedService } from '../feed/feed.service';
import { ApiFootballService } from '../common/api-football/api-football.service';
import { createMockPrisma, createMockRedis, createMockWebsocket, createMockQuestion } from '../test/mock-factories';

describe('QuestionResolverService', () => {
  let service: QuestionResolverService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let redis: ReturnType<typeof createMockRedis>;
  let ws: ReturnType<typeof createMockWebsocket>;
  let scoringService: any;
  let feedService: any;
  let apiFootball: any;

  const fixtureId = 12345;
  const teams = { home: 'Arsenal', away: 'Chelsea' };
  const score = { home: 2, away: 1 };

  beforeEach(async () => {
    prisma = createMockPrisma();
    redis = createMockRedis();
    ws = createMockWebsocket();
    scoringService = {
      scoreQuestion: jest.fn().mockResolvedValue([]),
      voidQuestion: jest.fn().mockResolvedValue([]),
    };
    feedService = {
      createFeedEvent: jest.fn().mockResolvedValue({}),
    };
    apiFootball = {
      getFixtureStatistics: jest.fn().mockResolvedValue([]),
      getFixtureEvents: jest.fn().mockResolvedValue([]),
      isRateLimited: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ScoringService, useValue: scoringService },
        { provide: WebsocketGateway, useValue: ws },
        { provide: FeedService, useValue: feedService },
        { provide: ApiFootballService, useValue: apiFootball },
      ],
    }).compile();

    service = module.get<QuestionResolverService>(QuestionResolverService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══ lockExpiredQuestions ═══

  describe('lockExpiredQuestions', () => {
    it('locks OPEN questions with closesAt in the past', async () => {
      const expired = createMockQuestion({
        status: 'OPEN',
        closesAt: new Date(Date.now() - 5000),
      });
      prisma.question.findMany.mockResolvedValue([expired]);
      prisma.question.updateMany.mockResolvedValue({ count: 1 });
      prisma.question.findFirst.mockResolvedValue(null);

      await service.lockExpiredQuestions(fixtureId);

      expect(prisma.question.updateMany).toHaveBeenCalledWith({
        where: { id: expired.id, status: 'OPEN' },
        data: { status: 'LOCKED' },
      });
    });

    it('does nothing when no expired questions', async () => {
      prisma.question.findMany.mockResolvedValue([]);

      await service.lockExpiredQuestions(fixtureId);

      expect(prisma.question.updateMany).not.toHaveBeenCalled();
    });

    it('opens next PENDING after locking', async () => {
      const expired = createMockQuestion({ status: 'OPEN', closesAt: new Date(Date.now() - 5000) });
      const nextPending = createMockQuestion({ id: 'q-next', status: 'PENDING', opensAt: new Date(Date.now() - 1000) });

      prisma.question.findMany.mockResolvedValue([expired]);
      prisma.question.updateMany.mockResolvedValue({ count: 1 });
      prisma.question.findFirst.mockResolvedValue(nextPending);

      await service.lockExpiredQuestions(fixtureId);

      expect(prisma.question.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ fixtureId, status: 'PENDING' }),
        }),
      );
    });

    it('locks multiple expired questions but opens only ONE next', async () => {
      const expired1 = createMockQuestion({ id: 'q-exp-1', status: 'OPEN', closesAt: new Date(Date.now() - 10000) });
      const expired2 = createMockQuestion({ id: 'q-exp-2', status: 'OPEN', closesAt: new Date(Date.now() - 5000) });

      prisma.question.findMany.mockResolvedValue([expired1, expired2]);
      prisma.question.updateMany.mockResolvedValue({ count: 1 });
      prisma.question.findFirst.mockResolvedValue(null);

      await service.lockExpiredQuestions(fixtureId);

      // Both locked
      expect(prisma.question.updateMany).toHaveBeenCalledTimes(2);
      // openNextPending called only once
      expect(prisma.question.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // ═══ onFullTime ═══

  describe('onFullTime', () => {
    beforeEach(() => {
      // warmTemplateCache needs questionTemplate.findMany
      prisma.questionTemplate = { findMany: jest.fn().mockResolvedValue([]) } as any;
    });

    it('fetches all remaining OPEN/LOCKED/PENDING questions', async () => {
      prisma.question.findMany.mockResolvedValue([]);

      await service.onFullTime(fixtureId, teams, score);

      expect(prisma.question.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            fixtureId,
            status: { in: ['OPEN', 'LOCKED', 'PENDING'] },
          }),
        }),
      );
    });

    it('creates system feed event for full time', async () => {
      prisma.question.findMany.mockResolvedValue([]);

      await service.onFullTime(fixtureId, teams, score);

      expect(feedService.createFeedEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          fixtureId,
          type: 'SYSTEM',
          message: expect.stringContaining('Arsenal'),
        }),
      );
    });

    it('fetches events and stats from API for resolution', async () => {
      prisma.question.findMany.mockResolvedValue([]);

      await service.onFullTime(fixtureId, teams, score);

      expect(apiFootball.getFixtureStatistics).toHaveBeenCalled();
      expect(apiFootball.getFixtureEvents).toHaveBeenCalled();
    });
  });

  // ═══ onHalfTime ═══

  describe('onHalfTime', () => {
    it('fetches HT stats and events from API', async () => {
      prisma.question.findMany.mockResolvedValue([]);

      await service.onHalfTime(fixtureId, teams, score);

      expect(apiFootball.getFixtureStatistics).toHaveBeenCalled();
      expect(apiFootball.getFixtureEvents).toHaveBeenCalled();
    });
  });
});
