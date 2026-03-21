import 'package:dio/dio.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/models/user.dart';
import '../../../core/models/achievement.dart';

class ProfileService {
  final Dio _dio = Dio(BaseOptions(baseUrl: ApiEndpoints.baseUrl));

  Future<User> getMyProfile() async {
    final response = await _dio.get(ApiEndpoints.profileMe);
    return User.fromJson(response.data as Map<String, dynamic>);
  }

  Future<List<Achievement>> getAchievements() async {
    final response = await _dio.get(ApiEndpoints.achievements);
    final data = response.data as List<dynamic>;
    return data.map((json) => Achievement.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<List<dynamic>> getActivity({int page = 1}) async {
    final response = await _dio.get(
      ApiEndpoints.activity,
      queryParameters: {'page': page},
    );
    return response.data as List<dynamic>;
  }
}
