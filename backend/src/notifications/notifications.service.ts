import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async sendToUser(userId: string, title: string, body: string, data?: Record<string, string>) {
    const devices = await this.prisma.userDevice.findMany({ where: { userId } });
    if (devices.length === 0) return;

    // FCM integration placeholder — will be implemented when Firebase is configured
    this.logger.log(`Push notification to ${userId}: ${title} - ${body}`);
    for (const device of devices) {
      this.logger.debug(`Would send to FCM token: ${device.fcmToken.substring(0, 10)}...`);
    }
  }

  async sendToMatchWatchers(fixtureId: number, title: string, body: string, data?: Record<string, string>) {
    this.logger.log(`Push notification to watchers of fixture ${fixtureId}: ${title}`);
    // Implementation: query users who have joined this match room and send FCM
  }

  async registerDevice(userId: string, fcmToken: string, platform: 'ANDROID' | 'IOS') {
    return this.prisma.userDevice.upsert({
      where: { userId_fcmToken: { userId, fcmToken } },
      create: { userId, fcmToken, platform },
      update: { platform },
    });
  }
}
