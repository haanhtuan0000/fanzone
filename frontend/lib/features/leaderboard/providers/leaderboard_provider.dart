import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/leaderboard_entry.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../live/providers/live_provider.dart';

class LeaderboardState {
  final String scope;
  final List<LeaderboardEntry> entries;
  final int? myRank;
  final int? myCoins;
  final int? myDelta;
  final bool isLoading;

  const LeaderboardState({
    this.scope = 'global',
    this.entries = const [],
    this.myRank,
    this.myCoins,
    this.myDelta,
    this.isLoading = false,
  });

  LeaderboardState copyWith({
    String? scope,
    List<LeaderboardEntry>? entries,
    int? myRank,
    int? myCoins,
    int? myDelta,
    bool? isLoading,
  }) {
    return LeaderboardState(
      scope: scope ?? this.scope,
      entries: entries ?? this.entries,
      myRank: myRank ?? this.myRank,
      myCoins: myCoins ?? this.myCoins,
      myDelta: myDelta ?? this.myDelta,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class LeaderboardNotifier extends StateNotifier<LeaderboardState> {
  final ApiClient _apiClient;
  int? _activeFixtureId;

  LeaderboardNotifier(this._apiClient, {int? activeFixtureId})
      : _activeFixtureId = activeFixtureId,
        super(const LeaderboardState(scope: 'match')) {
    loadLeaderboard();
  }

  Future<void> loadLeaderboard() async {
    state = state.copyWith(isLoading: true);
    try {
      final params = <String, dynamic>{'scope': state.scope};
      if (state.scope == 'match' && _activeFixtureId != null) {
        params['id'] = _activeFixtureId.toString();
      }

      final responses = await Future.wait([
        _apiClient.get(ApiEndpoints.leaderboard, queryParams: params),
        _apiClient.get(ApiEndpoints.leaderboardMe, queryParams: params),
      ]);

      final entriesData = responses[0].data as List<dynamic>;
      final entries = entriesData
          .map((json) => LeaderboardEntry.fromJson(json as Map<String, dynamic>))
          .toList();

      final meData = responses[1].data as Map<String, dynamic>;

      state = state.copyWith(
        entries: entries,
        myRank: meData['rank'] as int?,
        myCoins: meData['coins'] as int? ?? 0,
        myDelta: meData['delta'] as int? ?? 0,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false);
    }
  }

  void setScope(String scope) {
    state = state.copyWith(scope: scope);
    loadLeaderboard();
  }
}

final leaderboardStateProvider = StateNotifierProvider<LeaderboardNotifier, LeaderboardState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final liveState = ref.watch(liveStateProvider);
  final fixtureId = liveState.activeMatch?.fixtureId;
  return LeaderboardNotifier(apiClient, activeFixtureId: fixtureId);
});
