import 'package:flutter_test/flutter_test.dart';

import 'package:fanzone/core/notifications/notification_service_logic.dart';

/// These tests pin two rules the Android notification path depends on:
///
///   1. Only an EXPLICIT exact-alarm denial should force the inexact
///      fallback. Pre-Android-12 (`null`) and grant (`true`) must both
///      produce exact. Without this, every schedule on Android 14+ that
///      answers `null` would silently downgrade to inexact (drift up to
///      ~10 min per doze cycle).
///   2. We refuse to schedule when the device timezone is unknown. A
///      silent UTC fallback would otherwise fire alarms at wrong
///      wall-clock times (7h off for a UTC+7 user). Refusing surfaces
///      the failure to the UI; wrong-time alarms can't undo themselves.
void main() {
  group('pickScheduleMode — only explicit denial falls back to inexact', () {
    test('true (granted) → exact', () {
      expect(
        pickScheduleMode(exactAlarmsPermissionGranted: true),
        ScheduleModeDecision.exact,
      );
    });

    test('null (API < 31 — permission does not exist) → exact', () {
      // Regression pin: older Android returns null because the permission
      // is not part of its model; we must NOT treat that as "denied".
      expect(
        pickScheduleMode(exactAlarmsPermissionGranted: null),
        ScheduleModeDecision.exact,
      );
    });

    test('false (user denied) → inexact — avoids throw-and-fall-back noise', () {
      expect(
        pickScheduleMode(exactAlarmsPermissionGranted: false),
        ScheduleModeDecision.inexact,
      );
    });
  });

  group('canSafelyScheduleAt — refuses rather than firing at wrong time', () {
    final now = DateTime.utc(2026, 4, 16, 10, 0, 0);
    final futureReminder = now.add(const Duration(hours: 1));
    final pastReminder = now.subtract(const Duration(hours: 1));

    test('timezoneReady=false → false even for a valid future instant '
        '(regression pin for silent UTC fallback)', () {
      // This is the exact bug the change addresses: if the plugin's
      // timezone lookup threw and _timezoneReady stayed false, the old
      // code would happily schedule and fire at the wrong wall-clock.
      expect(
        canSafelyScheduleAt(
          timezoneReady: false,
          reminderTime: futureReminder,
          now: now,
        ),
        isFalse,
      );
    });

    test('timezoneReady=true + reminder in the past → false', () {
      expect(
        canSafelyScheduleAt(
          timezoneReady: true,
          reminderTime: pastReminder,
          now: now,
        ),
        isFalse,
      );
    });

    test('timezoneReady=true + reminder == now → false (not strictly after)', () {
      expect(
        canSafelyScheduleAt(
          timezoneReady: true,
          reminderTime: now,
          now: now,
        ),
        isFalse,
      );
    });

    test('timezoneReady=true + reminder in the future → true (happy path)', () {
      expect(
        canSafelyScheduleAt(
          timezoneReady: true,
          reminderTime: futureReminder,
          now: now,
        ),
        isTrue,
      );
    });
  });
}
