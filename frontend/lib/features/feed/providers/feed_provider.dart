import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/feed_event.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../live/providers/live_provider.dart';

class FeedState {
  final List<FeedEvent> events;
  final bool isLoading;

  const FeedState({
    this.events = const [],
    this.isLoading = false,
  });

  FeedState copyWith({
    List<FeedEvent>? events,
    bool? isLoading,
  }) {
    return FeedState(
      events: events ?? this.events,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class FeedNotifier extends StateNotifier<FeedState> {
  final ApiClient _apiClient;

  FeedNotifier(this._apiClient) : super(const FeedState());

  Future<void> loadFeed(int fixtureId) async {
    state = state.copyWith(isLoading: true);
    try {
      final response = await _apiClient.get(
        ApiEndpoints.feed(fixtureId),
        queryParams: {'limit': 50},
      );
      final data = response.data as List<dynamic>;
      final events = data
          .map((json) => FeedEvent.fromJson(json as Map<String, dynamic>))
          .toList();
      state = FeedState(events: events, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false);
    }
  }

  void addEvent(FeedEvent event) {
    state = state.copyWith(events: [event, ...state.events]);
  }
}

final feedStateProvider = StateNotifierProvider<FeedNotifier, FeedState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final notifier = FeedNotifier(apiClient);

  final liveState = ref.watch(liveStateProvider);
  final activeMatch = liveState.activeMatch;
  if (activeMatch != null) {
    Future.microtask(() => notifier.loadFeed(activeMatch.fixtureId));
  }

  return notifier;
});
