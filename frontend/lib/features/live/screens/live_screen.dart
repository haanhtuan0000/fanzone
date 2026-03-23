import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../app/constants.dart';
import '../../../shared/widgets/coin_display.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../../../core/models/match.dart';
import '../../predict/providers/predict_provider.dart';
import '../providers/live_provider.dart';
import '../widgets/scoreboard.dart';
import '../widgets/stats_grid.dart';
import '../widgets/fan_support_bar.dart';
import '../widgets/predict_banner.dart';
import '../../../core/l10n/app_strings.dart';
import '../widgets/match_card.dart';

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
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(liveStateProvider);
          final c = await ref.read(authStateProvider.notifier).fetchCoins();
          if (c > 0) ref.read(userCoinsProvider.notifier).state = c;
        },
        child: CustomScrollView(
          slivers: [
            // Active match scoreboard — only for live matches
            if (liveState.activeMatch != null && liveState.activeMatch!.isLive) ...[
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Scoreboard(match: liveState.activeMatch!),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: StatsGrid(match: liveState.activeMatch!),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: FanSupportBar(
                    homePercent: _parsePossession(liveState.activeMatch!),
                  ),
                ),
              ),
              if (predictState.activeQuestion != null || predictState.answeredQuestions.isNotEmpty || predictState.upcomingQuestions.isNotEmpty)
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.all(16),
                    child: PredictBanner(),
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
            // Live matches section
            if (liveState.liveMatches.isNotEmpty) ...[
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: Text(
                    s.liveMatches,
                    style: const TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 20,
                      color: AppColors.neonGreen,
                      letterSpacing: 2,
                    ),
                  ),
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
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                  child: Text(
                    s.todayMatches,
                    style: const TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 20,
                      color: AppColors.textSecondary,
                      letterSpacing: 2,
                    ),
                  ),
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
                        onTap: () {}, // Non-live matches are view-only
                      ),
                    );
                  },
                  childCount: liveState.upcomingMatches.length,
                ),
              ),
            ],
            const SliverToBoxAdapter(child: SizedBox(height: 16)),
          ],
        ),
      ),
    );
  }

  int _parsePossession(MatchData match) {
    final possession = match.statistics?['possession'];
    if (possession == null) return 50;
    final homeStr = (possession['home'] as String?) ?? '50%';
    return int.tryParse(homeStr.replaceAll('%', '')) ?? 50;
  }
}
