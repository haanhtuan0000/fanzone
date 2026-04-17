import 'package:flutter_test/flutter_test.dart';
import 'package:fanzone/core/notifications/notification_ids.dart';

void main() {
  group('notification_ids', () {
    test('matchReminderId is the fixtureId verbatim', () {
      expect(matchReminderId(0), 0);
      expect(matchReminderId(1), 1);
      expect(matchReminderId(1234567), 1234567);
    });

    test('matchKickoffId is offset by 100M and fits int32', () {
      expect(matchKickoffId(0), 100000000);
      expect(matchKickoffId(1), 100000001);
      // Max plausible fixtureId (~30M) still fits in int32 (~2.14B).
      expect(matchKickoffId(30000000), 130000000);
    });

    test('reminder and kickoff IDs are disjoint for every fixture', () {
      // Reminder max is ~30M; kickoff min is 100M. No overlap possible.
      for (final id in [0, 1, 100, 99999999, 30000000]) {
        expect(matchReminderId(id) == matchKickoffId(id), isFalse,
            reason: 'fixtureId=$id collided');
      }
    });

    test('IDs are always non-negative (notifications require int32 ≥ 0 semantically)', () {
      expect(matchReminderId(0), greaterThanOrEqualTo(0));
      expect(matchKickoffId(0), greaterThanOrEqualTo(0));
    });
  });
}
