class Achievement {
  final String id;
  final String name;
  final String description;
  final String conditionType;
  final int conditionValue;
  final int rewardXp;
  final String? rewardFrame;
  final int progress;
  final bool earned;
  final DateTime? earnedAt;

  const Achievement({
    required this.id,
    required this.name,
    required this.description,
    required this.conditionType,
    required this.conditionValue,
    this.rewardXp = 0,
    this.rewardFrame,
    this.progress = 0,
    this.earned = false,
    this.earnedAt,
  });

  double get progressPercent => conditionValue > 0
      ? (progress / conditionValue).clamp(0.0, 1.0)
      : 0.0;

  factory Achievement.fromJson(Map<String, dynamic> json) {
    return Achievement(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String,
      conditionType: json['conditionType'] as String,
      conditionValue: json['conditionValue'] as int,
      rewardXp: json['rewardXp'] as int? ?? 0,
      rewardFrame: json['rewardFrame'] as String?,
      progress: json['progress'] as int? ?? 0,
      earned: json['earned'] as bool? ?? false,
      earnedAt: json['earnedAt'] != null ? DateTime.parse(json['earnedAt'] as String) : null,
    );
  }
}
