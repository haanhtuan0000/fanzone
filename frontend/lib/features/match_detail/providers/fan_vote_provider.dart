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
  /// The choice the user just tapped and whose POST is still in flight.
  /// When non-null the UI should show a spinner on that option and ignore
  /// further taps — this also protects against a stale `load()` response
  /// overwriting the optimistic myVote with the server's previous value.
  final String? pendingChoice;

  const FanVoteState({
    this.home = 0,
    this.draw = 0,
    this.away = 0,
    this.total = 0,
    this.myVote,
    this.isLoading = false,
    this.pendingChoice,
  });

  FanVoteState copyWith({
    int? home,
    int? draw,
    int? away,
    int? total,
    String? myVote,
    bool clearMyVote = false,
    bool? isLoading,
    String? pendingChoice,
    bool clearPendingChoice = false,
  }) {
    return FanVoteState(
      home: home ?? this.home,
      draw: draw ?? this.draw,
      away: away ?? this.away,
      total: total ?? this.total,
      myVote: clearMyVote ? null : (myVote ?? this.myVote),
      isLoading: isLoading ?? this.isLoading,
      pendingChoice: clearPendingChoice ? null : (pendingChoice ?? this.pendingChoice),
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
    // Clear old state immediately so previous match data doesn't flash.
    // Preserve any in-flight vote choice so a slow initial load can't roll
    // back the user's optimistic selection.
    state = FanVoteState(isLoading: true, pendingChoice: state.pendingChoice);
    try {
      final response = await _apiClient.get(ApiEndpoints.fanVote(fixtureId));
      final data = response.data as Map<String, dynamic>;
      // If the user has tapped during load, keep their optimistic myVote;
      // otherwise adopt the server value.
      final incomingMyVote = data['myVote'] as String?;
      state = FanVoteState(
        home: data['home'] as int? ?? 0,
        draw: data['draw'] as int? ?? 0,
        away: data['away'] as int? ?? 0,
        total: data['total'] as int? ?? 0,
        myVote: state.pendingChoice ?? incomingMyVote,
        pendingChoice: state.pendingChoice,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> vote(int fixtureId, String choice) async {
    // Same vote — no change.
    if (state.myVote == choice) return;
    // Already processing a vote — ignore re-taps. Prevents the UI flicker
    // that happens when rapid taps produce out-of-order POST responses,
    // and lets the single in-flight spinner do its job.
    if (state.pendingChoice != null) return;

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
      pendingChoice: choice,
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
        // pendingChoice cleared — request settled successfully.
      );
    } catch (_) {
      // Revert on failure
      state = FanVoteState(
        home: state.home, draw: state.draw, away: state.away,
        total: state.total, myVote: oldVote,
        // pendingChoice cleared — request settled (with failure).
      );
    }
  }
}

final fanVoteProvider = StateNotifierProvider<FanVoteNotifier, FanVoteState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return FanVoteNotifier(apiClient);
});
