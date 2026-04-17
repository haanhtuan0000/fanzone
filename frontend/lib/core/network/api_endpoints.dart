class ApiEndpoints {
  // 10.0.2.2 = host machine from Android emulator; change to localhost for iOS
  // Remote: 'https://fanzone-api-6ula.onrender.com'
  // Local:  'http://10.0.2.2:3000'
  static const String baseUrl = 'https://fanzone-api-6ula.onrender.com';

  // Auth
  static const String register = '/auth/register';
  static const String login = '/auth/login';
  static const String refresh = '/auth/refresh';
  static const String googleLogin = '/auth/google';

  // Matches
  static const String liveMatches = '/matches/live';
  static const String todayMatches = '/matches/today';
  static String matchDetail(int fixtureId) => '/matches/$fixtureId';
  static String fanVote(int fixtureId) => '/matches/$fixtureId/fan-vote';

  // Questions
  static String activeQuestions(int fixtureId) => '/questions/active/$fixtureId';
  static String matchPredictions(int fixtureId) => '/questions/match/$fixtureId/predictions';

  // Predictions
  static const String submitPrediction = '/predictions';
  static const String predictionHistory = '/predictions/history';
  static const String predictionsTodaySummary = '/predictions/today-summary';

  // Leaderboard
  static const String leaderboard = '/leaderboard';
  static const String leaderboardMe = '/leaderboard/me';

  // Profile
  static const String profileMe = '/profile/me';
  static String profileUser(String userId) => '/profile/$userId';
  static const String achievements = '/profile/me/achievements';
  static const String activity = '/profile/me/activity';

  // Feed
  static String feed(int fixtureId) => '/feed/$fixtureId';

  // Notifications (FCM device registration)
  static const String registerDevice = '/notifications/device';
}
