import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../live/providers/live_provider.dart';
import '../providers/leaderboard_provider.dart';
import '../widgets/filter_tabs.dart';
import '../widgets/podium_top3.dart';
import '../widgets/my_position_card.dart';
import '../../../core/l10n/app_strings.dart';
import '../widgets/rank_row.dart';
import '../widgets/mini_profile_modal.dart';

class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  void _showRivalProfile(BuildContext context, WidgetRef ref, String userId) async {
    try {
      final apiClient = ref.read(apiClientProvider);
      final response = await apiClient.get(ApiEndpoints.profileUser(userId));
      final data = response.data as Map<String, dynamic>;
      if (!context.mounted) return;
      MiniProfileModal.show(
        context,
        displayName: data['displayName'] as String? ?? 'Unknown',
        avatarEmoji: data['avatarEmoji'] as String? ?? '⚽',
        level: data['level'] as int? ?? 1,
        title: data['titleEn'] as String? ?? data['titleVi'] as String? ?? 'Fan',
        accuracy: data['accuracy'] as int? ?? 0,
        totalPredictions: data['totalPredictions'] as int? ?? 0,
        countryCode: data['countryCode'] as String?,
        streakDays: data['streakDays'] as int? ?? 0,
      );
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final str = AppStrings.current;
    final lbState = ref.watch(leaderboardStateProvider);
    final activeMatch = ref.watch(liveStateProvider).activeMatch;

    // Build subtitle for match scope
    String? subtitle;
    if (lbState.scope == 'match' && activeMatch != null) {
      subtitle = '${activeMatch.homeTeam} vs ${activeMatch.awayTeam}';
    }

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(str.leaderboard),
            if (subtitle != null)
              Text(
                subtitle,
                style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 12)),
              ),
          ],
        ),
      ),
      body: Column(
        children: [
          FilterTabs(
            selectedScope: lbState.scope,
            countryCode: lbState.userCountryCode,
            onScopeChanged: (scope) {
              ref.read(leaderboardStateProvider.notifier).setScope(scope);
            },
          ),
          Expanded(
            child: lbState.isLoading
                ? const Center(child: CircularProgressIndicator())
                : lbState.entries.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.emoji_events, size: s(context, 64), color: AppColors.textSecondary.withOpacity(0.5)),
                            SizedBox(height: s(context, 16)),
                            Text(
                              str.noData,
                              style: const TextStyle(color: AppColors.textSecondary),
                            ),
                            SizedBox(height: s(context, 8)),
                            Text(
                              str.predictToRank,
                              style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 14)),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () async {
                          await ref.read(leaderboardStateProvider.notifier).loadLeaderboard();
                        },
                        child: ListView(
                          padding: sa(context, 16),
                          children: [
                            if (lbState.entries.length >= 3)
                              PodiumTop3(entries: lbState.entries.take(3).toList()),
                            SizedBox(height: s(context, 16)),
                            if (lbState.myRank != null)
                              MyPositionCard(
                                rank: lbState.myRank!,
                                coins: lbState.myCoins ?? 0,
                                delta: lbState.myDelta ?? 0,
                                scopeLabel: lbState.scope == 'country' ? lbState.userCountryCode : null,
                              ),
                            SizedBox(height: s(context, 16)),
                            // Show ALL entries in list (including top 3)
                            ...lbState.entries.map((entry) {
                              final isMe = entry.userId == lbState.myUserId;
                              return RankRow(
                                entry: entry,
                                isMe: isMe,
                                onTap: isMe ? null : () => _showRivalProfile(context, ref, entry.userId),
                              );
                            }),
                          ],
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
