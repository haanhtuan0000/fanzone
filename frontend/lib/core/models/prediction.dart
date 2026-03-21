class Prediction {
  final String id;
  final String questionId;
  final String optionId;
  final int coinsBet;
  final int? coinsResult;
  final int? xpEarned;
  final bool? isCorrect;
  final DateTime predictedAt;
  final DateTime? resolvedAt;
  final String? questionText;
  final String? optionName;
  final String? optionEmoji;

  const Prediction({
    required this.id,
    required this.questionId,
    required this.optionId,
    this.coinsBet = 50,
    this.coinsResult,
    this.xpEarned,
    this.isCorrect,
    required this.predictedAt,
    this.resolvedAt,
    this.questionText,
    this.optionName,
    this.optionEmoji,
  });

  factory Prediction.fromJson(Map<String, dynamic> json) {
    return Prediction(
      id: json['id'] as String,
      questionId: json['questionId'] as String,
      optionId: json['optionId'] as String,
      coinsBet: json['coinsBet'] as int? ?? 50,
      coinsResult: json['coinsResult'] as int?,
      xpEarned: json['xpEarned'] as int?,
      isCorrect: json['isCorrect'] as bool?,
      predictedAt: DateTime.parse(json['predictedAt'] as String),
      resolvedAt: json['resolvedAt'] != null ? DateTime.parse(json['resolvedAt'] as String) : null,
      questionText: json['question']?['text'] as String?,
      optionName: json['option']?['name'] as String?,
      optionEmoji: json['option']?['emoji'] as String?,
    );
  }
}
