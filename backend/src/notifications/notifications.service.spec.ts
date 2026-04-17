import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../common/prisma.service';

// Mock firebase-admin module surface so we never touch the network or
// require a service-account file in unit tests.
const mockSendEachForMulticast = jest.fn();
jest.mock('./firebase-admin', () => ({
  getFirebaseAdmin: () => ({
    messaging: () => ({ sendEachForMulticast: mockSendEachForMulticast }),
  }),
}));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;

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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('sendToUser', () => {
    it('returns {sent:0,failed:0} when user has no devices', async () => {
      prisma.userDevice.findMany.mockResolvedValue([]);
      const res = await service.sendToUser('u1', 't', 'b');
      expect(res).toEqual({ sent: 0, failed: 0 });
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it('forwards title+body+data to multicast and returns counts', async () => {
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'tok1' },
        { fcmToken: 'tok2' },
      ]);
      mockSendEachForMulticast.mockResolvedValue({
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      });

      const res = await service.sendToUser('u1', 'hello', 'world', { route: '/x' });

      expect(mockSendEachForMulticast).toHaveBeenCalledWith({
        tokens: ['tok1', 'tok2'],
        notification: { title: 'hello', body: 'world' },
        data: { route: '/x' },
      });
      expect(res).toEqual({ sent: 2, failed: 0 });
    });

    it('prunes tokens that FCM marks as permanently unregistered', async () => {
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'good' },
        { fcmToken: 'dead' },
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

      await service.sendToUser('u1', 't', 'b');

      expect(prisma.userDevice.deleteMany).toHaveBeenCalledWith({
        where: { fcmToken: { in: ['dead'] } },
      });
    });

    it('does NOT prune on transient/unknown error codes', async () => {
      prisma.userDevice.findMany.mockResolvedValue([{ fcmToken: 'tok' }]);
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

      await service.sendToUser('u1', 't', 'b');

      expect(prisma.userDevice.deleteMany).not.toHaveBeenCalled();
    });

    it('swallows FCM exceptions and reports all as failed', async () => {
      prisma.userDevice.findMany.mockResolvedValue([
        { fcmToken: 'tok1' },
        { fcmToken: 'tok2' },
      ]);
      mockSendEachForMulticast.mockRejectedValue(new Error('network down'));

      const res = await service.sendToUser('u1', 't', 'b');

      expect(res).toEqual({ sent: 0, failed: 2 });
    });
  });

  describe('registerDevice', () => {
    it('upserts on (userId, fcmToken) with the given platform', async () => {
      prisma.userDevice.upsert.mockResolvedValue({});
      await service.registerDevice('u1', 'tok', 'ANDROID');
      expect(prisma.userDevice.upsert).toHaveBeenCalledWith({
        where: { userId_fcmToken: { userId: 'u1', fcmToken: 'tok' } },
        create: { userId: 'u1', fcmToken: 'tok', platform: 'ANDROID' },
        update: { platform: 'ANDROID' },
      });
    });
  });
});
