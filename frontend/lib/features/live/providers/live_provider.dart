import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/match.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../services/match_service.dart';
import '../stale_match_filter.dart';

/// Per-fixture prediction summary from GET /predictions/today-summary.
class PredictionSummary {
  final int fixtureId;
  final int correct;
  final int wrong;
  final int coinsEarned;

  const PredictionSummary({
    required this.fixtureId,
    this.correct = 0,
    this.wrong = 0,
    this.coinsEarned = 0,
  });

  factory PredictionSummary.fromJson(Map<String, dynamic> json) {
    return PredictionSummary(
      fixtureId: json['fixtureId'] as int,
      correct: json['correct'] as int? ?? 0,
      wrong: json['wrong'] as int? ?? 0,
      coinsEarned: json['coinsEarned'] as int? ?? 0,
    );
  }
}

class LiveState {
  final List<MatchData> matches;
  final MatchData? activeMatch;
  final bool isLoading;
  final String? error;
  final bool liveExpanded;
  final bool answeredExpanded;
  final bool notStartedExpanded;
  final bool isRefreshing;
  /// Per-fixture prediction summary for FT matches the user answered.
  final Map<int, PredictionSummary> predictionSummaries;

  static const _finishedStatuses = {'FT', 'AET', 'PEN'};

  const LiveState({
    this.matches = const [],
    this.activeMatch,
    this.isLoading = false,
    this.error,
    this.liveExpanded = false,
    this.answeredExpanded = false,
    this.notStartedExpanded = false,
    this.isRefreshing = false,
    this.predictionSummaries = const {},
  });

  // ── Category 1: LIVE matches ──
  List<MatchData> get liveMatches => matches.where((m) => m.isLive).toList();

  // ── Category 2: FT matches the user answered (has prediction summary) ──
  List<MatchData> get answeredMatches => matches
      .where((m) => _finishedStatuses.contains(m.status) && predictionSummaries.containsKey(m.fixtureId))
      .toList();

  // ── Category 3: Not started ──
  List<MatchData> get notStartedMatches => matches
      .where((m) => m.status == 'NS' || m.status == 'TBD')
      .toList();

  // Display limits per design v4.0
  List<MatchData> get displayedLiveMatches {
    final live = liveMatches;
    return liveExpanded ? live : live.take(4).toList();
  }

  List<MatchData> get displayedAnsweredMatches {
    final answered = answeredMatches;
    return answeredExpanded ? answered : answered.take(2).toList();
  }

  List<MatchData> get displayedNotStartedMatches {
    final ns = notStartedMatches;
    return notStartedExpanded ? ns : ns.take(2).toList();
  }

  // Legacy getter — kept for backwards compatibility with existing callers
  List<MatchData> get upcomingMatches => notStartedMatches;
  List<MatchData> get displayedTodayMatches => displayedNotStartedMatches;
  bool get todayExpanded => notStartedExpanded;

  LiveState copyWith({
    List<MatchData>? matches,
    MatchData? activeMatch,
    bool? isLoading,
    String? error,
    bool? liveExpanded,
    bool? answeredExpanded,
    bool? notStartedExpanded,
    bool? isRefreshing,
    Map<int, PredictionSummary>? predictionSummaries,
  }) {
    return LiveState(
      matches: matches ?? this.matches,
      activeMatch: activeMatch ?? this.activeMatch,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      liveExpanded: liveExpanded ?? this.liveExpanded,
      answeredExpanded: answeredExpanded ?? this.answeredExpanded,
      notStartedExpanded: notStartedExpanded ?? this.notStartedExpanded,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      predictionSummaries: predictionSummaries ?? this.predictionSummaries,
    );
  }
}

class LiveNotifier extends StateNotifier<LiveState> {
  final MatchService _matchService;
  final ApiClient? _apiClient;

  LiveNotifier(this._matchService, [this._apiClient]) : super(const LiveState(isLoading: true)) {
    _loadMatches();
  }

  Future<void> _loadMatches() async {
    try {
      final results = await Future.wait([
        _matchService.getLiveMatches(),
        _matchService.getTodayMatches(),
      ]);
      if (!mounted) return;
      final matches = results[0];
      final todayMatches = results[1];

      final allMatches = [...matches, ...todayMatches];
      // Remove duplicates by fixtureId, AND drop fixtures that are past their
      // scheduled kickoff but still reported as NS/TBD by the feed — those
      // are postponed/cancelled matches whose upstream status never updated
      // (see stale_match_filter.dart). Without this, the Today list keeps
      // showing them for hours and tapping leads to a misleading
      // "Match in progress" banner.
      final now = DateTime.now();
      final seen = <int>{};
      final uniqueMatches = allMatches
          .where((m) => seen.add(m.fixtureId))
          .where((m) => !isStaleScheduledMatch(m, now: now))
          .toList();

      // Preserve user's match selection if it still exists in the list
      final currentId = state.activeMatch?.fixtureId;
      final preserved = currentId != null
          ? uniqueMatches.where((m) => m.fixtureId == currentId).firstOrNull
          : null;
      final activeMatch = preserved ?? (matches.isNotEmpty ? matches.first : null);

      state = state.copyWith(
        matches: uniqueMatches,
        activeMatch: activeMatch,
        isLoading: false,
        isRefreshing: false,
      );

      // Fetch stats for the active match
      if (activeMatch != null && _apiClient != null) {
        _fetchStatsForMatch(activeMatch.fixtureId);
      }

      // Fetch prediction summary for the "Answered" category (async, non-blocking)
      _fetchPredictionSummary();
    } catch (e) {
      state = state.copyWith(isLoading: false, isRefreshing: false, error: e.toString());
    }
  }

