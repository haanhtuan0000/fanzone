import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';

class MatchDetailData {
  final Map<String, dynamic> stats; // parsed stats (possession, shots, etc.)
  final List<MatchEvent> events;
  final List<MatchPrediction> predictions;

  const MatchDetailData({
    this.stats = const {},
    this.events = const [],
    this.predictions = const [],
  });
}

class MatchEvent {
  final String type; // Goal, Card, subst, Var
  final String? detail;
  final int minute;
  final int? extraMinute;
  final String? playerName;
  final String? assistName;
  final String? teamName;

  const MatchEvent({
    required this.type,
    this.detail,
    required this.minute,
    this.extraMinute,
    this.playerName,
    this.assistName,
    this.teamName,
  });

  String get icon {
    switch (type.toLowerCase()) {
      case 'goal':
        return '⚽';
      case 'card':
        if (detail?.contains('Red') == true) return '🟥';
        if (detail?.contains('Yellow') == true && detail?.contains('Red') == true) return '🟨🟥';
        return '🟨';
      case 'subst':
        return '🔄';
      case 'var':
        return '📺';
      default:
        return '📋';
    }
  }

  String get colorType {
    switch (type.toLowerCase()) {
      case 'goal':
        return 'goal';
      case 'card':
        return 'card';
      case 'subst':
        return 'sub';
      case 'var':
        return 'var';
      default:
        return 'other';
    }
  }

  factory MatchEvent.fromJson(Map<String, dynamic> json) {
    final time = json['time'] ?? {};
    return MatchEvent(
      type: (json['type'] as String?) ?? '',
      detail: json['detail'] as String?,
      minute: (time['elapsed'] as int?) ?? 0,
      extraMinute: time['extra'] as int?,
      playerName: json['player']?['name'] as String?,
      assistName: json['assist']?['name'] as String?,
      teamName: json['team']?['name'] as String?,
    );
  }
}

class MatchPrediction {
  final String questionText;
  final String? userPick;
  final String? correctAnswer;
  final String status; // correct, wrong, voided, pending
  final int? coinsResult;

  const MatchPrediction({
    required this.questionText,
    this.userPick,
    this.correctAnswer,
    required this.status,
    this.coinsResult,
  });
}

final matchDetailProvider = FutureProvider.family<MatchDetailData, int>((ref, fixtureId) async {
  final api = ref.watch(apiClientProvider);

  // Fetch match detail and predictions in parallel
  final matchResponse = await api.get(ApiEndpoints.matchDetail(fixtureId));
  dynamic predsResponse;
  try {
    predsResponse = await api.get(ApiEndpoints.matchPredictions(fixtureId));
  } catch (_) {
    predsResponse = null;
  }

  // Parse match detail (events + stats)
  final matchData = (matchResponse.data is Map<String, dynamic>)
      ? matchResponse.data as Map<String, dynamic>
      : <String, dynamic>{};
  final rawEvents = (matchData['events'] as List?) ?? [];
  final rawStats = (matchData['statistics'] as List?) ?? [];

  // Parse events
  final events = rawEvents
      .map((e) => e is Map<String, dynamic> ? MatchEvent.fromJson(e) : null)
      .whereType<MatchEvent>()
      .toList()
    ..sort((a, b) => a.minute.compareTo(b.minute));

  // Parse stats using the same logic as MatchData.parseApiFootballStats
  Map<String, dynamic> stats = {};
  if (rawStats.length >= 2) {
    String? findStat(List? team, String type) {
      if (team == null) return null;
      for (final s in team) {
        if (s is Map && s['type'] == type) return s['value']?.toString();
      }
      return null;
    }

    final home = rawStats[0] is Map ? (rawStats[0]['statistics'] as List?) : null;
    final away = rawStats[1] is Map ? (rawStats[1]['statistics'] as List?) : null;

    stats = {
      'possession': {
        'home': findStat(home, 'Ball Possession') ?? '50%',
        'away': findStat(away, 'Ball Possession') ?? '50%',
      },
      'shots': {
        'home': int.tryParse(findStat(home, 'Total Shots') ?? '0') ?? 0,
        'away': int.tryParse(findStat(away, 'Total Shots') ?? '0') ?? 0,
      },
      'shotsOnTarget': {
        'home': int.tryParse(findStat(home, 'Shots on Goal') ?? '0') ?? 0,
        'away': int.tryParse(findStat(away, 'Shots on Goal') ?? '0') ?? 0,
      },
      'corners': {
        'home': int.tryParse(findStat(home, 'Corner Kicks') ?? '0') ?? 0,
        'away': int.tryParse(findStat(away, 'Corner Kicks') ?? '0') ?? 0,
      },
      'yellowCards': {
        'home': int.tryParse(findStat(home, 'Yellow Cards') ?? '0') ?? 0,
        'away': int.tryParse(findStat(away, 'Yellow Cards') ?? '0') ?? 0,
      },
      'offsides': {
        'home': int.tryParse(findStat(home, 'Offsides') ?? '0') ?? 0,
        'away': int.tryParse(findStat(away, 'Offsides') ?? '0') ?? 0,
      },
    };
  }

  // Parse predictions
  final rawPreds = (predsResponse != null && predsResponse.data is List)
      ? predsResponse.data as List
      : [];
  final predictions = rawPreds.map((p) {
    if (p is! Map<String, dynamic>) return null;
    final question = p['question'] as Map<String, dynamic>? ?? {};
    final option = p['option'] as Map<String, dynamic>? ?? {};
    final correctOption = question['correctOption'] as Map<String, dynamic>?;

    String status = 'pending';
    if (p['isCorrect'] == true) status = 'correct';
    else if (p['isCorrect'] == false) status = 'wrong';
    else if (p['coinsResult'] == 0 && p['resolvedAt'] != null) status = 'voided';

    return MatchPrediction(
      questionText: (question['text'] as String?) ?? '',
      userPick: option['name'] as String?,
      correctAnswer: correctOption?['name'] as String?,
      status: status,
      coinsResult: p['coinsResult'] as int?,
    );
  }).whereType<MatchPrediction>().toList();

  return MatchDetailData(stats: stats, events: events, predictions: predictions);
});
