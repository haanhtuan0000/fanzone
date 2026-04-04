class MatchData {
  final int fixtureId;
  final String homeTeam;
  final String awayTeam;
  final String? homeLogoUrl;
  final String? awayLogoUrl;
  final int homeScore;
  final int awayScore;
  final int? homeHtScore;
  final int? awayHtScore;
  final String status; // LIVE, NS (not started), FT, HT, etc.
  final int? elapsed; // match minute
  final DateTime? kickoffTime;
  final String? league;
  final String? leagueLogoUrl;
  final String? leagueRound;
  final String? homeForm; // e.g. "W8 D2 L1"
  final String? awayForm;
  final int? fanOnlineCount;
  final Map<String, dynamic>? statistics;

  const MatchData({
    required this.fixtureId,
    required this.homeTeam,
    required this.awayTeam,
    this.homeLogoUrl,
    this.awayLogoUrl,
    this.homeScore = 0,
    this.awayScore = 0,
    this.homeHtScore,
    this.awayHtScore,
    this.status = 'NS',
    this.elapsed,
    this.kickoffTime,
    this.league,
    this.leagueLogoUrl,
    this.leagueRound,
    this.homeForm,
    this.awayForm,
    this.fanOnlineCount,
    this.statistics,
  });

  bool get isLive => ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].contains(status);

  factory MatchData.fromApiFootball(Map<String, dynamic> json) {
    final fixture = json['fixture'] ?? {};
    final teams = json['teams'] ?? {};
    final goals = json['goals'] ?? {};
    final score = json['score'] ?? {};
    final league = json['league'] ?? {};

    // Parse inline statistics if present (from stats_update or enriched response)
    Map<String, dynamic>? stats;
    if (json['statistics'] != null && json['statistics'] is List) {
      stats = parseApiFootballStats(json['statistics'] as List);
    }

    return MatchData(
      fixtureId: fixture['id'] as int? ?? 0,
      homeTeam: (teams['home']?['name'] as String?) ?? 'Home',
      awayTeam: (teams['away']?['name'] as String?) ?? 'Away',
      homeLogoUrl: teams['home']?['logo'] as String?,
      awayLogoUrl: teams['away']?['logo'] as String?,
      homeScore: goals['home'] as int? ?? 0,
      awayScore: goals['away'] as int? ?? 0,
      homeHtScore: score['halftime']?['home'] as int?,
      awayHtScore: score['halftime']?['away'] as int?,
      status: (fixture['status']?['short'] as String?) ?? 'NS',
      elapsed: fixture['status']?['elapsed'] as int?,
      kickoffTime: fixture['date'] != null ? DateTime.tryParse(fixture['date'] as String) : null,
      league: league['name'] as String?,
      leagueLogoUrl: league['logo'] as String?,
      leagueRound: league['round'] as String?,
      statistics: stats,
    );
  }

  /// Copy with updated stats from WebSocket stats_update event
  MatchData withStats(Map<String, dynamic> stats) {
    return MatchData(
      fixtureId: fixtureId,
      homeTeam: homeTeam,
      awayTeam: awayTeam,
      homeLogoUrl: homeLogoUrl,
      awayLogoUrl: awayLogoUrl,
      homeScore: homeScore,
      awayScore: awayScore,
      homeHtScore: homeHtScore,
      awayHtScore: awayHtScore,
      status: status,
      elapsed: elapsed,
      kickoffTime: kickoffTime,
      league: league,
      leagueLogoUrl: leagueLogoUrl,
      leagueRound: leagueRound,
      homeForm: homeForm,
      awayForm: awayForm,
      fanOnlineCount: fanOnlineCount,
      statistics: stats,
    );
  }

  static Map<String, dynamic> parseApiFootballStats(List stats) {
    if (stats.length < 2) return {};

    String? findStat(List? team, String type) {
      if (team == null) return null;
      for (final s in team) {
        if (s is Map && s['type'] == type) return s['value']?.toString();
      }
      return null;
    }

    final home = stats[0] is Map ? (stats[0]['statistics'] as List?) : null;
    final away = stats[1] is Map ? (stats[1]['statistics'] as List?) : null;

    return {
      'possession': {
        'home': findStat(home, 'Ball Possession') ?? '50%',
        'away': findStat(away, 'Ball Possession') ?? '50%',
      },
      'shots': {
        'home': int.tryParse(findStat(home, 'Total Shots') ?? '0') ?? 0,
        'away': int.tryParse(findStat(away, 'Total Shots') ?? '0') ?? 0,
      },
      'yellowCards': {
        'home': int.tryParse(findStat(home, 'Yellow Cards') ?? '0') ?? 0,
        'away': int.tryParse(findStat(away, 'Yellow Cards') ?? '0') ?? 0,
      },
      'corners': {
        'home': int.tryParse(findStat(home, 'Corner Kicks') ?? '0') ?? 0,
        'away': int.tryParse(findStat(away, 'Corner Kicks') ?? '0') ?? 0,
      },
    };
  }
}
