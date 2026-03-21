class FeedEvent {
  final String id;
  final int fixtureId;
  final String? userId;
  final String type; // CORRECT, WRONG, RANK_CHANGE, SYSTEM
  final String message;
  final int? coinsDelta;
  final String? userDisplayName;
  final String? userAvatarEmoji;
  final DateTime createdAt;

  const FeedEvent({
    required this.id,
    required this.fixtureId,
    this.userId,
    required this.type,
    required this.message,
    this.coinsDelta,
    this.userDisplayName,
    this.userAvatarEmoji,
    required this.createdAt,
  });

  factory FeedEvent.fromJson(Map<String, dynamic> json) {
    return FeedEvent(
      id: json['id'] as String,
      fixtureId: json['fixtureId'] as int,
      userId: json['userId'] as String?,
      type: json['type'] as String,
      message: json['message'] as String,
      coinsDelta: json['coinsDelta'] as int?,
      userDisplayName: json['user']?['displayName'] as String?,
      userAvatarEmoji: json['user']?['avatarEmoji'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
