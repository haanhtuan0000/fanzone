import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../app/constants.dart';
import '../../live/providers/live_provider.dart';
import '../providers/feed_provider.dart';
import '../widgets/online_counter.dart';
import '../widgets/feed_card_correct.dart';
import '../widgets/feed_card_wrong.dart';
import '../widgets/feed_card_rank.dart';
import '../../../core/l10n/app_strings.dart';
import '../widgets/feed_card_system.dart';

class FeedScreen extends ConsumerWidget {
  const FeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = AppStrings.current;
    final feedState = ref.watch(feedStateProvider);
    final liveState = ref.watch(liveStateProvider);

    return Scaffold(
      appBar: AppBar(title: Text(s.activity)),
      body: Column(
        children: [
          OnlineCounter(count: liveState.liveMatches.length),
          Expanded(
            child: feedState.isLoading && feedState.events.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : feedState.events.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.local_fire_department, size: 64,
                                color: AppColors.textSecondary.withOpacity(0.5)),
                            const SizedBox(height: 16),
                            Text(
                              s.noActivity,
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 16),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: () async {
                          final match = liveState.activeMatch;
                          if (match != null) {
                            await ref.read(feedStateProvider.notifier).loadFeed(match.fixtureId);
                          }
                        },
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: feedState.events.length,
                          itemBuilder: (context, index) {
                            final event = feedState.events[index];
                            switch (event.type) {
                              case 'CORRECT':
                                return FeedCardCorrect(event: event);
                              case 'WRONG':
                                return FeedCardWrong(event: event);
                              case 'RANK_CHANGE':
                                return FeedCardRank(event: event);
                              case 'SYSTEM':
                              default:
                                return FeedCardSystem(event: event);
                            }
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
