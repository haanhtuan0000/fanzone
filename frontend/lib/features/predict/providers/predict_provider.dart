import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/question.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../auth/providers/auth_provider.dart';
import '../../live/providers/live_provider.dart';

// Re-export for convenience
export '../../auth/providers/auth_provider.dart' show userCoinsProvider;

/// Represents a user's answered question with its current state.
class AnsweredQuestion {
  final Question question;
  final String? myPickOptionId;
  final String status; // 'pending' | 'correct' | 'wrong' | 'skip'
  final int? coinsResult;

  const AnsweredQuestion({
    required this.question,
    this.myPickOptionId,
    this.status = 'pending',
    this.coinsResult,
  });
}

class PredictState {
  final Question? activeQuestion;
  final List<AnsweredQuestion> answeredQuestions; // LOCKED + RESOLVED (reverse chronological)
  final List<Question> upcomingQuestions;
  final String? selectedOptionId;
  final bool isLocked;
  final bool isExpired;
  final bool isLoading;
  final String? error;
  final int totalCoinsEarned;
  final int questionNumber; // Which question number in the match (for progress dots)
  final int totalQuestions;

  const PredictState({
    this.activeQuestion,
    this.answeredQuestions = const [],
    this.upcomingQuestions = const [],
    this.selectedOptionId,
    this.isLocked = false,
    this.isExpired = false,
    this.isLoading = false,
    this.error,
    this.totalCoinsEarned = 0,
    this.questionNumber = 0,
    this.totalQuestions = 0,
  });

  PredictState copyWith({
    Question? activeQuestion,
    bool clearActive = false,
    List<AnsweredQuestion>? answeredQuestions,
    List<Question>? upcomingQuestions,
    String? selectedOptionId,
    bool clearSelection = false,
    bool? isLocked,
    bool? isExpired,
    bool? isLoading,
    String? error,
    int? totalCoinsEarned,
    int? questionNumber,
    int? totalQuestions,
  }) {
    return PredictState(
      activeQuestion: clearActive ? null : (activeQuestion ?? this.activeQuestion),
      answeredQuestions: answeredQuestions ?? this.answeredQuestions,
      upcomingQuestions: upcomingQuestions ?? this.upcomingQuestions,
      selectedOptionId: clearSelection ? null : (selectedOptionId ?? this.selectedOptionId),
      isLocked: isLocked ?? this.isLocked,
      isExpired: isExpired ?? this.isExpired,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      totalCoinsEarned: totalCoinsEarned ?? this.totalCoinsEarned,
      questionNumber: questionNumber ?? this.questionNumber,
      totalQuestions: totalQuestions ?? this.totalQuestions,
    );
  }

  /// Progress dot states for the strip
  List<String> get progressDots {
    final dots = <String>[];
    for (final aq in answeredQuestions.reversed) {
      dots.add(aq.status);
    }
    if (activeQuestion != null) {
      dots.add('active');
    }
    for (var i = 0; i < upcomingQuestions.length; i++) {
      dots.add('upcoming');
    }
    return dots;
  }
}

class PredictNotifier extends StateNotifier<PredictState> {
  final ApiClient _apiClient;
  final void Function(int delta) _onCoinsChanged;
  int? _currentFixtureId;

  PredictNotifier(this._apiClient, this._onCoinsChanged) : super(const PredictState());

