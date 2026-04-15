import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fanzone/features/auth/providers/auth_provider.dart';

/// These tests pin the exact invariants that were broken by the bug where
/// the Live screen showed "coin is lost" and spent minutes loading:
///
///   1. `fetchCoins()` used to collapse every error to `0`, and the caller
///      used `if (c > 0)` to discard zeros. Together they made a flaky
///      `/profile/me` indistinguishable from an empty wallet — and also
///      prevented a real zero balance from ever being rendered.
///   2. The Live screen re-ran the fetch on every rebuild while coins were
///      still 0, saturating the network and starving other calls.
///
/// The tests below are deliberately small and requirement-driven — they
/// exercise the behaviour a user depends on, not the shape of the code.
void main() {
  group('applyFetchedCoins', () {
    test('writes a non-zero server balance over a stale zero (initial load)', () {
      // User has 0 locally (app just started, coins unknown). Server says 120.
      // We must adopt the server value — this is the normal happy path.
      expect(applyFetchedCoins(0, 120), 120);
    });

    test('writes zero when the server authoritatively reports zero balance', () {
      // User had 50 coins, spent them all in predictions, server now says 0.
      // The UI MUST reflect that. The old `if (c > 0)` guard failed this
      // case and kept showing 50 — a lie to the user.
      expect(applyFetchedCoins(50, 0), 0);
    });

    test('preserves the last-known balance when the fetch fails (null)', () {
      // Network hiccup / timeout / 401 during refresh. fetchCoins returns
      // null. We must NOT overwrite a good balance with 0 — doing so is
      // exactly what the user experienced as "coin is lost".
      expect(applyFetchedCoins(50, null), 50);
      expect(applyFetchedCoins(0, null), 0); // unknown stays unknown, not forced
    });

    test('is a pure function of its inputs (no hidden state between calls)', () {
      // Multiple outcomes in a row must be independent; no bleed-through
      // from one call to the next. This guards against anyone turning the
      // helper into something stateful later.
      expect(applyFetchedCoins(10, 20), 20);
      expect(applyFetchedCoins(10, null), 10);
      expect(applyFetchedCoins(10, 0), 0);
      expect(applyFetchedCoins(10, 20), 20);
    });
  });

  group('coinsFetchAttemptedProvider one-shot guard', () {
    test('default state is false so the first screen mount can fetch', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      expect(container.read(coinsFetchAttemptedProvider), isFalse);
    });

    test(
      'once set, the guard stays true across rebuilds — simulating that the '
      'Live screen will not spawn a second in-flight fetch until reset',
      () async {
        // This is the exact contract the Live screen relies on: flip the flag
        // SYNCHRONOUSLY before awaiting fetchCoins, so any rebuild during the
        // in-flight request sees `true` and skips. We count how many times
        // the "fetch" runs when the guarded pattern is applied repeatedly.
        final container = ProviderContainer();
        addTearDown(container.dispose);

        var fetchCallCount = 0;
        Future<int?> fakeFetch() async {
          fetchCallCount += 1;
          // Simulate a slow server so rebuilds happen while we're awaiting.
          await Future<void>.delayed(const Duration(milliseconds: 5));
          return 42;
        }

        // The guarded pattern that lives in live_screen.dart:
        Future<void> runGuarded() async {
          if (container.read(coinsFetchAttemptedProvider)) return;
          container.read(coinsFetchAttemptedProvider.notifier).state = true;
          final fetched = await fakeFetch();
          container.read(userCoinsProvider.notifier).state =
              applyFetchedCoins(container.read(userCoinsProvider), fetched);
        }

        // Simulate ten near-simultaneous rebuilds all calling the guarded
        // block — as happens when the widget tree rebuilds rapidly on
        // startup (IME events, socket ticks, etc.). Only ONE fetch must
        // actually run.
        await Future.wait(List.generate(10, (_) => runGuarded()));

        expect(fetchCallCount, 1,
            reason: 'guard must allow exactly one fetch per session');
        expect(container.read(userCoinsProvider), 42,
            reason: 'the single fetch result must be applied');
      },
    );

    test(
      'resetting the guard to false permits a subsequent refresh — this is '
      'the hook used by logout / app-resume to force a fresh fetch',
      () async {
        final container = ProviderContainer();
        addTearDown(container.dispose);

        var fetchCallCount = 0;
        Future<int?> fakeFetch() async {
          fetchCallCount += 1;
          return 7;
        }

        Future<void> runGuarded() async {
          if (container.read(coinsFetchAttemptedProvider)) return;
          container.read(coinsFetchAttemptedProvider.notifier).state = true;
          final fetched = await fakeFetch();
          container.read(userCoinsProvider.notifier).state =
              applyFetchedCoins(container.read(userCoinsProvider), fetched);
        }

        await runGuarded();
        await runGuarded(); // suppressed by guard
        expect(fetchCallCount, 1);

        // Session boundary — e.g. user logged out and back in.
        container.read(coinsFetchAttemptedProvider.notifier).state = false;
        await runGuarded();

        expect(fetchCallCount, 2,
            reason: 'guard release must allow exactly one more fetch');
      },
    );
  });
}
