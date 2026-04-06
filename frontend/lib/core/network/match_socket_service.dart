import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'websocket_client.dart';
import '../../features/live/providers/live_provider.dart';
import '../../features/predict/providers/predict_provider.dart';
import '../../features/feed/providers/feed_provider.dart';
import '../../core/models/feed_event.dart';

/// Bridges WebSocket events to Riverpod state.
/// Manages socket lifecycle: connect, join/leave match rooms,
/// listen for real-time events, and re-sync on app resume.
class MatchSocketService with WidgetsBindingObserver {
  final WebSocketClient _ws;
  late final Ref _ref;
  int? _currentFixtureId;
  Timer? _refreshTimer;
  bool _started = false;

  MatchSocketService(this._ws);

  void init(Ref ref) {
    _ref = ref;
  }

  void start({String? token}) {
    if (_started) return;
    _started = true;
    _ws.connect(token: token);
    WidgetsBinding.instance.addObserver(this);
  }

  void stop() {
    if (!_started) return;
    _started = false;
    _refreshTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _leaveCurrentMatch();
    _ws.disconnect();
  }

  // ─── Called by the provider to track match changes ───

  void onActiveMatchChanged(int? newFixtureId) {
    if (newFixtureId == _currentFixtureId) return;

    _leaveCurrentMatch();

    if (newFixtureId != null && _started) {
      _currentFixtureId = newFixtureId;
      _ws.joinMatch(newFixtureId);
      _setupEventListeners();
      _startPeriodicRefresh(newFixtureId);
    }
  }

  // ─── App lifecycle: re-sync on resume ───

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _onAppResumed();
    }
  }

  void _onAppResumed() {
    if (!_started) return;

    // Reconnect if needed
    if (!_ws.isConnected) {
      _ws.connect();
    }

    // Re-join current match room
    if (_currentFixtureId != null) {
      _ws.joinMatch(_currentFixtureId!);
    }

    // Refresh live matches + current questions from REST (source of truth)
    _ref.invalidate(liveStateProvider);
    final fixtureId = _currentFixtureId;
    if (fixtureId != null) {
      _ref.read(predictStateProvider.notifier).loadQuestions(fixtureId);
    }
  }

  // ─── Internal ───

  void _leaveCurrentMatch() {
    _refreshTimer?.cancel();
    if (_currentFixtureId != null) {
      _ws.off('new_question');
      _ws.off('prediction_result');
      _ws.off('score_update');
      _ws.off('stats_update');
      _ws.leaveMatch(_currentFixtureId!);
      _currentFixtureId = null;
    }
  }

  void _setupEventListeners() {
    // New question available — reload from server for full data
    _ws.on('new_question', (data) {
      final fixtureId = _currentFixtureId;
      if (fixtureId != null) {
        _ref.read(predictStateProvider.notifier).loadQuestions(fixtureId);
      }
    });

    // Prediction result — show immediately if it's our active question
    _ws.on('prediction_result', (data) {
      if (data is Map<String, dynamic>) {
        _ref.read(predictStateProvider.notifier).onPredictionResult(data);
      }
    });

    // Score update — update live match state in real-time
    _ws.on('score_update', (data) {
      if (data is Map<String, dynamic>) {
        final fixtureId = data['fixtureId'] as int?;
        final homeScore = data['homeScore'] as int?;
        final awayScore = data['awayScore'] as int?;
        final elapsed = data['clock'] as int?;
        if (fixtureId != null && homeScore != null && awayScore != null) {
          _ref.read(liveStateProvider.notifier).updateMatchScore(
            fixtureId, homeScore, awayScore, elapsed,
          );
        }
      }
    });

    // Stats update — possession, shots, cards, corners
    _ws.on('stats_update', (data) {
      if (data is Map<String, dynamic>) {
        final fixtureId = data['fixtureId'] as int?;
        if (fixtureId != null) {
          _ref.read(liveStateProvider.notifier).updateMatchStats(fixtureId, data);
        }
      }
    });

    // Feed event — real-time activity feed updates
    _ws.on('feed_event', (data) {
      if (data is Map<String, dynamic>) {
        try {
          final event = FeedEvent.fromJson(data);
          _ref.read(feedStateProvider.notifier).addEvent(event);
        } catch (_) {}
      }
    });
  }

  // Periodic refresh as fallback for missed WS events
  void _startPeriodicRefresh(int fixtureId) {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (_started) {
        _ref.read(predictStateProvider.notifier).loadQuestions(fixtureId);
      }
    });
  }
}

final matchSocketServiceProvider = Provider<MatchSocketService>((ref) {
  final ws = ref.watch(websocketClientProvider);
  final service = MatchSocketService(ws);
  service.init(ref);

  // Track active match changes — join/leave WS rooms automatically
  ref.listen<LiveState>(liveStateProvider, (prev, next) {
    service.onActiveMatchChanged(next.activeMatch?.fixtureId);
  });

  ref.onDispose(() => service.stop());

  return service;
});
