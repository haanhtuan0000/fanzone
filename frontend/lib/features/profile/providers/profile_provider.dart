import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/user.dart';
import '../../../core/models/achievement.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';

class ProfileState {
  final User? user;
  final List<Achievement> achievements;
  final List<dynamic> activity;
  final bool isLoading;

  const ProfileState({
    this.user,
    this.achievements = const [],
    this.activity = const [],
    this.isLoading = false,
  });

  ProfileState copyWith({
    User? user,
    List<Achievement>? achievements,
    List<dynamic>? activity,
    bool? isLoading,
  }) {
    return ProfileState(
      user: user ?? this.user,
      achievements: achievements ?? this.achievements,
      activity: activity ?? this.activity,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class ProfileNotifier extends StateNotifier<ProfileState> {
  final ApiClient _apiClient;

  ProfileNotifier(this._apiClient) : super(const ProfileState()) {
    loadProfile();
  }

  Future<void> loadProfile() async {
    state = state.copyWith(isLoading: true);
    try {
      final responses = await Future.wait([
        _apiClient.get(ApiEndpoints.profileMe),
        _apiClient.get(ApiEndpoints.achievements),
        _apiClient.get(ApiEndpoints.activity),
      ]);

      final user = User.fromJson(responses[0].data as Map<String, dynamic>);

      final achievementsData = responses[1].data as List<dynamic>;
      final achievements = achievementsData
          .map((json) => Achievement.fromJson(json as Map<String, dynamic>))
          .toList();

      final activity = responses[2].data as List<dynamic>;

      state = ProfileState(
        user: user,
        achievements: achievements,
        activity: activity,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false);
    }
  }

  void setUser(User user) {
    state = state.copyWith(user: user);
  }

  void setAchievements(List<Achievement> achievements) {
    state = state.copyWith(achievements: achievements);
  }
}

final profileStateProvider = StateNotifierProvider<ProfileNotifier, ProfileState>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ProfileNotifier(apiClient);
});
