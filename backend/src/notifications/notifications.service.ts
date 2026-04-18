import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { titleForLevel } from '../users/users.service';
import { getFirebaseAdmin } from './firebase-admin';
import {
  tryIncrementDailyQuota,
  tryIncrementQuestionQuota,
} from './notification-quota';
import {
  achievementText,
  correctText,
  levelUpText,
  Locale,
  newQuestionText,
  NotifText,
  pickLocale,
  rankMilestoneText,
  streakMilestoneText,
  timeoutText,
  wrongText,
} from './notification-templates';

type SendResult = { sent: number; failed: number };

/** Minimal question shape needed for push text/payload. */
interface PushableQuestion {
  id: string;
  text: string;
  fixtureId: number;
  rewardCoins: number;
  closesAt: Date;
}

/**
 * Tagged union describing a push to send. The dispatcher picks the
 * right template per recipient's device locale, so callers stay
 * locale-agnostic. `raw` is an escape hatch for ad-hoc pushes (e.g.
 * from admin tools) that don't need localisation.
 */
export type NotifKind =
  | { type: 'new_question'; text: string; seconds: number; reward: number }
  | { type: 'correct'; text: string; coins: number; dailyTotal: number }
  | { type: 'wrong'; text: string; coins: number }
  | { type: 'timeout'; text: string }
  | { type: 'rank_milestone'; position: number }
  | { type: 'achievement'; name: string; rewardXp: number }
  | { type: 'level_up'; level: number }
  | { type: 'streak_milestone'; days: number }
  | { type: 'raw'; title: string; body: string };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Push a notification to every device registered to [userId]. The
   * body is rendered per-device: a user with one VI phone and one EN
   * phone gets two multicasts, each in the correct language. Silently
   * prunes tokens that FCM marks as permanently invalid so the
   * `UserDevice` table stays clean without a separate cleanup job.
   */
  async sendToUser(
    userId: string,
    kind: NotifKind,
    data: Record<string, string> = {},
  ): Promise<SendResult> {
    const devices = await this.prisma.userDevice.findMany({ where: { userId } });
    if (devices.length === 0) return { sent: 0, failed: 0 };

    // Group devices by locale so one multicast per language keeps
    // the body consistent across its recipients.
    const byLocale = new Map<Locale, string[]>();
    for (const d of devices) {
      const locale = pickLocale(d.locale);
      const arr = byLocale.get(locale);
      if (arr) arr.push(d.fcmToken);
      else byLocale.set(locale, [d.fcmToken]);
    }

    let sent = 0;
    let failed = 0;
    try {
      const messaging = getFirebaseAdmin().messaging();
      for (const [locale, tokens] of byLocale) {
        const text = this.render(kind, locale);
        const res = await messaging.sendEachForMulticast({
          tokens,
          notification: { title: text.title, body: text.body },
          data,
        });

        const invalid: string[] = [];
        res.responses.forEach((r, i) => {
          if (!r.success && isPermanentTokenError(r.error?.code)) {
            invalid.push(tokens[i]);
          }
        });
        if (invalid.length) {
          await this.prisma.userDevice.deleteMany({
            where: { fcmToken: { in: invalid } },
          });
          this.logger.log(
            `Pruned ${invalid.length} dead FCM token(s) for user ${userId}`,
          );
        }

        sent += res.successCount;
        failed += res.failureCount;
      }
      return { sent, failed };
    } catch (e) {
      this.logger.error(
        `FCM send failed for user ${userId}: ${(e as Error).message}`,
      );
      return { sent: 0, failed: devices.length };
    }
  }

  /**
   * Broadcast to all users who have predicted on [fixtureId]. Per-user
   * locale dispatch happens inside `sendToUser`.
   */
  async sendToMatchWatchers(
    fixtureId: number,
    kind: NotifKind,
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
      const r = await this.sendToUser(p.userId, kind, data);
      sent += r.sent;
      failed += r.failed;
    }
    return { sent, failed };
  }

  async registerDevice(
    userId: string,
    fcmToken: string,
    platform: 'ANDROID' | 'IOS',
    locale?: string,
  ) {
    const normalised = pickLocale(locale);
    return this.prisma.userDevice.upsert({
      where: { userId_fcmToken: { userId, fcmToken } },
      create: { userId, fcmToken, platform, locale: normalised },
      update: { platform, locale: normalised },
    });
  }

  async unregisterDevice(userId: string, fcmToken: string) {
    await this.prisma.userDevice.deleteMany({
      where: { userId, fcmToken },
    });
  }

  // ── Group 2: question-lifecycle pushes (spec §9.2) ────────────────────────
  //
  // All three methods are fire-and-forget from the caller's POV — failures
  // are logged but never thrown, so a bad push can't abort scoring or
  // question-open transactions. Per §9.5, each recipient is gated by
  // `tryIncrementQuestionQuota` so no user gets more than 3 question-event
  // pushes per match (Stage 5 adds per-group opt-outs).

  /** Broadcast "new question" to every user who has predicted on [fixtureId]. */
  async pushNewQuestion(fixtureId: number, question: PushableQuestion): Promise<void> {
    try {
      const seconds = Math.max(
        0,
        Math.floor((question.closesAt.getTime() - Date.now()) / 1000),
      );
      const kind: NotifKind = {
        type: 'new_question',
        text: question.text,
        seconds,
        reward: question.rewardCoins,
      };
      const data = this.questionData('new_question', fixtureId, question, {
        seconds: String(seconds),
        rewardCoins: String(question.rewardCoins),
      });

      const watchers = await this.prisma.prediction.findMany({
        where: { question: { fixtureId } },
        select: { userId: true },
        distinct: ['userId'],
      });

      await this.sendFanOutWithQuota(
        watchers.map((w) => w.userId),
        fixtureId,
        kind,
        data,
      );
    } catch (e) {
      this.logger.error(
        `pushNewQuestion failed fixture=${fixtureId}: ${(e as Error).message}`,
      );
    }
  }

  /** Targeted push: one user, the result of one of their predictions. */
  async pushPredictionResult(
    userId: string,
    question: { id: string; text: string; fixtureId: number },
    isCorrect: boolean,
    coinsDelta: number,
    dailyTotal: number,
  ): Promise<void> {
    try {
      const kind: NotifKind = isCorrect
        ? { type: 'correct', text: question.text, coins: coinsDelta, dailyTotal }
        : { type: 'wrong', text: question.text, coins: coinsDelta };
      const data = this.questionData(
        isCorrect ? 'correct' : 'wrong',
        question.fixtureId,
        { id: question.id, text: question.text },
        { coins: String(coinsDelta), dailyTotal: String(dailyTotal) },
      );

      const gate = await tryIncrementQuestionQuota(
        this.redis,
        userId,
        question.fixtureId,
      );
      if (!gate.allowed) {
        this.logger.log(
          `push blocked (quota) user=${userId} fixture=${question.fixtureId} n=${gate.current}`,
        );
        return;
      }
      await this.sendToUser(userId, kind, data);
    } catch (e) {
      this.logger.error(
        `pushPredictionResult failed user=${userId} q=${question.id}: ${(e as Error).message}`,
      );
    }
  }

  /** Fan-out "time's up" to users who watched the fixture but skipped this question. */
  async pushQuestionTimeout(
    fixtureId: number,
    question: PushableQuestion,
  ): Promise<void> {
    try {
      const kind: NotifKind = { type: 'timeout', text: question.text };
      const data = this.questionData('timeout', fixtureId, question);

      // Users who had >=1 prediction on this fixture but NONE on this question.
      const users = await this.prisma.user.findMany({
        where: {
          predictions: { some: { question: { fixtureId } } },
          NOT: { predictions: { some: { questionId: question.id } } },
        },
        select: { id: true },
      });

      await this.sendFanOutWithQuota(
        users.map((u) => u.id),
        fixtureId,
        kind,
        data,
      );
    } catch (e) {
      this.logger.error(
        `pushQuestionTimeout failed fixture=${fixtureId}: ${(e as Error).message}`,
      );
    }
  }

  /** Shared fan-out with per-(user,fixture) quota gate. Skipped users are logged. */
  private async sendFanOutWithQuota(
    userIds: string[],
    fixtureId: number,
    kind: NotifKind,
    data: Record<string, string>,
  ): Promise<void> {
    for (const userId of userIds) {
      const gate = await tryIncrementQuestionQuota(this.redis, userId, fixtureId);
      if (!gate.allowed) {
        this.logger.log(
          `push blocked (quota) user=${userId} fixture=${fixtureId} n=${gate.current}`,
        );
        continue;
      }
      await this.sendToUser(userId, kind, data);
    }
  }

  /** Build the `data` payload shared by every question-event push. All values
   *  must be strings per the FCM HTTP v1 spec. */
  private questionData(
    type: 'new_question' | 'correct' | 'wrong' | 'timeout',
    fixtureId: number,
    question: { id: string; text: string },
    extra: Record<string, string> = {},
  ): Record<string, string> {
    return {
      type,
      route: '/predict',
      fixtureId: String(fixtureId),
      questionId: question.id,
      questionText: question.text,
      ...extra,
    };
  }

  private render(kind: NotifKind, locale: Locale): NotifText {
    switch (kind.type) {
      case 'new_question':
        return newQuestionText(locale, kind.text, kind.seconds, kind.reward);
      case 'correct':
        return correctText(locale, kind.text, kind.coins, kind.dailyTotal);
      case 'wrong':
        return wrongText(locale, kind.text, kind.coins);
      case 'timeout':
        return timeoutText(locale, kind.text);
      case 'rank_milestone':
        return rankMilestoneText(locale, kind.position);
      case 'achievement':
        return achievementText(locale, kind.name, kind.rewardXp);
      case 'level_up':
        return levelUpText(locale, kind.level, titleForLevel(kind.level, locale));
      case 'streak_milestone':
        return streakMilestoneText(locale, kind.days);
      case 'raw':
        return { title: kind.title, body: kind.body };
    }
  }

  // ── Group 3 + 4: leaderboard + engagement pushes (spec §9.3–§9.4) ─────────
  //
  // Each method respects the global daily cap (10/user/day, spec §9.5)
  // but bypasses the per-match question quota — these events can fire
  // outside a match context. Fire-and-forget from the caller.

  /** "You entered the Top N" — fires when user hits rank 1/10/50/100 on a match board. */
  async pushRankMilestone(
    userId: string,
    fixtureId: number,
    position: number,
  ): Promise<void> {
    try {
      if (!(await this.withinDailyCap(userId))) return;
      await this.sendToUser(
        userId,
        { type: 'rank_milestone', position },
        {
          type: 'rank_milestone',
          route: '/leaderboard',
          fixtureId: String(fixtureId),
          position: String(position),
        },
      );
    } catch (e) {
      this.logger.error(
        `pushRankMilestone failed user=${userId} pos=${position}: ${(e as Error).message}`,
      );
    }
  }

  /** Achievement badge unlocked. */
  async pushAchievement(
    userId: string,
    name: string,
    rewardXp: number,
  ): Promise<void> {
    try {
      if (!(await this.withinDailyCap(userId))) return;
      await this.sendToUser(
        userId,
        { type: 'achievement', name, rewardXp },
        {
          type: 'achievement',
          route: '/profile',
          achievementName: name,
          rewardXp: String(rewardXp),
        },
      );
    } catch (e) {
      this.logger.error(
        `pushAchievement failed user=${userId} name=${name}: ${(e as Error).message}`,
      );
    }
  }

  /** Level-up notification. Title is resolved per-locale inside [render]. */
  async pushLevelUp(userId: string, level: number): Promise<void> {
    try {
      if (!(await this.withinDailyCap(userId))) return;
      await this.sendToUser(
        userId,
        { type: 'level_up', level },
        {
          type: 'level_up',
          route: '/profile',
          level: String(level),
        },
      );
    } catch (e) {
      this.logger.error(
        `pushLevelUp failed user=${userId} level=${level}: ${(e as Error).message}`,
      );
    }
  }

  /** Streak-day milestone (7 / 30 / 100). */
  async pushStreakMilestone(userId: string, days: number): Promise<void> {
    try {
      if (!(await this.withinDailyCap(userId))) return;
      await this.sendToUser(
        userId,
        { type: 'streak_milestone', days },
        {
          type: 'streak_milestone',
          route: '/profile',
          days: String(days),
        },
      );
    } catch (e) {
      this.logger.error(
        `pushStreakMilestone failed user=${userId} days=${days}: ${(e as Error).message}`,
      );
    }
  }

  /** Gate for all Group 3+4 pushes — 10/user/day cap per spec §9.5. */
  private async withinDailyCap(userId: string): Promise<boolean> {
    const gate = await tryIncrementDailyQuota(this.redis, userId);
    if (!gate.allowed) {
      this.logger.log(
        `push blocked (daily cap) user=${userId} n=${gate.current}`,
      );
    }
    return gate.allowed;
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
