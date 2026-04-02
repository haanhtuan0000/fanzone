import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/question.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../auth/providers/auth_provider.dart';
import '../../live/providers/live_provider.dart';
import '../../profile/providers/profile_provider.dart';

// Re-export for convenience
export '../../auth/providers/auth_provider.dart' show userCoinsProvider;

/// Represents a user's answered question with its current state.
class AnsweredQuestion {
  final Question question;
  final String? myPickOptionId;
  final String status; // 'pending' | 'correct' | 'wrong' | 'skip' | 'voided'
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
  final int totalQuestions;
  final bool showFirstPredictionBonus;

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
    this.totalQuestions = 0,
    this.showFirstPredictionBonus = false,
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
    int? totalQuestions,
    bool? showFirstPredictionBonus,
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
      totalQuestions: totalQuestions ?? this.totalQuestions,
      showFirstPredictionBonus: showFirstPredictionBonus ?? false,
    );
  }

  /// Progress dot states for the strip.
  /// Only shows dots for questions the user has already seen (active + answered).
  /// No dots for upcoming/future questions.
  List<String> get progressDots {
    final dots = <String>[];
    for (final aq in answeredQuestions.reversed) {
      // Only show dots for questions the user interacted with (predicted or got result)
      if (aq.status == 'skip' && aq.myPickOptionId == null) continue;
      dots.add(aq.status);
    }
    if (activeQuestion != null) {
      dots.add('active');
    }
    return dots;
  }
}

class PredictNotifier extends StateNotifier<PredictState> {
  final ApiClient _apiClient;
  final void Function(int delta) _onCoinsChanged;
  int? _currentFixtureId;

  bool _loading = false;
  Timer? _pollTimer;

  PredictNotifier(this._apiClient, this._onCoinsChanged) : super(const PredictState());

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> loadQuestions(int fixtureId) async {
    // Debounce: skip if already loading
    if (_loading) return;
    _loading = true;

    // Show loading spinner when switching matches or on first load
    final isMatchChange = _currentFixtureId != null && _currentFixtureId != fixtureId;
    _currentFixtureId = fixtureId;

    if (isMatchChange || (state.activeQuestion == null && state.answeredQuestions.isEmpty)) {
      state = state.copyWith(isLoading: true);
    }

    try {
      // Fetch active questions + predictions in parallel (independent error handling)
      final results = await Future.wait([
        _apiClient.get(ApiEndpoints.activeQuestions(fixtureId)).then((r) => r.data).catchError((_) => null),
        _apiClient.get(ApiEndpoints.matchPredictions(fixtureId)).then((r) => r.data).catchError((_) => null),
      ]);

      final questionsData = (results[0] as Map<String, dynamic>?) ?? {'active': null, 'upcoming': [], 'pendingResults': [], 'resolved': []};
      final predictionsData = (results[1] as List<dynamic>?) ?? [];

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

      // Add RESOLVED + VOIDED questions
      for (final rJson in resolvedJson) {
        final q = Question.fromJson(rJson as Map<String, dynamic>);
        final pred = predMap[q.id];
        if (q.status == 'VOIDED') {
          answered.add(AnsweredQuestion(
            question: q,
            myPickOptionId: pred?['optionId'] as String?,
            status: 'voided',
            coinsResult: 0,
          ));
        } else if (pred == null) {
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

      // Calculate total coins and notify if changed
      int totalCoins = 0;
      for (final aq in answered) {
        if (aq.coinsResult != null) totalCoins += aq.coinsResult!;
      }
      final coinsDelta = totalCoins - state.totalCoinsEarned;
      if (coinsDelta != 0) {
        _onCoinsChanged(coinsDelta);
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

      // Start/stop poll timer: if no active and no upcoming, poll for new questions
      if (active != null || upcoming.isNotEmpty) {
        _pollTimer?.cancel();
        _pollTimer = null;
      } else if (_pollTimer == null && answered.isNotEmpty) {
        _startIdlePoll();
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    } finally {
      _loading = false;
    }
  }

  void expireQuestion() {
    if (state.isExpired) return;
    state = state.copyWith(isExpired: true, isLocked: true);
    // Immediately load next question — no TIME UP delay
    if (mounted && _currentFixtureId != null) {
      loadQuestions(_currentFixtureId!);
    }
  }

  /// Poll every 30s when idle (no active/upcoming questions) to detect new questions from next phase.
  void _startIdlePoll() {
    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted || _currentFixtureId == null) {
        _pollTimer?.cancel();
        _pollTimer = null;
        return;
      }
      loadQuestions(_currentFixtureId!);
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

      final data = response.data as Map<String, dynamic>;

      // Update multipliers from server response (do this BEFORE bonus flag)
      final updatedOptions = data['updatedOptions'] as List<dynamic>?;
      if (updatedOptions != null) {
        final pcts = <String, int>{};
        for (final opt in updatedOptions) {
          pcts[opt['id'] as String] = opt['fanPct'] as int;
        }
        _updateFanDistribution(pcts);
      }

      // Check for first prediction bonus — set AFTER other state changes
      // so the flag isn't immediately reset by _updateFanDistribution's copyWith
      final isFirst = data['isFirstPrediction'] as bool? ?? false;
      if (isFirst) {
        state = state.copyWith(showFirstPredictionBonus: true);
        _onCoinsChanged(20); // Reflect the bonus in the coin display
      }

      // Start polling for result (fallback if WS misses it)
      _pollForResult(state.activeQuestion!.id);
    } catch (e) {
      state = state.copyWith(isLocked: false, error: _parseError(e));
    }
  }

  String _parseError(dynamic e) {
    if (e is DioException && e.response?.data != null) {
      final data = e.response!.data;
      if (data is Map && data['message'] != null) {
        return data['message'] as String;
      }
    }
    final msg = e.toString();
    if (msg.contains('Not enough coins')) return 'Not enough coins';
    if (msg.contains('not open')) return 'Question is no longer open';
    if (msg.contains('expired')) return 'Question expired';
    if (msg.contains('Already predicted')) return 'Already predicted on this question';
    return 'Something went wrong. Try again.';
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

  Future<void> _pollForResult(String questionId) async {
    for (var i = 0; i < 60; i++) {
      await Future.delayed(const Duration(seconds: 5));
      if (!mounted) return;

      // Refresh full state
      if (_currentFixtureId != null) {
        await loadQuestions(_currentFixtureId!);
      }
      // Stop if the active question changed (meaning it was resolved/locked)
      if (state.activeQuestion?.id != questionId) return;
    }
  }
}

final predictStateProvider = StateNotifierProvider<PredictNotifier, PredictState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final notifier = PredictNotifier(apiClient, (delta) {
    ref.read(userCoinsProvider.notifier).state += delta;
    // Refresh profile when coins change (prediction result came in)
    ref.invalidate(profileStateProvider);
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
