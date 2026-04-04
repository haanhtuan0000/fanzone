import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart' as gsi;
import '../../../core/models/user.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../core/l10n/app_strings.dart';
import '../services/auth_service.dart';

class AuthState {
  final User? user;
  final bool isAuthenticated;
  final bool isOnboarded;
  final bool isLoading;
  final String? error;

  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isOnboarded = false,
    this.isLoading = false,
    this.error,
  });

  AuthState copyWith({
    User? user,
    bool? isAuthenticated,
    bool? isOnboarded,
    bool? isLoading,
    String? error,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isOnboarded: isOnboarded ?? this.isOnboarded,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthService _authService;
  final SecureStorageService _storage;
  bool _googleInitialized = false;

  AuthNotifier(this._authService, this._storage) : super(const AuthState()) {
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

    if (token == null) return;

    // Optimistic: if token exists, assume authenticated immediately
    state = state.copyWith(isAuthenticated: true, isOnboarded: onboarded);

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
      await _storage.saveTokens(
        accessToken: response.data['accessToken'],
        refreshToken: response.data['refreshToken'],
      );
    } catch (_) {
      // Don't log out if server is unreachable — keep optimistic auth
      // Only the ApiClient 401 interceptor should trigger logout
    }
  }

  Future<int> fetchCoins() async {
    final token = await _storage.getAccessToken();
    if (token == null) return 0;
    try {
      final response = await Dio().get(
        '${ApiEndpoints.baseUrl}${ApiEndpoints.profileMe}',
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );
      final data = response.data as Map<String, dynamic>;
      return data['coins'] as int? ?? 0;
    } catch (_) {
      return 0;
    }
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
    await _storage.clearTokens();
    state = const AuthState();
  }
}

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService();
});

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final authService = AuthService();
  final storage = ref.watch(secureStorageProvider);
  return AuthNotifier(authService, storage);
});

/// Standalone coins state — completely independent from authState/router
final userCoinsProvider = StateProvider<int>((ref) => 0);
