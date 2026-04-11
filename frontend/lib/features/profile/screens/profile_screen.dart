import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../auth/providers/auth_provider.dart';
import '../../predict/providers/predict_provider.dart';
import '../../live/providers/live_provider.dart';
import '../providers/profile_provider.dart';
import '../widgets/profile_hero.dart';
import '../widgets/xp_bar.dart';
import '../widgets/stat_tile.dart';
import '../widgets/streak_calendar.dart';
import '../widgets/badge_grid.dart';
import '../../../core/l10n/app_strings.dart';
import '../widgets/activity_history.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final str = AppStrings.current;
    final profileState = ref.watch(profileStateProvider);

    if (profileState.isLoading && profileState.user == null) {
      return Scaffold(
        appBar: AppBar(title: Text(str.profile)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(str.profile),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: AppColors.red),
            onPressed: () {
              showDialog(
                context: context,
                builder: (ctx) => AlertDialog(
                  backgroundColor: AppColors.cardSurface,
                  title: Text(str.logout, style: const TextStyle(color: AppColors.textPrimary)),
                  content: Text(str.logoutConfirm, style: const TextStyle(color: AppColors.textSecondary)),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: Text(str.cancel, style: const TextStyle(color: AppColors.textSecondary)),
                    ),
                    TextButton(
                      onPressed: () {
                        Navigator.pop(ctx);
                        ref.read(authStateProvider.notifier).logout();
                        ref.invalidate(profileStateProvider);
                        ref.invalidate(predictStateProvider);
                        ref.invalidate(liveStateProvider);
                        ref.read(userCoinsProvider.notifier).state = 0;
                        context.go('/welcome');
                      },
                      child: Text(str.logout, style: const TextStyle(color: AppColors.red)),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(profileStateProvider.notifier).loadProfile();
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: sa(context, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ProfileHero(
                avatarEmoji: profileState.user?.avatarEmoji ?? '⚽',
                displayName: profileState.user?.displayName ?? 'Fan',
                title: profileState.user?.title ?? 'Fan Moi',
                level: profileState.user?.level ?? 1,
                joinDate: profileState.user?.createdAt,
                onTap: () => context.push('/profile/edit'),
              ),
              SizedBox(height: s(context, 16)),
              XpBar(
                currentXp: profileState.user?.currentXp ?? 0,
                xpToNextLevel: profileState.user?.xpToNextLevel ?? 100,
              ),
              SizedBox(height: s(context, 16)),
              // Stats grid
              Row(
                children: [
                  Expanded(
                    child: StatTile(
                      label: str.accuracy,
                      value: '${profileState.user?.accuracy ?? 0}%',
                      color: AppColors.neonGreen,
                      icon: Icons.gps_fixed,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: StatTile(
                      label: str.predictions,
                      value: '${profileState.user?.totalPredictions ?? 0}',
                      color: AppColors.amber,
                      icon: Icons.bolt,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: StatTile(
                      label: str.rank,
                      value: '#${profileState.user?.globalRank ?? "-"}',
                      color: AppColors.blue,
                      icon: Icons.emoji_events,
                      onTap: () => context.go('/leaderboard'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: StatTile(
                      label: str.streak,
                      value: '${profileState.user?.streakDays ?? 0}',
                      color: AppColors.purple,
                      icon: Icons.local_fire_department,
                    ),
                  ),
                ],
              ),
              SizedBox(height: s(context, 16)),
              StreakCalendar(streakDays: profileState.user?.streakDays ?? 0),
              SizedBox(height: s(context, 16)),
              Text(
                str.achievements,
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: sf(context, 20),
                  color: AppColors.textSecondary,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 8),
              BadgeGrid(achievements: profileState.achievements),
              SizedBox(height: s(context, 16)),
              Text(
                str.recentActivity,
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: sf(context, 20),
                  color: AppColors.textSecondary,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 8),
              ActivityHistory(
                activity: profileState.activity,
                hasMore: profileState.hasMoreActivity,
                isLoadingMore: profileState.isLoadingMore,
                onLoadMore: () => ref.read(profileStateProvider.notifier).loadMoreActivity(),
              ),
              SizedBox(height: s(context, 32)),
            ],
          ),
        ),
      ),
    );
  }
}
