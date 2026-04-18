import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart' as gsi;
import '../../../core/models/user.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/notifications/fcm_service.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/l10n/app_strings.dart';
import '../services/auth_service.dart';

class AuthState {
  final User? user;
  final bool isAuthenticated;
  final bool isOnboarded;
  final bool isLoading;
  final bool isInitializing; // true until _checkAuth completes
  final String? error;

  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isOnboarded = false,
    this.isLoading = false,
    this.isInitializing = false,
    this.error,
  });

  AuthState copyWith({
    User? user,
    bool? isAuthenticated,
    bool? isOnboarded,
    bool? isLoading,
    bool? isInitializing,
    String? error,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isOnboarded: isOnboarded ?? this.isOnboarded,
      isLoading: isLoading ?? this.isLoading,
      isInitializing: isInitializing ?? this.isInitializing,
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthService _authService;
  final SecureStorageService _storage;
  final ApiClient? _apiClient;
  bool _googleInitialized = false;

  AuthNotifier(this._authService, this._storage, [this._apiClient])
      : super(const AuthState(isInitializing: true)) {
    // Wire up force-logout: when ApiClient detects permanent 401, logout here
    _apiClient?.setForceLogoutCallback(() {
      if (mounted) {
        state = const AuthState();
      }
    });
    _warmUpServer();
    _checkAuth();
  }

  /// Ping server to wake it up from Render free tier sleep
  void _warmUpServer() {
    Dio().get('${ApiEndpoints.baseUrl}/matches/live').ignore();
    // Pre-initialize Google Sign-In
    _initGoogle();
  }

  Future<void> _initGoogle() async {
    try {
      if (!_googleInitialized) {
        await gsi.GoogleSignIn.instance.initialize(
          clientId: '400880210585-ics6f7g2odg693q7veqj4087uve1oaeq.apps.googleusercontent.com',
          serverClientId: '400880210585-rkbgtue22ttng1oo19ov9op3shm1a5es.apps.googleusercontent.com',
        );
        _googleInitialized = true;
      }
    } catch (_) {}
  }

  Future<void> _checkAuth() async {
    // Read token + onboarded in parallel
    final results = await Future.wait([
      _storage.getAccessToken(),
      _storage.isOnboarded(),
      _storage.getRefreshToken(),
    ]);
    final token = results[0] as String?;
    final onboarded = results[1] as bool;
    final refreshToken = results[2] as String?;

    if (token == null) {
      // No stored token — done initializing, stay unauthenticated
      state = state.copyWith(isInitializing: false);
      return;
    }

    // Token exists — authenticate and finish initializing
    state = state.copyWith(isAuthenticated: true, isOnboarded: onboarded, isInitializing: false);
    _registerDeviceInBackground();

    // Try to refresh the token proactively in background (don't block UI)
    if (refreshToken != null) {
      _refreshInBackground(token, refreshToken);
    }
  }

  Future<void> _refreshInBackground(String token, String refreshToken) async {
    try {
      final response = await Dio().post(
        '${ApiEndpoints.baseUrl}${ApiEndpoints.refresh}',
        data: {'refreshToken': refreshToken},
        options: Options(
          receiveTimeout: const Duration(seconds: 15),
          sendTimeout: const Duration(seconds: 15),
        ),
      );
      final newAccessToken = response.data['accessToken'] as String;
      final newRefreshToken = response.data['refreshToken'] as String;
      await _storage.saveTokens(
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      );
      // Update ApiClient cached token so it uses the fresh one
      _apiClient?.setCachedToken(newAccessToken);
    } on DioException catch (e) {
      // Definitive rejection (refresh token expired) → force logout
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) {
        await _storage.clearTokens();
        if (mounted) state = const AuthState();
      }
      // Network errors, timeouts → keep optimistic auth, ApiClient will retry
    } catch (_) {
      // Unexpected error — keep optimistic auth
    }
  }

  /// Fetches the current user's coin balance from the server.
  ///
  /// Returns:
  ///   * a non-negative integer — the server's authoritative balance
  ///     (including `0` — the user genuinely has zero coins);
  ///   * `null` — the call could not be completed (no token, permanent auth
  ///     failure, or all retries exhausted). The caller MUST treat `null` as
  ///     "unknown" and preserve any previously-known balance, never overwrite
  ///     it with zero.
  ///
  /// Retries transient failures up to 3 times with a 2s / 4s backoff — the
  /// Render free-tier backend can take ~30s to wake from sleep, which made
  /// the previous single-shot call time out silently on cold app launches.
  /// Permanent auth failures (401/403) short-circuit with `null` immediately.
  Future<int?> fetchCoins() async {
    final token = await _storage.getAccessToken();
    if (token == null) return null;
    const maxAttempts = 3;
    final dio = Dio(BaseOptions(
      connectTimeout: const Duration(seconds: 8),
      receiveTimeout: const Duration(seconds: 8),
    ));
    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        final response = await dio.get(
          '${ApiEndpoints.baseUrl}${ApiEndpoints.profileMe}',
          options: Options(headers: {'Authorization': 'Bearer $token'}),
        );
        final data = response.data as Map<String, dynamic>;
        return data['coins'] as int?;
      } on DioException catch (e) {
        // Don't retry on permanent auth failures — retry won't help.
        final status = e.response?.statusCode;
        if (status == 401 || status == 403) return null;
        if (attempt == maxAttempts - 1) return null;
      } catch (_) {
        if (attempt == maxAttempts - 1) return null;
      }
      // Backoff: 2s, 4s between attempts (total wait ≈ 6s).
      await Future.delayed(Duration(seconds: 2 * (attempt + 1)));
    }
    return null;
  }

  Future<void> register(String email, String password, {String? displayName}) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _authService.register(email, password, displayName: displayName);
      await _storage.saveTokens(
        accessToken: result['accessToken'],
        refreshToken: result['refreshToken'],
      );
      final user = User.fromJson(result['user']);
      state = state.copyWith(
        user: user,
        isAuthenticated: true,
        isOnboarded: false,
        isLoading: false,
      );
      _registerDeviceInBackground();
    } catch (e) {
      final _s = AppStrings.current;
      String error = _s.errorConnection;
      final msg = e.toString();
      if (msg.contains('409') || msg.contains('Conflict')) {
        error = _s.errorEmailTaken;
      } else if (msg.contains('400')) {
        error = _s.errorInvalidInfo;
      } else if (msg.contains('connection') || msg.contains('SocketException')) {
        error = _s.errorConnection;
      }
      state = state.copyWith(isLoading: false, error: error);
    }
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _authService.login(email, password);
      final user = User.fromJson(result['user']);
      // Save tokens + onboarded flag in parallel
      await Future.wait([
        _storage.saveTokens(
          accessToken: result['accessToken'],
          refreshToken: result['refreshToken'],
        ),
        _storage.setOnboarded(),
      ]);
      state = state.copyWith(
        user: user,
        isAuthenticated: true,
        isOnboarded: true,
        isLoading: false,
      );
      _registerDeviceInBackground();
    } catch (e) {
      final _s = AppStrings.current;
      String error = _s.errorConnection;
      final msg = e.toString();
      if (msg.contains('401') || msg.contains('Unauthorized')) {
        error = _s.errorInvalidCredentials;
      } else if (msg.contains('connection') || msg.contains('SocketException')) {
        error = _s.errorConnection;
      }
      state = state.copyWith(isLoading: false, error: error);
    }
  }

  Future<void> loginWithGoogle() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _initGoogle();
      final account = await gsi.GoogleSignIn.instance.authenticate();

      final auth = account.authentication;
      final idToken = auth.idToken;
      if (idToken == null) {
        throw Exception('No ID token received. Check Google Cloud OAuth setup.');
      }

      final loginResult = await _authService.googleLogin(idToken);
      final user = User.fromJson(loginResult['user']);
      // Save tokens + onboarded flag in parallel
      await Future.wait([
        _storage.saveTokens(
          accessToken: loginResult['accessToken'],
          refreshToken: loginResult['refreshToken'],
        ),
        _storage.setOnboarded(),
      ]);
      state = state.copyWith(
        user: user,
        isAuthenticated: true,
        isOnboarded: true,
        isLoading: false,
      );
      _registerDeviceInBackground();
    } catch (e, st) {
      // Show actual error for debugging — remove in production
      print('Google Sign-In error: $e');
      print('Stack trace: $st');
      state = state.copyWith(isLoading: false, error: 'Google: ${e.runtimeType}: $e');
    }
  }

  Future<void> completeOnboarding() async {
    await _storage.setOnboarded();
    state = state.copyWith(isOnboarded: true);
  }

  void clearError() {
    if (state.error != null) {
      state = state.copyWith(error: null);
    }
  }

  Future<void> logout() async {
    await FcmService.instance.unregisterRefreshSubscription();
    await _storage.clearTokens();
    state = const AuthState();
  }

  /// Ask for push permission and register this device's FCM token with the
  /// backend so the server can deliver push notifications. Non-blocking —
  /// failures are logged; the user can still use the app without push.
  void _registerDeviceInBackground() {
    final api = _apiClient;
    if (api == null) return;
    () async {
      try {
        await FcmService.instance.requestPermission();
        await FcmService.instance.registerWithBackend(api);
      } catch (_) {
        // Already logged inside FcmService; swallow here so auth flow
        // never breaks because of a push-registration hiccup.
      }
    }();
  }
}

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService();
});

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final authService = AuthService();
  final storage = ref.watch(secureStorageProvider);
  final apiClient = ref.watch(apiClientProvider);
  return AuthNotifier(authService, storage, apiClient);
});

/// Standalone coins state — completely independent from authState/router
final userCoinsProvider = StateProvider<int>((ref) => 0);

/// Per-session flag: has the Live screen attempted its one-shot coin refresh?
/// Exposed so tests (and the screen) can reset it on logout/app restart.
final coinsFetchAttemptedProvider = StateProvider<bool>((ref) => false);

/// Reconciles a freshly-fetched coin balance with the current local value.
///
/// * `fetched == null` → fetch failed or balance is unknown; keep [current].
/// * `fetched != null` → authoritative server value; write it (including `0`).
///
/// Pulled out as a pure function so the rule can be verified in isolation —
/// see `test/features/auth/coins_helpers_test.dart`. The two invariants it
/// encodes are the exact ones the previous `if (c > 0)` guard violated:
///   1. A real balance of zero MUST be displayed as zero.
///   2. A network error MUST NOT silently overwrite a known balance with zero.
int applyFetchedCoins(int current, int? fetched) => fetched ?? current;
