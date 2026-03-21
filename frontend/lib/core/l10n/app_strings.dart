class AppStrings {
  static const vi = _Vi();
  static const en = _En();

  // Current language — change this to switch
  static const current = en;
}

class _Vi {
  const _Vi();

  // Auth
  String get login => 'ĐĂNG NHẬP';
  String get register => 'ĐĂNG KÝ';
  String get logout => 'Đăng xuất';
  String get logoutConfirm => 'Bạn có chắc muốn đăng xuất?';
  String get cancel => 'Huỷ';
  String get email => 'Email';
  String get emailInvalid => 'Email không hợp lệ';
  String get password => 'Mật khẩu';
  String get passwordHint => 'Mật khẩu (6+ ký tự)';
  String get passwordTooShort => 'Mật khẩu phải có ít nhất 6 ký tự';
  String get enterPassword => 'Nhập mật khẩu';
  String get createAccount => 'TẠO TÀI KHOẢN';
  String get alreadyHaveAccount => 'Đã có tài khoản? ';
  String get noAccount => 'Chưa có tài khoản? ';
  String get loginLink => 'Đăng nhập';
  String get registerLink => 'Đăng ký ngay';
  String get loginWithGoogle => 'ĐĂNG NHẬP VỚI GOOGLE';
  String get registerWithEmail => 'ĐĂNG KÝ VỚI EMAIL';
  String get displayNameHint => 'Tên hiển thị (tuỳ chọn)';
  String get tagline => 'Dự đoán. Cạnh tranh. Thống trị.';

  // Auth errors
  String get errorConnection => 'Không thể kết nối đến máy chủ. Thử lại sau.';
  String get errorEmailTaken => 'Email đã được sử dụng';
  String get errorInvalidInfo => 'Thông tin không hợp lệ';
  String get errorInvalidCredentials => 'Email hoặc mật khẩu không đúng';
  String get errorGoogleFailed => 'Đăng nhập Google thất bại';

  // Onboarding
  String get chooseAvatar => 'CHỌN AVATAR';
  String get chooseAvatarDesc => 'Chọn biểu tượng đại diện cho bạn';
  String get yourName => 'TÊN CỦA BẠN';
  String get nameOnLeaderboard => 'Tên sẽ hiển thị trên bảng xếp hạng';
  String get enterDisplayName => 'Nhập tên hiển thị';
  String get howToPlay => 'CÁCH CHƠI';
  String get continueBtn => 'TIẾP TỤC';
  String get startPlaying => 'BẮT ĐẦU CHƠI';
  String get tutPredictTitle => 'Dự đoán sự kiện';
  String get tutPredictDesc => 'Trả lời câu hỏi về các sự kiện trong trận đấu';
  String get tutCoinsTitle => 'Nhận coins';
  String get tutCoinsDesc => 'Dự đoán đúng để nhận coins và tăng hạng';
  String get tutLeaderboardTitle => 'Leo bảng xếp hạng';
  String get tutLeaderboardDesc => 'Cạnh tranh với fan khác trên toàn cầu';

  // Live screen
  String get noLiveMatches => 'Không có trận đấu nào đang diễn ra';
  String get comeBackLater => 'Quay lại sau nhé!';
  String get liveMatches => 'TRẬN ĐẤU ĐANG DIỄN RA';
  String get todayMatches => 'TRẬN ĐẤU HÔM NAY';

  // Predict screen
  String get predict => 'DỰ ĐOÁN';
  String get noQuestions => 'Chưa có câu hỏi nào';
  String get waitForMatch => 'Đợi trận đấu diễn ra để dự đoán nhé!';
  String get confirmPrediction => 'XÁC NHẬN DỰ ĐOÁN';
  String get confirmed => 'ĐÃ XÁC NHẬN — CHỜ KẾT QUẢ...';
  String get predictNow => 'DỰ ĐOÁN NGAY!';
  String get newQuestionAvailable => 'Câu hỏi mới đang chờ bạn';

  // Result overlay
  String get correct => 'CHÍNH XÁC!';
  String get wrong => 'SAI RỒI!';
  String get tryNextOne => 'Tiếc quá! Thử lại câu tiếp nhé';

  // Leaderboard
  String get leaderboard => 'BẢNG XẾP HẠNG';
  String get noData => 'Chưa có dữ liệu';
  String get predictToRank => 'Dự đoán để lên bảng xếp hạng!';
  String get yourPosition => 'Vị trí của bạn';

  // Feed
  String get activity => 'HOẠT ĐỘNG';
  String get noActivity => 'Chưa có hoạt động nào';

  // Profile
  String get profile => 'CÁ NHÂN';
  String get accuracy => 'Chính xác';
  String get predictions => 'Dự đoán';
  String get rank => 'Hạng';
  String get streak => 'Streak';
  String get achievements => 'THÀNH TÍCH';
  String get noAchievements => 'Chưa có thành tích nào';
  String get recentActivity => 'HOẠT ĐỘNG GẦN ĐÂY';
  String get noRecentActivity => 'Chưa có hoạt động nào';
  String streakDays(int days) => 'Streak: $days ngày';
  String earnedOn(int day, int month, int year) => 'Đạt được ngày $day/$month/$year';

