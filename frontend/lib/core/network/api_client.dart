import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../storage/secure_storage.dart';
import 'api_endpoints.dart';

/// Callback to notify auth layer when tokens are permanently invalid.
typedef LogoutCallback = void Function();

final apiClientProvider = Provider<ApiClient>((ref) {
  final storage = ref.watch(secureStorageProvider);
  return ApiClient(storage);
});

class ApiClient {
  late final Dio _dio;
  final SecureStorageService _storage;
  String? _cachedToken;
  LogoutCallback? _onForceLogout;

  /// Lock to prevent concurrent refresh attempts
  Completer<bool>? _refreshLock;

  ApiClient(this._storage) {
    _dio = Dio(BaseOptions(
      baseUrl: ApiEndpoints.baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = _cachedToken ?? await _storage.getAccessToken();
        if (token != null) {
          _cachedToken = token;
          options.headers['Authorization'] = 'Bearer $token';
        }
        // Send device language so server returns translated questions
        try {
          final locale = WidgetsBinding.instance.platformDispatcher.locale;
          options.headers['Accept-Language'] = locale.languageCode;
        } catch (_) {}
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // First check if storage has a newer token (from background refresh)
          final storedToken = await _storage.getAccessToken();
          if (storedToken != null && storedToken != _cachedToken) {
            _cachedToken = storedToken;
            error.requestOptions.headers['Authorization'] = 'Bearer $_cachedToken';
            try {
              final response = await _dio.fetch(error.requestOptions);
              handler.resolve(response);
              return;
            } on DioException catch (retryError) {
              if (retryError.response?.statusCode != 401) {
                handler.next(retryError);
                return;
              }
              // Still 401 with new token — fall through to refresh
            }
          }
          // Try full refresh (with lock to prevent concurrent attempts)
          final refreshed = await _refreshToken();
          if (refreshed) {
            error.requestOptions.headers['Authorization'] = 'Bearer $_cachedToken';
            final response = await _dio.fetch(error.requestOptions);
            handler.resolve(response);
            return;
          }
        }
        handler.next(error);
      },
    ));
  }

  /// Set callback for when refresh permanently fails (triggers logout in auth provider)
  void setForceLogoutCallback(LogoutCallback callback) {
    _onForceLogout = callback;
  }

  /// Update the cached token (called after login/refresh from outside)
  void setCachedToken(String token) {
    _cachedToken = token;
  }

  Future<bool> _refreshToken() async {
    // If another refresh is in progress, wait for it
    if (_refreshLock != null) {
      return _refreshLock!.future;
    }

    _refreshLock = Completer<bool>();
    try {
      final result = await _doRefresh();
      _refreshLock!.complete(result);
      return result;
    } catch (_) {
      _refreshLock!.complete(false);
      return false;
    } finally {
      _refreshLock = null;
    }
  }

  Future<bool> _doRefresh() async {
    try {
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken == null) {
        _forceLogout();
        return false;
      }

      // Retry once on timeout/network error
      Response? response;
      for (var attempt = 0; attempt < 2; attempt++) {
        try {
          response = await Dio().post(
            '${ApiEndpoints.baseUrl}${ApiEndpoints.refresh}',
            data: {'refreshToken': refreshToken},
            options: Options(
              receiveTimeout: const Duration(seconds: 15),
              sendTimeout: const Duration(seconds: 15),
            ),
          );
          break; // Success
        } on DioException catch (e) {
          // Only retry on timeout/network errors, not on 401/403
          if (e.response != null || attempt == 1) rethrow;
        }
      }
      if (response == null) return false;

      final data = response.data;
      _cachedToken = data['accessToken'];
      await _storage.saveTokens(
        accessToken: data['accessToken'],
        refreshToken: data['refreshToken'],
      );
      return true;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) {
        // Refresh token is permanently invalid — force logout
        _forceLogout();
      }
      return false;
    } catch (_) {
      // Network error, timeout — don't clear tokens, don't logout
      return false;
    }
  }

  void _forceLogout() {
    _cachedToken = null;
    _storage.clearTokens();
    _onForceLogout?.call();
  }

  Future<Response> get(String path, {Map<String, dynamic>? queryParams}) {
    return _dio.get(path, queryParameters: queryParams);
  }

  Future<Response> post(String path, {dynamic data}) {
    return _dio.post(path, data: data);
  }

  Future<Response> put(String path, {dynamic data}) {
    return _dio.put(path, data: data);
  }

  Future<Response> delete(String path) {
    return _dio.delete(path);
  }
}
