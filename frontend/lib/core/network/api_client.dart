import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../storage/secure_storage.dart';
import 'api_endpoints.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  final storage = ref.watch(secureStorageProvider);
  return ApiClient(storage);
});

class ApiClient {
  late final Dio _dio;
  final SecureStorageService _storage;
  String? _cachedToken;

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
          // Try full refresh
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

  /// Update the cached token (called after login/refresh from outside)
  void setCachedToken(String token) {
    _cachedToken = token;
  }

  Future<bool> _refreshToken() async {
    try {
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken == null) return false;

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
      // Only clear tokens on definitive server rejection with valid response
      // NOT on timeouts, connection errors, or server unavailable
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) {
        _cachedToken = null;
        await _storage.clearTokens();
      }
      return false;
    } catch (_) {
      // Network error, timeout, etc. — don't clear tokens
      return false;
    }
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
