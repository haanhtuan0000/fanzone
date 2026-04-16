import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:flutter_timezone/flutter_timezone.dart';

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
    await _plugin.initialize(const InitializationSettings(android: androidSettings));

    // Create the Android notification channel explicitly (required on Android 8+).
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(const AndroidNotificationChannel(
      'match_reminder',
      'Match Reminders',
      description: 'Notifications for upcoming match reminders',
      importance: Importance.high,
    ));
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
    await init();

    // Permission requests (Android). Permission state determines whether
    // we can schedule at all and which AlarmManager mode we're allowed to use.
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    bool? exactGranted;
    if (android != null) {
      final granted = await android.requestNotificationsPermission();
      if (granted == false) {
        debugPrint('[NotificationService] POST_NOTIFICATIONS denied for fixture=$fixtureId');
        return false;
      }
      // Returns null on API < 31, true/false on API >= 31.
      exactGranted = await android.requestExactAlarmsPermission();
    }

    final reminderTime = kickoffTime.subtract(const Duration(minutes: 15));
    final now = DateTime.now();
    if (!canSafelyScheduleAt(
      timezoneReady: _timezoneReady,
      reminderTime: reminderTime,
      now: now,
    )) {
      debugPrint(
        '[NotificationService] refusing to schedule fixture=$fixtureId — '
        'timezoneReady=$_timezoneReady reminderTime=$reminderTime now=$now',
      );
      return false;
    }

    final scheduledDate = tz.TZDateTime.from(reminderTime, tz.local);
    final decision = pickScheduleMode(exactAlarmsPermissionGranted: exactGranted);
    final mode = switch (decision) {
      ScheduleModeDecision.exact => AndroidScheduleMode.exactAllowWhileIdle,
      ScheduleModeDecision.inexact => AndroidScheduleMode.inexactAllowWhileIdle,
    };

    try {
      await _plugin.zonedSchedule(
        fixtureId, // notification ID — unique per match
        'FanZone',
        '$homeTeam vs $awayTeam starts in 15 minutes! Predict now \u2192',
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
      );
      return true;
    } catch (e, st) {
      debugPrint(
        '[NotificationService] zonedSchedule failed fixture=$fixtureId mode=$mode: $e\n$st',
      );
      return false;
    }
  }

  /// Cancel a scheduled match reminder.
  static Future<void> cancelMatchReminder(int fixtureId) async {
    await init();
    await _plugin.cancel(fixtureId);
  }

  /// Returns `true` if a match reminder for [fixtureId] is currently scheduled
  /// with the OS. The notification plugin stores pending alarms across process
  /// restarts, so this is the real source of truth — use it when a screen
  /// needs to render the right button state after being re-opened (otherwise
  /// a transient `bool` defaults to `false` and the UI forgets the reminder).
  static Future<bool> isReminderScheduled(int fixtureId) async {
    await init();
    final pending = await _plugin.pendingNotificationRequests();
    return pending.any((r) => r.id == fixtureId);
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
