import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:flutter_timezone/flutter_timezone.dart';

class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  /// Initialize the notification plugin. Call once on app start.
  static Future<void> init() async {
    if (_initialized) return;

    // Initialize timezone database AND set local timezone from device
    tzdata.initializeTimeZones();
    try {
      final localTz = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(localTz));
    } catch (_) {
      // Fallback: stays at UTC default — better than crash
    }

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidSettings);

    await _plugin.initialize(initSettings);

    // Create the Android notification channel explicitly (required on Android 8+)
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) {
      await android.createNotificationChannel(const AndroidNotificationChannel(
        'match_reminder',
        'Match Reminders',
        description: 'Notifications for upcoming match reminders',
        importance: Importance.high,
      ));
    }

    _initialized = true;
  }

  /// Schedule a match reminder notification 15 minutes before kickoff.
  /// Returns true if scheduled successfully.
  static Future<bool> scheduleMatchReminder({
    required int fixtureId,
    required String homeTeam,
    required String awayTeam,
    required DateTime kickoffTime,
  }) async {
    await init();

    // Request notification permission (Android 13+)
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) {
      final granted = await android.requestNotificationsPermission();
      if (granted == false) return false;

      // Request exact alarm permission (Android 12+)
      await android.requestExactAlarmsPermission();
    }

    final reminderTime = kickoffTime.subtract(const Duration(minutes: 15));

    // Don't schedule if reminder time is in the past
    if (reminderTime.isBefore(DateTime.now())) return false;

    final scheduledDate = tz.TZDateTime.from(reminderTime, tz.local);

    try {
      await _plugin.zonedSchedule(
        fixtureId, // Use fixtureId as notification ID (unique per match)
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
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      );
      return true;
    } catch (e) {
      // Fallback to inexact if exact alarms are denied
      try {
        await _plugin.zonedSchedule(
          fixtureId,
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
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        );
        return true;
      } catch (_) {
        return false;
      }
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