  // Time ago
  String get justNow => 'Vừa xong';
  String secondsAgo(int s) => '${s}s trước';
  String minutesAgo(int m) => '$m phút trước';
  String hoursAgo(int h) => '$h giờ trước';
  String daysAgo(int d) => '$d ngày trước';

  // Nav
  String get navLive => 'Live';
  String get navPredict => 'Dự đoán';
  String get navLeaderboard => 'BXH';
  String get navFeed => 'Feed';
  String get navProfile => 'Cá nhân';

  // Leaderboard tabs
  String get tabMatch => 'Trận này';
  String get tabWeek => 'Tuần này';
  String get tabGlobal => 'Toàn cầu';
}

class _En {
  const _En();

  // Auth
  String get login => 'LOGIN';
  String get register => 'SIGN UP';
  String get logout => 'Logout';
  String get logoutConfirm => 'Are you sure you want to log out?';
  String get cancel => 'Cancel';
  String get email => 'Email';
  String get emailInvalid => 'Invalid email';
  String get password => 'Password';
  String get passwordHint => 'Password (6+ characters)';
  String get passwordTooShort => 'Password must be at least 6 characters';
  String get enterPassword => 'Enter password';
  String get createAccount => 'CREATE ACCOUNT';
  String get alreadyHaveAccount => 'Already have an account? ';
  String get noAccount => "Don't have an account? ";
  String get loginLink => 'Login';
  String get registerLink => 'Sign up now';
  String get loginWithGoogle => 'SIGN IN WITH GOOGLE';
  String get registerWithEmail => 'SIGN UP WITH EMAIL';
  String get displayNameHint => 'Display name (optional)';
  String get tagline => 'Predict. Compete. Dominate.';

  // Auth errors
  String get errorConnection => 'Cannot connect to server. Try again later.';
  String get errorEmailTaken => 'Email already in use';
  String get errorInvalidInfo => 'Invalid information';
  String get errorInvalidCredentials => 'Invalid email or password';
  String get errorGoogleFailed => 'Google sign-in failed';

  // Onboarding
  String get chooseAvatar => 'CHOOSE AVATAR';
  String get chooseAvatarDesc => 'Pick an icon to represent you';
  String get yourName => 'YOUR NAME';
  String get nameOnLeaderboard => 'This will appear on the leaderboard';
  String get enterDisplayName => 'Enter display name';
  String get howToPlay => 'HOW TO PLAY';
  String get continueBtn => 'CONTINUE';
  String get startPlaying => 'START PLAYING';
  String get tutPredictTitle => 'Predict events';
  String get tutPredictDesc => 'Answer questions about match events';
  String get tutCoinsTitle => 'Earn coins';
  String get tutCoinsDesc => 'Correct predictions earn coins and rank';
  String get tutLeaderboardTitle => 'Climb the leaderboard';
  String get tutLeaderboardDesc => 'Compete with fans worldwide';

  // Live screen
  String get noLiveMatches => 'No live matches right now';
  String get comeBackLater => 'Come back later!';
  String get liveMatches => 'LIVE MATCHES';
  String get todayMatches => 'TODAY\'S MATCHES';

  // Predict screen
  String get predict => 'PREDICT';
  String get noQuestions => 'No questions yet';
  String get waitForMatch => 'Wait for a match to start predicting!';
  String get confirmPrediction => 'CONFIRM PREDICTION';
  String get confirmed => 'CONFIRMED — WAITING FOR RESULT...';
  String get predictNow => 'PREDICT NOW!';
  String get newQuestionAvailable => 'New question waiting for you';

  // Result overlay
  String get correct => 'CORRECT!';
  String get wrong => 'WRONG!';
  String get tryNextOne => 'Too bad! Try the next one';

  // Leaderboard
  String get leaderboard => 'LEADERBOARD';
  String get noData => 'No data yet';
  String get predictToRank => 'Make predictions to rank up!';
  String get yourPosition => 'Your position';

  // Feed
  String get activity => 'ACTIVITY';
  String get noActivity => 'No activity yet';

  // Profile
  String get profile => 'PROFILE';
  String get accuracy => 'Accuracy';
  String get predictions => 'Predictions';
  String get rank => 'Rank';
  String get streak => 'Streak';
  String get achievements => 'ACHIEVEMENTS';
  String get noAchievements => 'No achievements yet';
  String get recentActivity => 'RECENT ACTIVITY';
  String get noRecentActivity => 'No activity yet';
  String streakDays(int days) => 'Streak: $days days';
  String earnedOn(int day, int month, int year) => 'Earned on $day/$month/$year';

  // Time ago
  String get justNow => 'Just now';
  String secondsAgo(int s) => '${s}s ago';
  String minutesAgo(int m) => '${m}m ago';
  String hoursAgo(int h) => '${h}h ago';
  String daysAgo(int d) => '${d}d ago';

  // Nav
  String get navLive => 'Live';
  String get navPredict => 'Predict';
  String get navLeaderboard => 'Rank';
  String get navFeed => 'Feed';
  String get navProfile => 'Profile';

  // Leaderboard tabs
  String get tabMatch => 'This match';
  String get tabWeek => 'This week';
  String get tabGlobal => 'Global';
}
