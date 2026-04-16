import 'package:flutter_test/flutter_test.dart';

import 'package:fanzone/core/models/match.dart';
import 'package:fanzone/features/match_detail/post_kickoff_banner.dart';

/// These tests pin the banner-selection rule that was broken by the bug where
/// fixture 1540481 (Leones Negros vs Celaya) displayed "Match in progress →
/// Watch live" 22 hours after its scheduled kickoff. The match had never
/// started — API-Football still reported status `NS`, elapsed `null` — but
/// the old UI ignored that and keyed off `kickoffTime < now` alone. Each
/// case below asserts the banner kind for a distinct real-world scenario;
/// one of them is the exact bug shape.
void main() {
  // Helper factory keeping tests focused on the inputs that matter.
  MatchData mk({required String status, DateTime? kickoffTime}) => MatchData(
        fixtureId: 1,
        homeTeam: 'Home',
        awayTeam: 'Away',
        status: status,
        kickoffTime: kickoffTime,
      );

  final past22h = DateTime.now().subtract(const Duration(hours: 22));
  final past10min = DateTime.now().subtract(const Duration(minutes: 10));
  final future1h = DateTime.now().add(const Duration(hours: 1));

  group('postKickoffBannerFor — happy path: countdown still running', () {
    test('remaining > 0 → none (hide banner while counting down)', () {
      final m = mk(status: 'NS', kickoffTime: future1h);
      expect(postKickoffBannerFor(m, const Duration(minutes: 30)),
          PostKickoffBannerKind.none);
    });

    test('null match → none', () {
      expect(postKickoffBannerFor(null, Duration.zero),
          PostKickoffBannerKind.none);
    });

    test('null kickoffTime → none (cannot evaluate)', () {
      final m = mk(status: '1H');
      expect(postKickoffBannerFor(m, Duration.zero),
          PostKickoffBannerKind.none);
    });
  });

  group('postKickoffBannerFor — live match is the ONLY case that links to /live', () {
    for (final status in ['1H', '2H', 'HT', 'ET', 'P', 'LIVE']) {
      test('$status + countdown done → liveInProgress', () {
        final m = mk(status: status, kickoffTime: past10min);
        expect(postKickoffBannerFor(m, Duration.zero),
            PostKickoffBannerKind.liveInProgress);
      });
    }
  });

  group('postKickoffBannerFor — finished match must not advertise "watch live"', () {
    for (final status in ['FT', 'AET', 'PEN']) {
      test('$status → finished (neutral banner, no tap to /live)', () {
        final m = mk(status: status, kickoffTime: past10min);
        expect(postKickoffBannerFor(m, Duration.zero),
            PostKickoffBannerKind.finished);
      });
    }
  });

  group('postKickoffBannerFor — bug regression: NS past kickoff ≠ in progress', () {
    test('NS + 22h past kickoff → notYetStarted (the Leones Negros case)', () {
      // Exact shape of the production bug. If someone later short-circuits
      // this function back to "kickoff < now → liveInProgress" the contract
      // breaks and this test fails.
      final m = mk(status: 'NS', kickoffTime: past22h);
      expect(postKickoffBannerFor(m, Duration.zero),
          PostKickoffBannerKind.notYetStarted,
          reason:
              'A NS match past its kickoff means the feed is stale or the '
              'match was postponed — the user must NOT see "Match in progress".');
    });

    for (final status in ['NS', 'TBD', 'PST', 'CANC', 'SUSP']) {
      test('$status + countdown done → notYetStarted', () {
        final m = mk(status: status, kickoffTime: past10min);
        expect(postKickoffBannerFor(m, Duration.zero),
            PostKickoffBannerKind.notYetStarted);
      });
    }
  });
}
