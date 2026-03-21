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
  final String? league;
  final String? leagueLogoUrl;
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
    this.league,
    this.leagueLogoUrl,
    this.statistics,
  });

  bool get isLive => ['1H', '2H', 'HT', 'ET', 'P', 'LIVE'].contains(status);

  factory MatchData.fromApiFootball(Map<String, dynamic> json) {
    final fixture = json['fixture'] ?? {};
    final teams = json['teams'] ?? {};
    final goals = json['goals'] ?? {};
    final score = json['score'] ?? {};
    final league = json['league'] ?? {};

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
      league: league['name'] as String?,
      leagueLogoUrl: league['logo'] as String?,
    );
  }
}
