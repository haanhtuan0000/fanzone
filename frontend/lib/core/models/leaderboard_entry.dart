class LeaderboardEntry {
  final int rank;
  final String userId;
  final String displayName;
  final String avatarEmoji;
  final String? countryCode;
  final int coins;
  final int accuracy;
  final int delta; // positive = moved up, negative = moved down

  const LeaderboardEntry({
    required this.rank,
    required this.userId,
    required this.displayName,
    this.avatarEmoji = '⚽',
    this.countryCode,
    this.coins = 0,
    this.accuracy = 0,
    this.delta = 0,
  });

  factory LeaderboardEntry.fromJson(Map<String, dynamic> json) {
    return LeaderboardEntry(
      rank: json['rank'] as int,
      userId: json['userId'] as String,
      displayName: json['displayName'] as String? ?? 'Unknown',
      avatarEmoji: json['avatarEmoji'] as String? ?? '⚽',
      countryCode: json['countryCode'] as String?,
      coins: json['coins'] as int? ?? 0,
      accuracy: json['accuracy'] as int? ?? 0,
      delta: json['delta'] as int? ?? 0,
    );
  }
}
