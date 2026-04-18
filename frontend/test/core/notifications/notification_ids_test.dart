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

    test('Stage 4 IDs stay in their reserved 200M / 300M / fixed ranges', () {
      // Reserved ranges claimed by Stage 4 must be disjoint from Stage 2.
      expect(ftSummaryId(0), 200000000);
      expect(ftSummaryId(1), 200000001);
      expect(favoriteTeamId(0), 300000000);
      expect(favoriteTeamId(1), 300000001);
      expect(streakAtRiskId(), 999999001);
    });

    test('All four fixture-scoped ID families are disjoint for the same fixture', () {
      // Picking a mid-range fixtureId to cover the addition-with-offset cases.
      final f = 1234567;
      final ids = {
        matchReminderId(f),
        matchKickoffId(f),
        ftSummaryId(f),
        favoriteTeamId(f),
        streakAtRiskId(),
      };
      // If any two families produced the same ID, the Set would collapse.
      expect(ids.length, 5);
    });
  });
}
