import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../app/constants.dart';
import '../providers/leaderboard_provider.dart';
import '../widgets/filter_tabs.dart';
import '../widgets/podium_top3.dart';
import '../widgets/my_position_card.dart';
import '../widgets/rank_row.dart';

class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lbState = ref.watch(leaderboardStateProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('BANG XEP HANG')),
      body: Column(
        children: [
          FilterTabs(
            selectedScope: lbState.scope,
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
                            Icon(Icons.emoji_events, size: 64, color: AppColors.textSecondary.withOpacity(0.5)),
                            const SizedBox(height: 16),
                            const Text(
                              'Chua co du lieu',
                              style: TextStyle(color: AppColors.textSecondary),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Du doan de len bang xep hang!',
                              style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () async {
                          await ref.read(leaderboardStateProvider.notifier).loadLeaderboard();
                        },
                        child: ListView(
                          padding: const EdgeInsets.all(16),
                          children: [
                            if (lbState.entries.length >= 3)
                              PodiumTop3(entries: lbState.entries.take(3).toList()),
                            const SizedBox(height: 16),
                            if (lbState.myRank != null)
                              MyPositionCard(
                                rank: lbState.myRank!,
                                coins: lbState.myCoins ?? 0,
                                delta: lbState.myDelta ?? 0,
                              ),
                            const SizedBox(height: 16),
                            ...lbState.entries.skip(3).map((entry) {
                              return RankRow(entry: entry);
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
