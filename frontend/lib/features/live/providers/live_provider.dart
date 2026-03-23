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

  const LiveState({
    this.matches = const [],
    this.activeMatch,
    this.isLoading = false,
    this.error,
  });

  List<MatchData> get liveMatches => matches.where((m) => m.isLive).toList();
  List<MatchData> get upcomingMatches => matches.where((m) => !m.isLive).toList();

  LiveState copyWith({
    List<MatchData>? matches,
    MatchData? activeMatch,
    bool? isLoading,
    String? error,
  }) {
    return LiveState(
      matches: matches ?? this.matches,
      activeMatch: activeMatch ?? this.activeMatch,
      isLoading: isLoading ?? this.isLoading,
      error: error,
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
      final matches = await _matchService.getLiveMatches();
      final todayMatches = await _matchService.getTodayMatches();

      final allMatches = [...matches, ...todayMatches];
      // Remove duplicates by fixtureId
      final seen = <int>{};
      final uniqueMatches = allMatches.where((m) => seen.add(m.fixtureId)).toList();

      state = state.copyWith(
        matches: uniqueMatches,
        activeMatch: matches.isNotEmpty ? matches.first : null,
        isLoading: false,
      );

      // Fetch stats for the active match
      if (matches.isNotEmpty && _apiClient != null) {
        _fetchStatsForMatch(matches.first.fixtureId);
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> _fetchStatsForMatch(int fixtureId) async {
    if (_apiClient == null) return;
    try {
      final response = await _apiClient.get(ApiEndpoints.matchDetail(fixtureId));
      final data = response.data as Map<String, dynamic>;
      if (data['statistics'] != null && data['statistics'] is List && (data['statistics'] as List).isNotEmpty) {
        final stats = MatchData.parseApiFootballStats(data['statistics'] as List);
        updateMatchStats(fixtureId, stats);
      }
    } catch (_) {
      // Stats not available yet — WebSocket will deliver them later
    }
  }

  void selectMatch(MatchData match) {
    state = state.copyWith(activeMatch: match);
    // Fetch stats for newly selected match if not loaded
    if (match.statistics == null || match.statistics!.isEmpty) {
      _fetchStatsForMatch(match.fixtureId);
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
          status: m.status,
          elapsed: elapsed ?? m.elapsed,
          league: m.league,
          leagueLogoUrl: m.leagueLogoUrl,
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
