import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService, NotifKind } from './notifications.service';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';

// Mock firebase-admin module surface so we never touch the network or
// require a service-account file in unit tests.
const mockSendEachForMulticast = jest.fn();
jest.mock('./firebase-admin', () => ({
  getFirebaseAdmin: () => ({
    messaging: () => ({ sendEachForMulticast: mockSendEachForMulticast }),
  }),
}));

const rawHello: NotifKind = { type: 'raw', title: 'hello', body: 'world' };

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let redis: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      userDevice: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
      prediction: {
        findMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    };

    // Fake Redis that allows up to `limit=3` INCRs per key before blocking.
    // Shared counter map keeps state across calls in a single test.
    const counters = new Map<string, number>();
    redis = {
      getClient: () => ({
        incr: jest.fn(async (key: string) => {
          const n = (counters.get(key) ?? 0) + 1;
          counters.set(key, n);
          return n;
        }),
      }),
      expire: jest.fn(async () => {}),
      __counters: counters,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('sendToUser', () => {
    it('returns {sent:0,failed:0} when user has no devices', async () => {
      prisma.userDevice.findMany.mockResolvedValue([]);
      const res = await service.sendToUser('u1', rawHello);
      expect(res).toEqual({ sent: 0, failed: 0 });
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it('forwards a raw notif to multicast and returns counts', async () => {
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'tok1', locale: 'vi' },
        { fcmToken: 'tok2', locale: 'vi' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      });

      const res = await service.sendToUser('u1', rawHello, { route: '/x' });

      expect(mockSendEachForMulticast).toHaveBeenCalledWith({
        tokens: ['tok1', 'tok2'],
        notification: { title: 'hello', body: 'world' },
        data: { route: '/x' },
      });
      expect(res).toEqual({ sent: 2, failed: 0 });
    });

    it('prunes tokens that FCM marks as permanently unregistered', async () => {
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'good', locale: 'vi' },
        { fcmToken: 'dead', locale: 'vi' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: true },
          {
            success: false,
            error: { code: 'messaging/registration-token-not-registered' },
          },
        ],
      });

      await service.sendToUser('u1', rawHello);

      expect(prisma.userDevice.deleteMany).toHaveBeenCalledWith({
        where: { fcmToken: { in: ['dead'] } },
      });
    });

    it('does NOT prune on transient/unknown error codes', async () => {
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'tok', locale: 'vi' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 0,
        failureCount: 1,
        responses: [
          {
            success: false,
            error: { code: 'messaging/server-unavailable' },
          },
        ],
      });

      await service.sendToUser('u1', rawHello);

      expect(prisma.userDevice.deleteMany).not.toHaveBeenCalled();
    });

    it('swallows FCM exceptions and reports all as failed', async () => {
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'tok1', locale: 'vi' },
        { fcmToken: 'tok2', locale: 'vi' },
      ]);
      mockSendEachForMulticast.mockRejectedValue(new Error('network down'));

      const res = await service.sendToUser('u1', rawHello);

      expect(res).toEqual({ sent: 0, failed: 2 });
    });

    it('splits into one multicast per device locale (mixed VI+EN)', async () => {
      // Two devices on same user — different system languages.
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'phone_vi', locale: 'vi' },
        { fcmToken: 'tablet_en', locale: 'en' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      await service.sendToUser(
        'u1',
        { type: 'correct', text: 'VAR?', coins: 100, dailyTotal: 1500 },
      );

      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);
      const calls = mockSendEachForMulticast.mock.calls;
      const bodies = calls.map((c) => c[0].notification.body);
      expect(bodies.some((b) => b.includes('Chính xác'))).toBe(true);
      expect(bodies.some((b) => b.includes('Correct!'))).toBe(true);
    });
  });

  describe('registerDevice', () => {
    it('upserts with the given platform + normalised locale', async () => {
      prisma.userDevice.upsert.mockResolvedValue({});
      await service.registerDevice('u1', 'tok', 'ANDROID', 'en');
      expect(prisma.userDevice.upsert).toHaveBeenCalledWith({
        where: { userId_fcmToken: { userId: 'u1', fcmToken: 'tok' } },
        create: { userId: 'u1', fcmToken: 'tok', platform: 'ANDROID', locale: 'en' },
        update: { platform: 'ANDROID', locale: 'en' },
      });
    });

    it('falls back to vi when no locale is supplied (older clients)', async () => {
      prisma.userDevice.upsert.mockResolvedValue({});
      await service.registerDevice('u1', 'tok', 'ANDROID');
      expect(prisma.userDevice.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ locale: 'vi' }),
          update: expect.objectContaining({ locale: 'vi' }),
        }),
      );
    });
  });

  describe('pushNewQuestion', () => {
    const question = {
      id: 'q1',
      text: 'Who scores next?',
      fixtureId: 42,
      rewardCoins: 50,
      closesAt: new Date(Date.now() + 90_000), // 90s from now
    };

    it('fans out to distinct users who predicted on the fixture', async () => {
      prisma.prediction.findMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]);
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'tok', locale: 'vi' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      await service.pushNewQuestion(42, question);

      expect(prisma.prediction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { question: { fixtureId: 42 } },
          distinct: ['userId'],
        }),
      );
      // Each of u1, u2 triggers one multicast call.
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);
    });

    it('skips users who exceeded per-match quota of 3 pushes', async () => {
      redis.__counters.set('fcm:q:u:u1:f:42', 3);
      prisma.prediction.findMany.mockResolvedValue([{ userId: 'u1' }]);

      await service.pushNewQuestion(42, question);

      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it('no-op when zero users are watching the fixture', async () => {
      prisma.prediction.findMany.mockResolvedValue([]);
      await service.pushNewQuestion(42, question);
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });
  });

  describe('pushPredictionResult', () => {
    const question = { id: 'q1', text: 'Who scores?', fixtureId: 42 };

    it('sends correct-type payload when isCorrect=true', async () => {
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'tok', locale: 'vi' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      await service.pushPredictionResult('u1', question, true, 100, 1500);

      expect(mockSendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'correct',
            coins: '100',
            dailyTotal: '1500',
            route: '/predict',
          }),
        }),
      );
    });

    it('sends wrong-type payload when isCorrect=false', async () => {
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'tok', locale: 'vi' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      await service.pushPredictionResult('u1', question, false, 50, 1200);

      expect(mockSendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'wrong', coins: '50' }),
        }),
      );
    });
  });

  describe('pushQuestionTimeout', () => {
    it('targets users who watched fixture but did NOT answer this question', async () => {
      const question = {
        id: 'q2',
        text: 'VAR called?',
        fixtureId: 42,
        rewardCoins: 50,
        closesAt: new Date(),
      };
      prisma.user.findMany.mockResolvedValue([{ id: 'u3' }]);
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'tok', locale: 'vi' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      await service.pushQuestionTimeout(42, question);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            predictions: { some: { question: { fixtureId: 42 } } },
            NOT: { predictions: { some: { questionId: 'q2' } } },
          }),
        }),
      );
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    });
  });
});
