import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../app/constants.dart';
import '../../../shared/widgets/coin_display.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../../predict/providers/predict_provider.dart';
import '../providers/live_provider.dart';
import '../widgets/scoreboard.dart';
import '../widgets/predict_banner.dart';
import '../../../core/l10n/app_strings.dart';
import '../widgets/match_card.dart';
import '../../../core/storage/secure_storage.dart';
import '../../../shared/widgets/tutorial_overlay.dart';

/// Tracks whether tutorial overlay should be visible
final _showTutorialProvider = StateProvider<bool>((ref) => false);
final _tutorialCheckedProvider = StateProvider<bool>((ref) => false);

class LiveScreen extends ConsumerWidget {
  const LiveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = AppStrings.current;
    final liveState = ref.watch(liveStateProvider);
    final predictState = ref.watch(predictStateProvider);
    final coins = ref.watch(userCoinsProvider);

    // Fetch coins once if not loaded yet
    if (coins == 0) {
      Future.microtask(() async {
        final c = await ref.read(authStateProvider.notifier).fetchCoins();
        if (c > 0) ref.read(userCoinsProvider.notifier).state = c;
      });
    }

    // Check tutorial once per session
    final tutorialChecked = ref.watch(_tutorialCheckedProvider);
    final showTutorial = ref.watch(_showTutorialProvider);
    if (!tutorialChecked) {
      Future.microtask(() async {
        ref.read(_tutorialCheckedProvider.notifier).state = true;
        final storage = ref.read(secureStorageProvider);
        final complete = await storage.isTutorialComplete();
        if (!complete) {
          ref.read(_showTutorialProvider.notifier).state = true;
        }
      });
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('FANZONE'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: CoinDisplay(coins: coins),
          ),
        ],
      ),
      body: Stack(
        children: [
          RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(liveStateProvider);
          final c = await ref.read(authStateProvider.notifier).fetchCoins();
          if (c > 0) ref.read(userCoinsProvider.notifier).state = c;
        },
        child: CustomScrollView(
          slivers: [
            // Hero: integrated scoreboard (score + stats + fan bar)
            if (liveState.activeMatch != null && liveState.activeMatch!.isLive) ...[
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Scoreboard(match: liveState.activeMatch!),
                ),
              ),

              // Predict preview card — show loading or banner
              if (predictState.isLoading)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppColors.cardSurface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.divider),
                      ),
                      child: const Center(
                        child: SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.neonGreen),
                        ),
                      ),
                    ),
                  ),
                )
              else
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: PredictBanner(
                      activeQuestion: predictState.activeQuestion,
                      nextOpensAt: predictState.upcomingQuestions.isNotEmpty
                          ? predictState.upcomingQuestions.first.opensAt
                          : null,
                      matchElapsed: liveState.activeMatch?.elapsed,
                    ),
                  ),
                ),
            ],

            // Empty state when no matches
            if (liveState.activeMatch == null && liveState.matches.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.sports_soccer, size: 64, color: AppColors.textSecondary.withOpacity(0.5)),
                      const SizedBox(height: 16),
                      Text(
                        s.noLiveMatches,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 16),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        s.comeBackLater,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                      ),
                    ],
                  ),
                ),
              ),

            // Live matches section: ⚡ LIVE NOW ... See all
            if (liveState.liveMatches.isNotEmpty) ...[
              SliverToBoxAdapter(
                child: _sectionHeader(
                  icon: Icons.bolt,
                  title: s.liveMatches,
                  trailing: s.seeAll,
                  color: AppColors.neonGreen,
                ),
              ),
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final match = liveState.liveMatches[index];
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      child: MatchCard(
                        match: match,
                        isSelected: match.fixtureId == liveState.activeMatch?.fixtureId,
                        onTap: () => ref.read(liveStateProvider.notifier).selectMatch(match),
                      ),
                    );
                  },
                  childCount: liveState.liveMatches.length,
                ),
              ),
            ],

            // Today's upcoming matches section
            if (liveState.upcomingMatches.isNotEmpty) ...[
              SliverToBoxAdapter(
                child: _sectionHeader(
                  icon: Icons.calendar_today,
                  title: s.todayMatches,
                  color: AppColors.textSecondary,
                ),
              ),
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final match = liveState.upcomingMatches[index];
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      child: MatchCard(
                        match: match,
                        isSelected: false,
                        onTap: () {},
                      ),
                    );
                  },
                  childCount: liveState.upcomingMatches.length,
                ),
              ),
            ],

            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ),
      ),
      // Tutorial overlay — rendered inside Stack, not as a dialog
      if (showTutorial)
        TutorialOverlay(
          onComplete: () {
            ref.read(_showTutorialProvider.notifier).state = false;
            ref.read(secureStorageProvider).setTutorialComplete();
          },
        ),
        ],
      ),
    );
  }

  Widget _sectionHeader({
    required IconData icon,
    required String title,
    String? trailing,
    required Color color,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            title,
            style: TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: 14,
              color: color,
              letterSpacing: 1.5,
            ),
          ),
          const Spacer(),
          if (trailing != null)
            Text(
              trailing,
              style: TextStyle(
                fontSize: 12,
                color: color,
                fontWeight: FontWeight.w500,
              ),
            ),
        ],
      ),
    );
  }
}
