import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';

class FanVoteState {
  final int home;
  final int draw;
  final int away;
  final int total;
  final String? myVote;
  final bool isLoading;

  const FanVoteState({
    this.home = 0,
    this.draw = 0,
    this.away = 0,
    this.total = 0,
    this.myVote,
    this.isLoading = false,
  });

  FanVoteState copyWith({
    int? home,
    int? draw,
    int? away,
    int? total,
    String? myVote,
    bool clearMyVote = false,
    bool? isLoading,
  }) {
    return FanVoteState(
      home: home ?? this.home,
      draw: draw ?? this.draw,
      away: away ?? this.away,
      total: total ?? this.total,
      myVote: clearMyVote ? null : (myVote ?? this.myVote),
      isLoading: isLoading ?? this.isLoading,
    );
  }

  int pct(String choice) {
    if (total == 0) return 0;
    switch (choice) {
      case 'home': return (home * 100 / total).round();
      case 'draw': return (draw * 100 / total).round();
      case 'away': return (away * 100 / total).round();
      default: return 0;
    }
  }
}

class FanVoteNotifier extends StateNotifier<FanVoteState> {
  final ApiClient _apiClient;

  FanVoteNotifier(this._apiClient) : super(const FanVoteState());

  Future<void> load(int fixtureId) async {
    // Clear old state immediately so previous match data doesn't flash
    state = const FanVoteState(isLoading: true);
    try {
      final response = await _apiClient.get(ApiEndpoints.fanVote(fixtureId));
      final data = response.data as Map<String, dynamic>;
      state = FanVoteState(
        home: data['home'] as int? ?? 0,
        draw: data['draw'] as int? ?? 0,
        away: data['away'] as int? ?? 0,
        total: data['total'] as int? ?? 0,
        myVote: data['myVote'] as String?,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> vote(int fixtureId, String choice) async {
    if (state.myVote == choice) return; // Same vote — no change

    // Optimistic update
    final oldVote = state.myVote;
    int h = state.home, d = state.draw, a = state.away;

    // Remove old vote (prevent negatives)
    if (oldVote == 'home' && h > 0) h--;
    if (oldVote == 'draw' && d > 0) d--;
    if (oldVote == 'away' && a > 0) a--;

    // Add new vote
    if (choice == 'home') h++;
    if (choice == 'draw') d++;
    if (choice == 'away') a++;

    state = FanVoteState(
      home: h, draw: d, away: a,
      total: h + d + a,
      myVote: choice,
    );

    try {
      final response = await _apiClient.post(
        ApiEndpoints.fanVote(fixtureId),
        data: {'vote': choice},
      );
      final data = response.data as Map<String, dynamic>;
      state = FanVoteState(
        home: data['home'] as int? ?? h,
        draw: data['draw'] as int? ?? d,
        away: data['away'] as int? ?? a,
        total: data['total'] as int? ?? (h + d + a),
        myVote: data['myVote'] as String? ?? choice,
      );
    } catch (_) {
      // Revert on failure
      state = FanVoteState(
        home: state.home, draw: state.draw, away: state.away,
        total: state.total, myVote: oldVote,
      );
    }
  }
}

final fanVoteProvider = StateNotifierProvider<FanVoteNotifier, FanVoteState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return FanVoteNotifier(apiClient);
});
