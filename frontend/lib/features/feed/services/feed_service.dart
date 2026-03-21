import 'package:dio/dio.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/models/feed_event.dart';

class FeedService {
  final Dio _dio = Dio(BaseOptions(baseUrl: ApiEndpoints.baseUrl));

  Future<List<FeedEvent>> getFeed(int fixtureId, {int limit = 50}) async {
    final response = await _dio.get(
      ApiEndpoints.feed(fixtureId),
      queryParameters: {'limit': limit},
    );
    final data = response.data as List<dynamic>;
    return data.map((json) => FeedEvent.fromJson(json as Map<String, dynamic>)).toList();
  }
}