  Future<void> _fetchStatsForMatch(int fixtureId) async {
    if (_apiClient == null) return;
    try {
      final response = await _apiClient!.get(ApiEndpoints.matchDetail(fixtureId));
      if (!mounted) return;
      final data = response.data as Map<String, dynamic>;
      if (data['statistics'] != null && data['statistics'] is List && (data['statistics'] as List).isNotEmpty) {
        final stats = MatchData.parseApiFootballStats(data['statistics'] as List);
        updateMatchStats(fixtureId, stats);
      }
    } catch (_) {
      // Stats not available yet — WebSocket will deliver them later
    }
  }

  /// Refresh matches without clearing existing state (no flash).
  /// Shows isRefreshing indicator while loading.
  Future<void> refresh() async {
    state = state.copyWith(isRefreshing: true);
    await _loadMatches();
  }

  void selectMatch(MatchData match) {
    state = state.copyWith(activeMatch: match);
    // Fetch stats for newly selected match if not loaded
    if (match.statistics == null || match.statistics!.isEmpty) {
      _fetchStatsForMatch(match.fixtureId);
    }
  }

  void toggleLiveExpanded() {
    state = state.copyWith(liveExpanded: !state.liveExpanded);
  }

  void toggleAnsweredExpanded() {
    state = state.copyWith(answeredExpanded: !state.answeredExpanded);
  }

  void toggleNotStartedExpanded() {
    state = state.copyWith(notStartedExpanded: !state.notStartedExpanded);
  }

  // Legacy alias
  void toggleTodayExpanded() => toggleNotStartedExpanded();

  /// Fetch per-fixture prediction summary for the "Answered" category.
  Future<void> _fetchPredictionSummary() async {
    if (_apiClient == null) return;
    try {
      final response = await _apiClient!.get(ApiEndpoints.predictionsTodaySummary);
      final data = response.data as List<dynamic>;
      final summaries = <int, PredictionSummary>{};
      for (final item in data) {
        final s = PredictionSummary.fromJson(item as Map<String, dynamic>);
        summaries[s.fixtureId] = s;
      }
      if (!mounted) return;
      state = state.copyWith(predictionSummaries: summaries);
    } catch (_) {
      // Non-critical — "Answered" category just won't show if this fails.
    }
  }

  void updateMatchScore(int fixtureId, int homeScore, int awayScore, int? elapsed) {
    final updatedMatches = state.matches.map((m) {
      if (m.fixtureId == fixtureId) {
        return MatchData(
          fixtureId: m.fixtureId,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeLogoUrl: m.homeLogoUrl,
          awayLogoUrl: m.awayLogoUrl,
          homeScore: homeScore,
          awayScore: awayScore,
          homeHtScore: m.homeHtScore,
          awayHtScore: m.awayHtScore,
          status: m.status,
          elapsed: elapsed ?? m.elapsed,
          kickoffTime: m.kickoffTime,
          league: m.league,
          leagueLogoUrl: m.leagueLogoUrl,
          leagueRound: m.leagueRound,
          homeForm: m.homeForm,
          awayForm: m.awayForm,
          fanOnlineCount: m.fanOnlineCount,
          statistics: m.statistics,
        );
      }
      return m;
    }).toList();

    state = state.copyWith(matches: updatedMatches);

    if (state.activeMatch?.fixtureId == fixtureId) {
      final updated = updatedMatches.firstWhere((m) => m.fixtureId == fixtureId);
      state = state.copyWith(activeMatch: updated);
    }
  }

  void updateMatchStats(int fixtureId, Map<String, dynamic> stats) {
    final updatedMatches = state.matches.map((m) {
      if (m.fixtureId == fixtureId) {
        return m.withStats(stats);
      }
      return m;
    }).toList();

    state = state.copyWith(matches: updatedMatches);

    if (state.activeMatch?.fixtureId == fixtureId) {
      final updated = updatedMatches.firstWhere((m) => m.fixtureId == fixtureId);
      state = state.copyWith(activeMatch: updated);
    }
  }
}

final matchServiceProvider = Provider<MatchService>((ref) => MatchService());

final liveStateProvider = StateNotifierProvider<LiveNotifier, LiveState>((ref) {
  final matchService = ref.watch(matchServiceProvider);
  final apiClient = ref.watch(apiClientProvider);
  return LiveNotifier(matchService, apiClient);
});
