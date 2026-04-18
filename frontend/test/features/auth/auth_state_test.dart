import 'package:flutter_test/flutter_test.dart';
import 'package:fanzone/features/auth/providers/auth_provider.dart';

/// Regression pin for the auth-logout redirect bug observed on 2026-04-18:
/// three call sites used `state = const AuthState()` to mean "logged out",
/// but the default `isInitializing: true` made the router short-circuit
/// its redirect (router waits for initialization to finish). Result: the
/// user stayed stuck on the protected screen in a 401 retry loop instead
/// of being sent back to /welcome.
///
/// The shape of this test is intentionally minimal — the real bug was a
/// 1-character default, so a pin on that default is the tightest
/// regression coverage possible.
void main() {
  group('AuthState defaults', () {
    test(
        'default AuthState() is logged-out and NOT initializing '
        '(otherwise _forceLogout leaves user stuck behind router guard)', () {
      const s = AuthState();
      expect(s.isInitializing, isFalse);
      expect(s.isAuthenticated, isFalse);
      expect(s.isOnboarded, isFalse);
      expect(s.isLoading, isFalse);
      expect(s.user, isNull);
      expect(s.error, isNull);
    });

    test('AuthState(isInitializing: true) is still opt-in for boot window', () {
      const s = AuthState(isInitializing: true);
      expect(s.isInitializing, isTrue);
    });
  });
}
