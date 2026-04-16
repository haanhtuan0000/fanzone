import 'package:flutter_test/flutter_test.dart';

import 'package:fanzone/core/models/match.dart';
import 'package:fanzone/features/live/stale_match_filter.dart';

/// Guards the rule that the Live/Today list must drop fixtures that are past
/// their scheduled kickoff but still reported as NS/TBD by the feed (which
/// happens when API-Football silently stops updating a postponed match —
/// fixture 1540481 Leones Negros vs Celaya is the original example, listed
/// for 22h after its scheduled kickoff). The invariants below are the ones
/// that matter: live matches are never filtered, finished matches stay put,
/// and the grace window is generous enough to cover a full match + ET.
void main() {
  final kickoffBase = DateTime.utc(2026, 4, 16, 6, 0);

  MatchData mk({
    required String status,
    required DateTime? kickoffTime,
  }) =>
      MatchData(
        fixtureId: 1,
        homeTeam: 'Home',
        awayTeam: 'Away',
        status: status,
        kickoffTime: kickoffTime,
      );

  group('isStaleScheduledMatch — filters genuinely stale schedule entries', () {
    test('NS + kickoff 4h ago → stale (drop)', () {
      final m = mk(status: 'NS', kickoffTime: kickoffBase);
      final now = kickoffBase.add(const Duration(hours: 4));
      expect(isStaleScheduledMatch(m, now: now), isTrue,
          reason: 'Past the 3h grace — feed has gone stale.');
    });

    test('TBD + kickoff 4h ago → stale (drop)', () {
      final m = mk(status: 'TBD', kickoffTime: kickoffBase);
      final now = kickoffBase.add(const Duration(hours: 4));
      expect(isStaleScheduledMatch(m, now: now), isTrue);
    });
  });

  group('isStaleScheduledMatch — within the grace window, keep showing', () {
    test('NS + kickoff 2h ago → fresh (within 3h buffer)', () {
      // A real match + stoppage can easily run 2h of wall-clock before
      // reaching FT. Filtering at 2h would hide live-but-slow-feed matches.
      final m = mk(status: 'NS', kickoffTime: kickoffBase);
      final now = kickoffBase.add(const Duration(hours: 2));
      expect(isStaleScheduledMatch(m, now: now), isFalse);
    });

    test('NS + kickoff in the future → fresh', () {
      final m = mk(status: 'NS', kickoffTime: kickoffBase);
      final now = kickoffBase.subtract(const Duration(hours: 1));
      expect(isStaleScheduledMatch(m, now: now), isFalse);
    });
  });

  group('isStaleScheduledMatch — live matches are NEVER filtered', () {
    // This invariant stops clock-drift edge cases from hiding a match the
    // user is actively watching. If someone later widens the status gate
    // to include 1H/2H, these tests break — loudly.
    for (final status in ['1H', '2H', 'HT', 'ET', 'P', 'LIVE']) {
      test('$status + kickoff 4h ago → keep', () {
        final m = mk(status: status, kickoffTime: kickoffBase);
        final now = kickoffBase.add(const Duration(hours: 4));
        expect(isStaleScheduledMatch(m, now: now), isFalse,
            reason: 'A live match must stay visible regardless of wall-clock.');
      });
    }
  });

  group('isStaleScheduledMatch — finished matches stay in today\'s list', () {
    for (final status in ['FT', 'AET', 'PEN']) {
      test('$status + kickoff 4h ago → keep (filtering here is not the right layer)', () {
        final m = mk(status: status, kickoffTime: kickoffBase);
        final now = kickoffBase.add(const Duration(hours: 4));
        expect(isStaleScheduledMatch(m, now: now), isFalse);
      });
    }
  });

  test('null kickoffTime → keep (cannot evaluate staleness)', () {
    final m = mk(status: 'NS', kickoffTime: null);
    expect(isStaleScheduledMatch(m, now: kickoffBase), isFalse);
  });
}
