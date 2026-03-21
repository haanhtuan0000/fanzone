import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/match.dart';
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

  LiveNotifier(this._matchService) : super(const LiveState(isLoading: true)) {
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
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void selectMatch(MatchData match) {
    state = state.copyWith(activeMatch: match);
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
}

final matchServiceProvider = Provider<MatchService>((ref) => MatchService());

final liveStateProvider = StateNotifierProvider<LiveNotifier, LiveState>((ref) {
  final matchService = ref.watch(matchServiceProvider);
  return LiveNotifier(matchService);
});
