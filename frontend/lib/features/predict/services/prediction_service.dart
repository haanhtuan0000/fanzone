import 'package:dio/dio.dart';
import '../../../core/network/api_endpoints.dart';

class PredictionService {
  final Dio _dio = Dio(BaseOptions(baseUrl: ApiEndpoints.baseUrl));

  Future<Map<String, dynamic>> submitPrediction(String questionId, String optionId) async {
    final response = await _dio.post(
      ApiEndpoints.submitPrediction,
      data: {'questionId': questionId, 'optionId': optionId},
    );
    return response.data as Map<String, dynamic>;
  }

  Future<List<dynamic>> getHistory({int page = 1}) async {
    final response = await _dio.get(
      ApiEndpoints.predictionHistory,
      queryParameters: {'page': page},
    );
    return response.data as List<dynamic>;
  }
}
