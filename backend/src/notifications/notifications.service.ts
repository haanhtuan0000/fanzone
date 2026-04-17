import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { getFirebaseAdmin } from './firebase-admin';

type SendResult = { sent: number; failed: number };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Push a notification to every device registered to [userId]. Returns
   * per-call success/failure counts and silently prunes tokens that FCM
   * marks as permanently invalid (app uninstalled, token rotated) so the
   * `UserDevice` table stays clean without a separate cleanup job.
   *
   * Data-only payloads are supported by leaving `title` and/or `body`
   * empty — FCM will deliver them for the app to render in-foreground.
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<SendResult> {
    const devices = await this.prisma.userDevice.findMany({ where: { userId } });
    if (devices.length === 0) return { sent: 0, failed: 0 };

    const tokens = devices.map((d) => d.fcmToken);
    try {
      const messaging = getFirebaseAdmin().messaging();
      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data,
      });

      const invalid: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success && isPermanentTokenError(r.error?.code)) {
          invalid.push(tokens[i]);
        }
      });
      if (invalid.length) {
        await this.prisma.userDevice.deleteMany({ where: { fcmToken: { in: invalid } } });
        this.logger.log(`Pruned ${invalid.length} dead FCM token(s) for user ${userId}`);
      }

      return { sent: res.successCount, failed: res.failureCount };
    } catch (e) {
      this.logger.error(`FCM send failed for user ${userId}: ${(e as Error).message}`);
      return { sent: 0, failed: tokens.length };
    }
  }

  /**
   * Broadcast to all users who have predicted on [fixtureId]. Useful for
   * "match kickoff" / "FT summary" / "new question" pushes in later
   * stages. Uses an in-memory fan-out over [sendToUser] so per-user
   * pruning stays correct and quota logic (Stage 5) applies.
   */
  async sendToMatchWatchers(
    fixtureId: number,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<SendResult> {
    const predictions = await this.prisma.prediction.findMany({
      where: { question: { fixtureId } },
      select: { userId: true },
      distinct: ['userId'],
    });

    let sent = 0;
    let failed = 0;
    for (const p of predictions) {
      const r = await this.sendToUser(p.userId, title, body, data);
      sent += r.sent;
      failed += r.failed;
    }
    return { sent, failed };
  }

  async registerDevice(userId: string, fcmToken: string, platform: 'ANDROID' | 'IOS') {
    return this.prisma.userDevice.upsert({
      where: { userId_fcmToken: { userId, fcmToken } },
      create: { userId, fcmToken, platform },
      update: { platform },
    });
  }

  async unregisterDevice(userId: string, fcmToken: string) {
    await this.prisma.userDevice.deleteMany({
      where: { userId, fcmToken },
    });
  }
}

/**
 * FCM returns error codes that fall into three buckets: transient
 * (retry later), malformed (the server sent bad input), and permanent
 * (the token is dead and will never work again). We only prune on
 * the last bucket — pruning a transient failure would lose a valid
 * device until the user logs in again.
 *
 * See: https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode
 */
function isPermanentTokenError(code: string | undefined): boolean {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/invalid-argument'
  );
}
