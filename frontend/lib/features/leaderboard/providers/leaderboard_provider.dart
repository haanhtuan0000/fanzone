import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/leaderboard_entry.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../live/providers/live_provider.dart';
import '../../profile/providers/profile_provider.dart';

class LeaderboardState {
  final String scope;
  final List<LeaderboardEntry> entries;
  final int? myRank;
  final int? myCoins;
  final int? myDelta;
  final String? myUserId;
  final String? userCountryCode;
  final bool isLoading;

  const LeaderboardState({
    this.scope = 'match',
    this.entries = const [],
    this.myRank,
    this.myCoins,
    this.myDelta,
    this.myUserId,
    this.userCountryCode,
    this.isLoading = false,
  });

  LeaderboardState copyWith({
    String? scope,
    List<LeaderboardEntry>? entries,
    int? myRank,
    int? myCoins,
    int? myDelta,
    String? myUserId,
    String? userCountryCode,
    bool? isLoading,
  }) {
    return LeaderboardState(
      scope: scope ?? this.scope,
      entries: entries ?? this.entries,
      myRank: myRank ?? this.myRank,
      myCoins: myCoins ?? this.myCoins,
      myDelta: myDelta ?? this.myDelta,
      myUserId: myUserId ?? this.myUserId,
      userCountryCode: userCountryCode ?? this.userCountryCode,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class LeaderboardNotifier extends StateNotifier<LeaderboardState> {
  final ApiClient _apiClient;
  int? _activeFixtureId;

  LeaderboardNotifier(
    this._apiClient, {
    int? activeFixtureId,
    String? userId,
    String? countryCode,
  })  : _activeFixtureId = activeFixtureId,
        super(LeaderboardState(
          scope: 'match',
          myUserId: userId,
          userCountryCode: countryCode,
        )) {
    loadLeaderboard();
  }

  Future<void> loadLeaderboard() async {
    state = state.copyWith(isLoading: true);
    try {
      final params = <String, dynamic>{'scope': state.scope};
      if (state.scope == 'match' && _activeFixtureId != null) {
        params['id'] = _activeFixtureId.toString();
      }
      if (state.scope == 'country' && state.userCountryCode != null) {
        params['id'] = state.userCountryCode!;
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
  // Use ref.read (not watch) for liveState to prevent rebuilding on every score_update
  // This keeps user's tab selection stable
  final liveState = ref.read(liveStateProvider);
  final profileState = ref.read(profileStateProvider);
  final fixtureId = liveState.activeMatch?.fixtureId;
  return LeaderboardNotifier(
    apiClient,
    activeFixtureId: fixtureId,
    userId: profileState.user?.id,
    countryCode: profileState.user?.countryCode,
  );
});
