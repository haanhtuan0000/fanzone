import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/match.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../services/match_service.dart';

class LiveState {
  final List<MatchData> matches;
  final MatchData? activeMatch;
  final bool isLoading;
  final String? error;
  final bool liveExpanded;
  final bool todayExpanded;
  final bool isRefreshing;

  const LiveState({
    this.matches = const [],
    this.activeMatch,
    this.isLoading = false,
    this.error,
    this.liveExpanded = false,
    this.todayExpanded = false,
    this.isRefreshing = false,
  });

  List<MatchData> get liveMatches => matches.where((m) => m.isLive).toList();
  List<MatchData> get upcomingMatches => matches.where((m) => !m.isLive).toList();

  List<MatchData> get displayedLiveMatches {
    final live = liveMatches;
    return liveExpanded ? live : live.take(4).toList();
  }

  List<MatchData> get displayedTodayMatches {
    final today = upcomingMatches;
    return todayExpanded ? today : today.take(4).toList();
  }

  LiveState copyWith({
    List<MatchData>? matches,
    MatchData? activeMatch,
    bool? isLoading,
    String? error,
    bool? liveExpanded,
    bool? todayExpanded,
    bool? isRefreshing,
  }) {
    return LiveState(
      matches: matches ?? this.matches,
      activeMatch: activeMatch ?? this.activeMatch,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      liveExpanded: liveExpanded ?? this.liveExpanded,
      todayExpanded: todayExpanded ?? this.todayExpanded,
      isRefreshing: isRefreshing ?? this.isRefreshing,
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
      // Remove duplicates by fixtureId
      final seen = <int>{};
      final uniqueMatches = allMatches.where((m) => seen.add(m.fixtureId)).toList();

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

  void toggleTodayExpanded() {
    state = state.copyWith(todayExpanded: !state.todayExpanded);
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