  Future<void> loadQuestions(int fixtureId) async {
    // Don't overwrite if user submitted and waiting for result
    if (state.isLocked && !state.isExpired && state.selectedOptionId != null) return;

    _currentFixtureId = fixtureId;
    state = state.copyWith(isLoading: true);

    try {
      // Fetch active questions + predictions in parallel
      final responses = await Future.wait([
        _apiClient.get(ApiEndpoints.activeQuestions(fixtureId)),
        _apiClient.get(ApiEndpoints.matchPredictions(fixtureId)),
      ]);

      final questionsData = responses[0].data as Map<String, dynamic>;
      final predictionsData = responses[1].data as List<dynamic>;

      // Parse active question
      final activeJson = questionsData['active'];
      final active = activeJson != null
          ? Question.fromJson(activeJson as Map<String, dynamic>)
          : null;

      // Parse upcoming
      final upcomingJson = questionsData['upcoming'] as List<dynamic>? ?? [];
      final upcoming = upcomingJson
          .map((q) => Question.fromJson(q as Map<String, dynamic>))
          .toList();

      // Parse pending results (LOCKED)
      final pendingJson = questionsData['pendingResults'] as List<dynamic>? ?? [];

      // Parse resolved
      final resolvedJson = questionsData['resolved'] as List<dynamic>? ?? [];

      // Build answered questions list from predictions + question data
      final answered = <AnsweredQuestion>[];

      // Map predictions by questionId for quick lookup
      final predMap = <String, Map<String, dynamic>>{};
      for (final p in predictionsData) {
        final pred = p as Map<String, dynamic>;
        predMap[pred['questionId'] as String] = pred;
      }

      // Add LOCKED (pending result) questions
      for (final pJson in pendingJson) {
        final q = Question.fromJson(pJson as Map<String, dynamic>);
        final pred = predMap[q.id];
        answered.add(AnsweredQuestion(
          question: q,
          myPickOptionId: pred?['optionId'] as String?,
          status: pred != null ? 'pending' : 'skip',
        ));
      }

      // Add RESOLVED questions
      for (final rJson in resolvedJson) {
        final q = Question.fromJson(rJson as Map<String, dynamic>);
        final pred = predMap[q.id];
        if (pred == null) {
          answered.add(AnsweredQuestion(
            question: q,
            status: 'skip',
          ));
        } else {
          final isCorrect = pred['isCorrect'] as bool?;
          answered.add(AnsweredQuestion(
            question: q,
            myPickOptionId: pred['optionId'] as String?,
            status: isCorrect == true ? 'correct' : (isCorrect == false ? 'wrong' : 'pending'),
            coinsResult: pred['coinsResult'] as int?,
          ));
        }
      }

      // Calculate total coins
      int totalCoins = 0;
      for (final aq in answered) {
        if (aq.coinsResult != null) totalCoins += aq.coinsResult!;
      }

      // Keep selection if same question is still active
      final sameQuestion = active != null && active.id == state.activeQuestion?.id;

      state = PredictState(
        activeQuestion: active,
        answeredQuestions: answered,
        upcomingQuestions: upcoming,
        selectedOptionId: sameQuestion ? state.selectedOptionId : null,
        isLocked: sameQuestion ? state.isLocked : false,
        isExpired: sameQuestion ? state.isExpired : false,
        isLoading: false,
        totalCoinsEarned: totalCoins,
        totalQuestions: answered.length + (active != null ? 1 : 0) + upcoming.length,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void expireQuestion() {
    if (state.isExpired) return;
    state = state.copyWith(isExpired: true, isLocked: true);
    // Auto-advance after 3 seconds
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted && _currentFixtureId != null) {
        loadQuestions(_currentFixtureId!);
      }
    });
  }

  void selectOption(String optionId) {
    if (state.isLocked || state.isExpired) return;
    state = state.copyWith(selectedOptionId: optionId);
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
      final updatedOptions = data['updatedOptions'] as List<dynamic>?;
      if (updatedOptions != null) {
        final pcts = <String, int>{};
        for (final opt in updatedOptions) {
          pcts[opt['id'] as String] = opt['fanPct'] as int;
        }
        _updateFanDistribution(pcts);
      }

      // Start polling for result (fallback if WS misses it)
      final prediction = data['prediction'] as Map<String, dynamic>?;
      if (prediction != null && prediction['id'] != null) {
        _pollForResult(prediction['id'] as String);
      }
    } catch (e) {
      state = state.copyWith(isLocked: false, error: e.toString());
    }
  }

  /// Handle a real-time prediction_result from WebSocket
  void onPredictionResult(Map<String, dynamic> data) {
    final questionId = data['questionId'] as String?;
    if (questionId == null) return;

    // Refresh the full state from server to get updated answered cards
    if (_currentFixtureId != null) {
      Future.delayed(const Duration(milliseconds: 500), () {
        if (mounted) loadQuestions(_currentFixtureId!);
      });
    }
  }

  void _updateFanDistribution(Map<String, int> fanPcts) {
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

  Future<void> _pollForResult(String predictionId) async {
    for (var i = 0; i < 60; i++) {
      await Future.delayed(const Duration(seconds: 5));
      if (!mounted) return;

      // Refresh full state
      if (_currentFixtureId != null) {
        await loadQuestions(_currentFixtureId!);
      }
      // Stop if the active question changed (meaning it was resolved)
      if (state.activeQuestion?.id != predictionId) return;
    }
  }
}

final predictStateProvider = StateNotifierProvider<PredictNotifier, PredictState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final notifier = PredictNotifier(apiClient, (delta) {
    ref.read(userCoinsProvider.notifier).state += delta;
  });

  // Load questions when a live match becomes available
  ref.listen<LiveState>(liveStateProvider, (prev, next) {
    final match = next.activeMatch;
    if (match != null && match.isLive) {
      final prevMatchId = prev?.activeMatch?.fixtureId;
      if (prevMatchId != match.fixtureId) {
        notifier.loadQuestions(match.fixtureId);
      }
    }
  }, fireImmediately: true);

  return notifier;
});
