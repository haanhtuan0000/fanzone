import '../l10n/app_strings.dart';

class User {
  final String id;
  final String email;
  final String? displayName;
  final String? avatarEmoji;
  final String? countryCode;
  final int? favoriteTeamId;
  final int coins;
  final int currentXp;
  final int level;
  final String? titleVi;
  final String? titleEn;
  final int? xpToNextLevel;
  final int streakDays;
  final int totalPredictions;
  final int correctPredictions;
  final int accuracy;
  final int? globalRank;
  final DateTime? createdAt;

  String get title {
    if (identical(AppStrings.current, AppStrings.en)) return titleEn ?? titleVi ?? 'New Fan';
    return titleVi ?? titleEn ?? 'Fan Mới';
  }

  const User({
    required this.id,
    required this.email,
    this.displayName,
    this.avatarEmoji,
    this.countryCode,
    this.favoriteTeamId,
    this.coins = 500,
    this.currentXp = 0,
    this.level = 1,
    this.titleVi,
    this.titleEn,
    this.xpToNextLevel,
    this.streakDays = 0,
    this.totalPredictions = 0,
    this.correctPredictions = 0,
    this.accuracy = 0,
    this.globalRank,
    this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      email: json['email'] as String,
      displayName: json['displayName'] as String?,
      avatarEmoji: json['avatarEmoji'] as String?,
      countryCode: json['countryCode'] as String?,
      favoriteTeamId: json['favoriteTeamId'] as int?,
      coins: json['coins'] as int? ?? 500,
      currentXp: json['currentXp'] as int? ?? 0,
      level: json['level'] as int? ?? 1,
      titleVi: json['titleVi'] as String? ?? json['title'] as String?,
      titleEn: json['titleEn'] as String? ?? json['title'] as String?,
      xpToNextLevel: json['xpToNextLevel'] as int?,
      streakDays: json['streakDays'] as int? ?? 0,
      totalPredictions: json['totalPredictions'] as int? ?? 0,
      correctPredictions: json['correctPredictions'] as int? ?? 0,
      accuracy: json['accuracy'] as int? ?? 0,
      globalRank: json['globalRank'] as int?,
      createdAt: json['createdAt'] != null ? DateTime.parse(json['createdAt']) : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'displayName': displayName,
    'avatarEmoji': avatarEmoji,
    'countryCode': countryCode,
    'favoriteTeamId': favoriteTeamId,
    'coins': coins,
    'currentXp': currentXp,
    'level': level,
    'titleVi': titleVi,
    'titleEn': titleEn,
    'streakDays': streakDays,
    'totalPredictions': totalPredictions,
    'correctPredictions': correctPredictions,
    'accuracy': accuracy,
    'globalRank': globalRank,
  };
}
