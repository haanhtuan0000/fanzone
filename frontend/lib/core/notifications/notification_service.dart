import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest_all.dart' as tz;

class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  /// Initialize the notification plugin. Call once on app start.
  static Future<void> init() async {
    if (_initialized) return;

    tz.initializeTimeZones();

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidSettings);

    await _plugin.initialize(initSettings);
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

    // Request permission (Android 13+)
    final android = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) {
      final granted = await android.requestNotificationsPermission();
      if (granted != true) return false;
    }

    final reminderTime = kickoffTime.subtract(const Duration(minutes: 15));

    // Don't schedule if reminder time is in the past
    if (reminderTime.isBefore(DateTime.now())) return false;

    final scheduledDate = tz.TZDateTime.from(reminderTime, tz.local);

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
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      matchDateTimeComponents: null,
    );

    return true;
  }

  /// Cancel a scheduled match reminder.
  static Future<void> cancelMatchReminder(int fixtureId) async {
    await init();
    await _plugin.cancel(fixtureId);
  }
}
