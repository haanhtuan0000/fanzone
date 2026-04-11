class Question {
  final String id;
  final int fixtureId;
  final String category; // GOAL, CARD, CORNER, VAR, HALFTIME, SUBSTITUTION
  final String text;
  final int rewardCoins;
  final String status; // PENDING, OPEN, CLOSED, RESOLVED, VOIDED
  final String? correctOptionId;
  final DateTime opensAt;
  final DateTime closesAt;
  final int? matchMinute;
  final String? matchPhase;
  final List<QuestionOption> options;

  const Question({
    required this.id,
    required this.fixtureId,
    required this.category,
    required this.text,
    this.rewardCoins = 50,
    this.status = 'PENDING',
    this.correctOptionId,
    required this.opensAt,
    required this.closesAt,
    this.matchMinute,
    this.matchPhase,
    this.options = const [],
  });

  bool get isOpen => status == 'OPEN';
  Duration get timeRemaining => closesAt.difference(DateTime.now());

  factory Question.fromJson(Map<String, dynamic> json) {
    return Question(
      id: json['id'] as String,
      fixtureId: json['fixtureId'] as int,
      category: json['category'] as String,
      text: json['text'] as String,
      rewardCoins: json['rewardCoins'] as int? ?? 50,
      status: json['status'] as String? ?? 'PENDING',
      correctOptionId: json['correctOptionId'] as String?,
      opensAt: DateTime.parse(json['opensAt'] as String),
      closesAt: DateTime.parse(json['closesAt'] as String),
      matchMinute: json['matchMinute'] as int?,
      matchPhase: json['matchPhase'] as String?,
      options: (json['options'] as List<dynamic>?)
          ?.map((o) => QuestionOption.fromJson(o as Map<String, dynamic>))
          .toList() ?? [],
    );
  }
}

class QuestionOption {
  final String id;
  final String name;
  final String? emoji;
  final String? info;
  final double multiplier;
  final int fanCount;
  final int fanPct;
  final bool isCorrect;

  const QuestionOption({
    required this.id,
    required this.name,
    this.emoji,
    this.info,
    this.multiplier = 2.0,
    this.fanCount = 0,
    this.fanPct = 0,
    this.isCorrect = false,
  });

  factory QuestionOption.fromJson(Map<String, dynamic> json) {
    return QuestionOption(
      id: json['id'] as String,
      name: json['name'] as String,
      emoji: json['emoji'] as String?,
      info: json['info'] as String?,
      multiplier: (json['multiplier'] as num?)?.toDouble() ?? 2.0,
      fanCount: json['fanCount'] as int? ?? 0,
      fanPct: json['fanPct'] as int? ?? 0,
      isCorrect: json['isCorrect'] as bool? ?? false,
    );
  }
}
