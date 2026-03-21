import 'package:dio/dio.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/models/leaderboard_entry.dart';

class LeaderboardService {
  final Dio _dio = Dio(BaseOptions(baseUrl: ApiEndpoints.baseUrl));

  Future<List<LeaderboardEntry>> getLeaderboard(String scope, {String? id}) async {
    final response = await _dio.get(
      ApiEndpoints.leaderboard,
      queryParameters: {'scope': scope, if (id != null) 'id': id},
    );
    final data = response.data as List<dynamic>;
    return data.map((json) => LeaderboardEntry.fromJson(json as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> getMyRank(String scope, {String? id}) async {
    final response = await _dio.get(
      ApiEndpoints.leaderboardMe,
      queryParameters: {'scope': scope, if (id != null) 'id': id},
    );
    return response.data as Map<String, dynamic>;
  }
}
