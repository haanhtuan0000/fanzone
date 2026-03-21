import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/user.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/storage/secure_storage.dart';
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

  AuthNotifier(this._authService, this._storage) : super(const AuthState()) {
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final token = await _storage.getAccessToken();
    final onboarded = await _storage.isOnboarded();
    if (token != null) {
      state = state.copyWith(isAuthenticated: true, isOnboarded: onboarded);
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
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final result = await _authService.login(email, password);
      await _storage.saveTokens(
        accessToken: result['accessToken'],
        refreshToken: result['refreshToken'],
      );
      final user = User.fromJson(result['user']);
      final onboarded = await _storage.isOnboarded();
      state = state.copyWith(
        user: user,
        isAuthenticated: true,
        isOnboarded: onboarded,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> completeOnboarding() async {
    await _storage.setOnboarded();
    state = state.copyWith(isOnboarded: true);
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
