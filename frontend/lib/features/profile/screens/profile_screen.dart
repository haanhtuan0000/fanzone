import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../app/constants.dart';
import '../providers/profile_provider.dart';
import '../widgets/profile_hero.dart';
import '../widgets/xp_bar.dart';
import '../widgets/stat_tile.dart';
import '../widgets/streak_calendar.dart';
import '../widgets/badge_grid.dart';
import '../widgets/activity_history.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileState = ref.watch(profileStateProvider);

    if (profileState.isLoading && profileState.user == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('CA NHAN')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('CA NHAN'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings, color: AppColors.textSecondary),
            onPressed: () {},
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(profileStateProvider.notifier).loadProfile();
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ProfileHero(
                avatarEmoji: profileState.user?.avatarEmoji ?? '⚽',
                displayName: profileState.user?.displayName ?? 'Fan',
                title: profileState.user?.title ?? 'Fan Moi',
                level: profileState.user?.level ?? 1,
              ),
              const SizedBox(height: 16),
              XpBar(
                currentXp: profileState.user?.currentXp ?? 0,
                xpToNextLevel: profileState.user?.xpToNextLevel ?? 100,
              ),
              const SizedBox(height: 16),
              // Stats grid
              Row(
                children: [
                  Expanded(
                    child: StatTile(
                      label: 'Chinh xac',
                      value: '${profileState.user?.accuracy ?? 0}%',
                      color: AppColors.neonGreen,
                      icon: Icons.gps_fixed,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: StatTile(
                      label: 'Du doan',
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
                      label: 'Hang',
                      value: '#${profileState.user?.globalRank ?? "-"}',
                      color: AppColors.blue,
                      icon: Icons.emoji_events,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: StatTile(
                      label: 'Streak',
                      value: '${profileState.user?.streakDays ?? 0}',
                      color: AppColors.purple,
                      icon: Icons.local_fire_department,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              StreakCalendar(streakDays: profileState.user?.streakDays ?? 0),
              const SizedBox(height: 16),
              const Text(
                'THANH TICH',
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: 20,
                  color: AppColors.textSecondary,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 8),
              BadgeGrid(achievements: profileState.achievements),
              const SizedBox(height: 16),
              const Text(
                'HOAT DONG GAN DAY',
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: 20,
                  color: AppColors.textSecondary,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 8),
              ActivityHistory(activity: profileState.activity),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}
