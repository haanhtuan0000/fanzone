import 'package:dio/dio.dart';
import '../../../core/models/match.dart';
import '../../../core/network/api_endpoints.dart';

class MatchService {
  final Dio _dio = Dio(BaseOptions(
    baseUrl: ApiEndpoints.baseUrl,
    connectTimeout: const Duration(seconds: 60),
    receiveTimeout: const Duration(seconds: 60),
  ));

  Future<List<MatchData>> getLiveMatches() async {
    try {
      final response = await _dio.get(ApiEndpoints.liveMatches);
      final data = response.data as List<dynamic>;
      return data.map((json) => MatchData.fromApiFootball(json as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<List<MatchData>> getTodayMatches() async {
    try {
      final response = await _dio.get(ApiEndpoints.todayMatches);
      final data = response.data as List<dynamic>;
      return data.map((json) => MatchData.fromApiFootball(json as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<Map<String, dynamic>?> getMatchDetail(int fixtureId) async {
    try {
      final response = await _dio.get(ApiEndpoints.matchDetail(fixtureId));
      return response.data as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }
}
