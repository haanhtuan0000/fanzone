import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/question.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../auth/providers/auth_provider.dart';
import '../../live/providers/live_provider.dart';

// Re-export for convenience
export '../../auth/providers/auth_provider.dart' show userCoinsProvider;

class PredictState {
  final Question? activeQuestion;
  final List<Question> upcomingQuestions;
  final String? selectedOptionId;
  final bool isLocked;
  final bool isExpired;
  final bool? lastResult; // true = correct, false = wrong, null = pending
  final int? lastCoinsResult;
  final bool isLoading;
  final String? error;

  const PredictState({
    this.activeQuestion,
    this.upcomingQuestions = const [],
    this.selectedOptionId,
    this.isLocked = false,
    this.isExpired = false,
    this.lastResult,
    this.lastCoinsResult,
    this.isLoading = false,
    this.error,
  });

  PredictState copyWith({
    Question? activeQuestion,
    List<Question>? upcomingQuestions,
    String? selectedOptionId,
    bool? isLocked,
    bool? isExpired,
    bool? lastResult,
    int? lastCoinsResult,
    bool? isLoading,
    String? error,
  }) {
    return PredictState(
      activeQuestion: activeQuestion ?? this.activeQuestion,
      upcomingQuestions: upcomingQuestions ?? this.upcomingQuestions,
      selectedOptionId: selectedOptionId ?? this.selectedOptionId,
      isLocked: isLocked ?? this.isLocked,
      isExpired: isExpired ?? this.isExpired,
      lastResult: lastResult,
      lastCoinsResult: lastCoinsResult,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class PredictNotifier extends StateNotifier<PredictState> {
  final ApiClient _apiClient;
  final void Function(int delta) _onCoinsChanged;

  PredictNotifier(this._apiClient, this._onCoinsChanged) : super(const PredictState());

  Future<void> loadQuestions(int fixtureId) async {
    state = state.copyWith(isLoading: true);
    try {
      final response = await _apiClient.get(
        ApiEndpoints.activeQuestions(fixtureId),
      );
      final data = response.data as Map<String, dynamic>;

      final activeJson = data['active'];
      final upcomingJson = data['upcoming'] as List<dynamic>? ?? [];

      final active = activeJson != null
          ? Question.fromJson(activeJson as Map<String, dynamic>)
          : null;
      final upcoming = upcomingJson
          .map((q) => Question.fromJson(q as Map<String, dynamic>))
          .toList();

      state = PredictState(
        activeQuestion: active,
        upcomingQuestions: upcoming,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setActiveQuestion(Question question, List<Question> upcoming) {
    state = PredictState(
      activeQuestion: question,
      upcomingQuestions: upcoming,
    );
  }

  void expireQuestion() {
    if (state.isExpired) return;
    state = state.copyWith(isExpired: true, isLocked: true);
    // Auto-advance to next question after 3 seconds
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) advanceToNext();
    });
  }

  void selectOption(String optionId) {
    if (state.isLocked || state.isExpired) return;
    state = state.copyWith(
      selectedOptionId: optionId,
    );
  }

  Future<void> confirmPrediction() async {
    if (state.selectedOptionId == null || state.isLocked) return;
    if (state.activeQuestion == null) return;

    state = state.copyWith(isLocked: true);

    try {
      final response = await _apiClient.post(
        ApiEndpoints.submitPrediction,
        data: {
          'questionId': state.activeQuestion!.id,
          'optionId': state.selectedOptionId,
        },
      );

      // Update multipliers from server response
      final data = response.data as Map<String, dynamic>;
      final prediction = data['prediction'] as Map<String, dynamic>?;
      final updatedOptions = data['updatedOptions'] as List<dynamic>?;
      if (updatedOptions != null) {
        final pcts = <String, int>{};
        for (final opt in updatedOptions) {
          pcts[opt['id'] as String] = opt['fanPct'] as int;
        }
        updateFanDistribution(pcts);
      }

      // Start polling for result
      if (prediction != null && prediction['id'] != null) {
        pollForResult(prediction['id'] as String);
      }
    } catch (e) {
      // If submission fails, unlock so user can retry
      state = state.copyWith(isLocked: false, error: e.toString());
    }
  }

  void updateFanDistribution(Map<String, int> fanPcts) {
    if (state.activeQuestion == null) return;
    final updatedOptions = state.activeQuestion!.options.map((opt) {
      return QuestionOption(
        id: opt.id,
        name: opt.name,
        emoji: opt.emoji,
        info: opt.info,
        multiplier: opt.multiplier,
        fanCount: opt.fanCount,
        fanPct: fanPcts[opt.id] ?? opt.fanPct,
        isCorrect: opt.isCorrect,
      );
    }).toList();

    final updatedQuestion = Question(
      id: state.activeQuestion!.id,
      fixtureId: state.activeQuestion!.fixtureId,
      category: state.activeQuestion!.category,
      text: state.activeQuestion!.text,
      rewardCoins: state.activeQuestion!.rewardCoins,
      status: state.activeQuestion!.status,
      correctOptionId: state.activeQuestion!.correctOptionId,
      opensAt: state.activeQuestion!.opensAt,
      closesAt: state.activeQuestion!.closesAt,
      options: updatedOptions,
    );

    state = state.copyWith(activeQuestion: updatedQuestion);
  }

  void showResult(bool isCorrect, int coinsResult) {
    state = state.copyWith(lastResult: isCorrect, lastCoinsResult: coinsResult);
    _onCoinsChanged(coinsResult);
  }

  /// Poll the server to check if our prediction has been resolved
  Future<void> pollForResult(String predictionId) async {
    // Poll every 3 seconds for up to 5 minutes
    for (var i = 0; i < 100; i++) {
      await Future.delayed(const Duration(seconds: 3));
      if (!mounted) return;

      try {
        final response = await _apiClient.get(
          ApiEndpoints.predictionHistory,
          queryParams: {'page': '1'},
        );
        final history = response.data as List<dynamic>;
        final resolved = history
            .whereType<Map<String, dynamic>>()
            .where((p) => p['id'] == predictionId && p['isCorrect'] != null)
            .firstOrNull;

        if (resolved != null) {
          showResult(
            resolved['isCorrect'] as bool,
            resolved['coinsResult'] as int? ?? 0,
          );
          return;
        }
      } catch (_) {
        // ignore poll errors
      }
    }
  }

  Future<void> advanceToNext() async {
    if (state.activeQuestion != null) {
      // Reload fresh from server to get updated times and statuses
      await loadQuestions(state.activeQuestion!.fixtureId);
    } else if (state.upcomingQuestions.isEmpty) {
      state = const PredictState();
    } else {
      final next = state.upcomingQuestions.first;
      final remaining = state.upcomingQuestions.sublist(1);
      state = PredictState(
        activeQuestion: next,
        upcomingQuestions: remaining,
      );
    }
  }

  void clearResult() {
    state = state.copyWith(lastResult: null, lastCoinsResult: null);
  }
}

final predictStateProvider = StateNotifierProvider<PredictNotifier, PredictState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final notifier = PredictNotifier(apiClient, (delta) {
    ref.read(userCoinsProvider.notifier).state += delta;
  });

  // Auto-load questions when there's a live match
  final liveState = ref.watch(liveStateProvider);
  final activeMatch = liveState.activeMatch;
  if (activeMatch != null && activeMatch.isLive) {
    Future.microtask(() => notifier.loadQuestions(activeMatch.fixtureId));
  }

  return notifier;
});
