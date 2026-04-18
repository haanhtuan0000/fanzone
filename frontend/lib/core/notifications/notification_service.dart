import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:flutter_timezone/flutter_timezone.dart';

import '../../app/router.dart';
import '../l10n/app_strings.dart';
import 'notification_ids.dart';
import 'notification_service_logic.dart';

class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();

  /// Serialized init: concurrent callers await the same future instead of
  /// racing and double-initializing the plugin. On failure the future is
  /// cleared so a subsequent call can retry.
  static Future<void>? _initFuture;

  /// Tracks whether `tz.local` was successfully set to the device's local
  /// timezone. If this is `false`, `tz.local` defaults to UTC and every
  /// `zonedSchedule` call would fire at the wrong wall-clock time — so we
  /// refuse to schedule. Gated by [canSafelyScheduleAt].
  static bool _timezoneReady = false;

  /// Initialize the notification plugin. Safe to call concurrently; the
  /// first call performs the work, the rest await its completion.
  static Future<void> init() {
    return _initFuture ??= _doInit().catchError((Object e, StackTrace st) {
      debugPrint('[NotificationService] init failed: $e\n$st');
      _initFuture = null; // allow a future caller to retry
      throw e;
    });
  }

  static Future<void> _doInit() async {
    // Initialize timezone database AND set local timezone from device.
    tzdata.initializeTimeZones();
    try {
      final localTz = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(localTz));
      _timezoneReady = true;
    } catch (e, st) {
      // Leave _timezoneReady = false — scheduleMatchReminder will refuse
      // to create an alarm rather than fire it at the wrong wall-clock.
      debugPrint('[NotificationService] timezone init failed, reminders disabled: $e\n$st');
      _timezoneReady = false;
    }

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _plugin.initialize(
      const InitializationSettings(android: androidSettings),
      onDidReceiveNotificationResponse: _onTap,
    );

    // Create the Android notification channel explicitly (required on Android 8+).
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(const AndroidNotificationChannel(
      'match_reminder',
      'Match Reminders',
      description: 'Notifications for upcoming match reminders',
      importance: Importance.high,
    ));
  }

  /// Called by the plugin when the user taps a local notification whose
  /// `payload` contains a `route` key. Uses the shared [rootNavigatorKey]
  /// exposed by `router.dart` so navigation works even when the tap
  /// happens from a terminated-app state (the notification plugin
  /// re-launches the app and then delivers this callback).
  static void _onTap(NotificationResponse response) {
    final raw = response.payload;
    if (raw == null || raw.isEmpty) return;
    String? route;
    try {
      final parsed = jsonDecode(raw);
      if (parsed is Map && parsed['route'] is String) {
        route = parsed['route'] as String;
      }
    } catch (e) {
      debugPrint('[NotificationService] bad payload: $raw');
      return;
    }
    if (route == null) return;
    final ctx = rootNavigatorKey.currentContext;
    if (ctx == null) {
      debugPrint('[NotificationService] tap but no nav context — route=$route');
      return;
    }
    try {
      ctx.go(route);
    } catch (e) {
      debugPrint('[NotificationService] tap nav failed for route=$route: $e');
    }
  }

  /// Schedule a match reminder notification 15 minutes before kickoff.
  /// Returns `true` if scheduled successfully, `false` on any refusal or
  /// failure (permission denied, timezone unknown, reminder already past,
  /// plugin exception — the exact reason is logged via `debugPrint`).
  static Future<bool> scheduleMatchReminder({
    required int fixtureId,
    required String homeTeam,
    required String awayTeam,
    required DateTime kickoffTime,
  }) async {
    return _scheduleOne(
      id: matchReminderId(fixtureId),
      scheduledAt: kickoffTime.subtract(const Duration(minutes: 15)),
      title: AppStrings.current.notifTitle,
      body: AppStrings.current.notifReminder15(homeTeam, awayTeam),
      route: '/match-info/$fixtureId',
    );
  }

  /// Schedule a "match is starting now" notification at exact kickoff time.
  /// Deep-links straight to the Predict tab so the user can start
  /// answering immediately. Used together with [scheduleMatchReminder] —
  /// see [scheduleMatchAlarms] for the one-shot convenience wrapper.
  static Future<bool> scheduleMatchKickoff({
    required int fixtureId,
    required String homeTeam,
    required String awayTeam,
    required DateTime kickoffTime,
  }) async {
    return _scheduleOne(
      id: matchKickoffId(fixtureId),
      scheduledAt: kickoffTime,
      title: AppStrings.current.notifTitle,
      body: AppStrings.current.notifKickoff(homeTeam, awayTeam),
      route: '/predict',
    );
  }

  /// Schedule both the 15-min reminder and the at-kickoff notification.
  /// Returns a record of which alarms were actually scheduled — callers
  /// use this to decide the snackbar text (e.g. if the match is <15 min
  /// away we skip the 15-min reminder but still want the kickoff one).
  static Future<({bool reminder, bool kickoff})> scheduleMatchAlarms({
    required int fixtureId,
    required String homeTeam,
    required String awayTeam,
    required DateTime kickoffTime,
  }) async {
    final decision = alarmsFor(now: DateTime.now(), kickoff: kickoffTime);
    bool reminder = false;
    bool kickoff = false;
    if (decision == AlarmSet.both) {
      reminder = await scheduleMatchReminder(
        fixtureId: fixtureId,
        homeTeam: homeTeam,
        awayTeam: awayTeam,
        kickoffTime: kickoffTime,
      );
    }
    if (decision == AlarmSet.both || decision == AlarmSet.kickoffOnly) {
      kickoff = await scheduleMatchKickoff(
        fixtureId: fixtureId,
        homeTeam: homeTeam,
        awayTeam: awayTeam,
        kickoffTime: kickoffTime,
      );
    }
    return (reminder: reminder, kickoff: kickoff);
  }

  /// Schedule the end-of-match FT summary alarm at `kickoff + 115 min`.
  /// Stage 4 fires a generic body and lets the user tap through to the
  /// FT detail screen for real numbers — accurate numbers at schedule
  /// time would require pre-computing a body we can't trust 2 hours later.
  static Future<bool> scheduleFtSummary({
    required int fixtureId,
    required String homeTeam,
    required String awayTeam,
    required DateTime kickoffTime,
  }) async {
    return _scheduleOne(
      id: ftSummaryId(fixtureId),
      scheduledAt: kickoffTime.add(const Duration(minutes: 115)),
      title: AppStrings.current.notifTitle,
      body: AppStrings.current.notifFtSummary(homeTeam, awayTeam),
      route: '/match/$fixtureId',
    );
  }

  /// Reminder that the user's favourite team kicks off in 2 hours.
  /// Only schedules if `kickoff - now > 2h`; otherwise the alarm would
  /// be in the past and `_scheduleOne` would refuse.
  static Future<bool> scheduleFavoriteTeamReminder({
    required int fixtureId,
    required String team,
    required DateTime kickoffTime,
  }) async {
    return _scheduleOne(
      id: favoriteTeamId(fixtureId),
      scheduledAt: kickoffTime.subtract(const Duration(hours: 2)),
      title: AppStrings.current.notifTitle,
      body: AppStrings.current.notifFavoriteTeamMatch(team),
      route: '/match-info/$fixtureId',
    );
  }

  /// Daily "streak at risk" nudge fired at 23:00 device-local time. The
  /// notification body interpolates the current streak count so a user
  /// with a 12-day streak sees "12" rather than a generic "your streak".
  ///
  /// `fireAt` is computed by the caller (today 23:00, or tomorrow 23:00
  /// if today's 23:00 already passed). A single fixed alarm ID means
  /// re-scheduling overwrites the previous alarm cleanly.
  static Future<bool> scheduleStreakAtRiskDaily({
    required int currentStreak,
    required DateTime fireAt,
  }) async {
    return _scheduleOne(
      id: streakAtRiskId(),
      scheduledAt: fireAt,
      title: AppStrings.current.notifTitle,
      body: AppStrings.current.notifStreakAtRisk(currentStreak),
      route: '/live',
    );
  }

  /// Shared scheduling code used by both reminder + kickoff. Factored out
  /// so payload, channel, and safety-gate logic stay in one place.
  static Future<bool> _scheduleOne({
    required int id,
    required DateTime scheduledAt,
    required String title,
    required String body,
    required String route,
  }) async {
    await init();

    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    bool? exactGranted;
    if (android != null) {
      final granted = await android.requestNotificationsPermission();
      if (granted == false) {
        debugPrint('[NotificationService] POST_NOTIFICATIONS denied for id=$id');
        return false;
      }
      exactGranted = await android.requestExactAlarmsPermission();
    }

    final now = DateTime.now();
    if (!canSafelyScheduleAt(
      timezoneReady: _timezoneReady,
      reminderTime: scheduledAt,
      now: now,
    )) {
      debugPrint(
        '[NotificationService] refusing to schedule id=$id — '
        'timezoneReady=$_timezoneReady at=$scheduledAt now=$now',
      );
      return false;
    }

    final scheduledDate = tz.TZDateTime.from(scheduledAt, tz.local);
    final decision = pickScheduleMode(exactAlarmsPermissionGranted: exactGranted);
    final mode = switch (decision) {
      ScheduleModeDecision.exact => AndroidScheduleMode.exactAllowWhileIdle,
      ScheduleModeDecision.inexact => AndroidScheduleMode.inexactAllowWhileIdle,
    };

    try {
      await _plugin.zonedSchedule(
        id,
        title,
        body,
        scheduledDate,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'match_reminder',
            'Match Reminders',
            channelDescription: 'Notifications for upcoming match reminders',
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
        androidScheduleMode: mode,
        payload: jsonEncode({'route': route}),
      );
      return true;
    } catch (e, st) {
      debugPrint(
        '[NotificationService] zonedSchedule failed id=$id mode=$mode: $e\n$st',
      );
      return false;
    }
  }

  /// Cancel both alarms (15-min reminder + at-kickoff) for a given match.
  static Future<void> cancelMatchAlarms(int fixtureId) async {
    await init();
    await _plugin.cancel(matchReminderId(fixtureId));
    await _plugin.cancel(matchKickoffId(fixtureId));
  }

  /// Back-compat wrapper — older call sites still call `cancelMatchReminder`.
  static Future<void> cancelMatchReminder(int fixtureId) => cancelMatchAlarms(fixtureId);

  /// Returns `true` if EITHER alarm (15-min reminder OR at-kickoff) is
  /// currently scheduled with the OS. Used by the reminder button on
  /// Screen 7 to hydrate its toggle state after a remount.
  static Future<bool> isReminderScheduled(int fixtureId) async {
    await init();
    final pending = await _plugin.pendingNotificationRequests();
    final reminder = matchReminderId(fixtureId);
    final kickoff = matchKickoffId(fixtureId);
    return pending.any((r) => r.id == reminder || r.id == kickoff);
  }

  /// Show a notification immediately (for testing).
  static Future<void> showTestNotification() async {
    await init();
    await _plugin.show(
      999999,
      'FanZone Test',
      'Notifications are working!',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'match_reminder',
          'Match Reminders',
          channelDescription: 'Notifications for upcoming match reminders',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
    );
  }
}
