import 'package:dio/dio.dart';
import '../../../core/network/api_endpoints.dart';

class AuthService {
  final Dio _dio = Dio(BaseOptions(
    baseUrl: ApiEndpoints.baseUrl,
    headers: {'Content-Type': 'application/json'},
  ));

  Future<Map<String, dynamic>> register(
    String email,
    String password, {
    String? displayName,
  }) async {
    final response = await _dio.post(
      ApiEndpoints.register,
      data: {
        'email': email,
        'password': password,
        if (displayName != null) 'displayName': displayName,
      },
    );
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await _dio.post(
      ApiEndpoints.login,
      data: {'email': email, 'password': password},
    );
    return response.data as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> refreshToken(String refreshToken) async {
    final response = await _dio.post(
      ApiEndpoints.refresh,
      data: {'refreshToken': refreshToken},
    );
    return response.data as Map<String, dynamic>;
  }
}
