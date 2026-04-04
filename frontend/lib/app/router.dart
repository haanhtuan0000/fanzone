import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/screens/welcome_screen.dart';
import '../features/auth/screens/login_screen.dart';
import '../features/auth/screens/register_screen.dart';
import '../features/auth/screens/onboarding_screen.dart';
import '../features/auth/providers/auth_provider.dart';
import '../core/network/match_socket_service.dart';
import '../features/live/providers/live_provider.dart';
import '../features/live/screens/live_screen.dart';
import '../features/predict/screens/predict_screen.dart';
import '../features/leaderboard/screens/leaderboard_screen.dart';
import '../features/feed/screens/feed_screen.dart';
import '../features/profile/screens/profile_screen.dart';
import '../features/profile/screens/edit_profile_screen.dart';
import '../shared/widgets/bottom_nav_bar.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

/// Listenable that notifies GoRouter when auth state changes
class _AuthNotifierListenable extends ChangeNotifier {
  _AuthNotifierListenable(Ref ref) {
    ref.listen<AuthState>(authStateProvider, (_, __) {
      notifyListeners();
    });
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final authListenable = _AuthNotifierListenable(ref);

  // Start WebSocket service when authenticated
  ref.listen<AuthState>(authStateProvider, (prev, next) {
    if (next.isAuthenticated && !(prev?.isAuthenticated ?? false)) {
      ref.read(matchSocketServiceProvider).start();
      // Reload live matches when auth confirmed
      ref.invalidate(liveStateProvider);
    }
    if (!next.isAuthenticated && (prev?.isAuthenticated ?? false)) {
      ref.read(matchSocketServiceProvider).stop();
    }
  });

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/welcome',
    refreshListenable: authListenable,
    redirect: (context, state) {
      final authState = ref.read(authStateProvider);
      final isAuth = authState.isAuthenticated;
      final isOnboarded = authState.isOnboarded;
      final loc = state.matchedLocation;
      final isAuthRoute = loc == '/welcome' || loc == '/login' || loc == '/register';
      final isOnboarding = loc == '/onboarding';

      if (!isAuth && !isAuthRoute && !isOnboarding) return '/welcome';
      if (isAuth && !isOnboarded && !isOnboarding) return '/onboarding';
      if (isAuth && isOnboarded && (isAuthRoute || isOnboarding)) return '/live';
      return null;
    },
    routes: [
      GoRoute(
        path: '/welcome',
        builder: (context, state) => const WelcomeScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: '/profile/edit',
        builder: (context, state) => const EditProfileScreen(),
      ),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) => ScaffoldWithNav(child: child),
        routes: [
          GoRoute(
            path: '/live',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: LiveScreen(),
            ),
          ),
          GoRoute(
            path: '/predict',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: PredictScreen(),
            ),
          ),
          GoRoute(
            path: '/leaderboard',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: LeaderboardScreen(),
            ),
          ),
          GoRoute(
            path: '/feed',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: FeedScreen(),
            ),
          ),
          GoRoute(
            path: '/profile',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: ProfileScreen(),
            ),
          ),
        ],
      ),
    ],
  );
});
