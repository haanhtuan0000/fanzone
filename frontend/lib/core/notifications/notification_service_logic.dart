/// Pure decision helpers for NotificationService. Kept free of Flutter and
/// plugin imports so they can be unit-tested without a widget tester, and so
/// the rules are visible in a diff when they change.

enum ScheduleModeDecision { exact, inexact }

/// Pick the AlarmManager scheduling mode based on the result of
/// `AndroidFlutterLocalNotificationsPlugin.requestExactAlarmsPermission()`.
///
/// The platform returns:
///   * `null`  — API < 31 (Android < 12). The permission doesn't exist
///               and exact alarms are simply available.
///   * `true`  — permission granted, can use exact.
///   * `false` — user (or Play-policy) denied; exact alarms would throw.
///
/// Only an explicit `false` forces the inexact fallback. Without this gate
/// the old code always requested exact and relied on try/catch, which
/// silently downgraded every schedule call on Android 14+ devices that
/// deny `SCHEDULE_EXACT_ALARM`.
ScheduleModeDecision pickScheduleMode({required bool? exactAlarmsPermissionGranted}) {
  return exactAlarmsPermissionGranted == false
      ? ScheduleModeDecision.inexact
      : ScheduleModeDecision.exact;
}

/// True only when it's safe to call `zonedSchedule`:
///   * the local timezone has been resolved (so wall-clock time is correct), AND
///   * the reminder instant is strictly in the future.
///
/// The timezone check matters because `flutter_local_notifications` schedules
/// an OS alarm using the zone attached to the `TZDateTime`. If `tz.local`
/// silently fell back to UTC (plugin init threw), the alarm fires at the
/// wrong wall-clock time — 7h off for a UTC+7 user. Refusing to schedule is
/// strictly better than scheduling for the wrong moment: the UI can surface
/// a "could not set reminder" message, a wrong-time alarm cannot undo itself.
bool canSafelyScheduleAt({
  required bool timezoneReady,
  required DateTime reminderTime,
  required DateTime now,
}) {
  if (!timezoneReady) return false;
  return reminderTime.isAfter(now);
}
