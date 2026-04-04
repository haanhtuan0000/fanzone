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
  final int activityPage;
  final bool hasMoreActivity;
  final bool isLoadingMore;

  const ProfileState({
    this.user,
    this.achievements = const [],
    this.activity = const [],
    this.isLoading = false,
    this.activityPage = 1,
    this.hasMoreActivity = true,
    this.isLoadingMore = false,
  });

  ProfileState copyWith({
    User? user,
    List<Achievement>? achievements,
    List<dynamic>? activity,
    bool? isLoading,
    int? activityPage,
    bool? hasMoreActivity,
    bool? isLoadingMore,
  }) {
    return ProfileState(
      user: user ?? this.user,
      achievements: achievements ?? this.achievements,
      activity: activity ?? this.activity,
      isLoading: isLoading ?? this.isLoading,
      activityPage: activityPage ?? this.activityPage,
      hasMoreActivity: hasMoreActivity ?? this.hasMoreActivity,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
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
        activityPage: 1,
        hasMoreActivity: activity.length >= 10,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> loadMoreActivity() async {
    if (state.isLoadingMore || !state.hasMoreActivity) return;
    state = state.copyWith(isLoadingMore: true);
    try {
      final nextPage = state.activityPage + 1;
      final response = await _apiClient.get(
        ApiEndpoints.activity,
        queryParams: {'page': nextPage.toString()},
      );
      final newItems = response.data as List<dynamic>;
      state = state.copyWith(
        activity: [...state.activity, ...newItems],
        activityPage: nextPage,
        hasMoreActivity: newItems.length >= 10,
        isLoadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(isLoadingMore: false);
    }
  }

  Future<bool> updateProfile({String? displayName, String? avatarEmoji}) async {
    try {
      final data = <String, dynamic>{};
      if (displayName != null) data['displayName'] = displayName;
      if (avatarEmoji != null) data['avatarEmoji'] = avatarEmoji;

      final response = await _apiClient.put(ApiEndpoints.profileMe, data: data);
      final user = User.fromJson(response.data as Map<String, dynamic>);
      state = state.copyWith(user: user);
      return true;
    } catch (e) {
      return false;
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
