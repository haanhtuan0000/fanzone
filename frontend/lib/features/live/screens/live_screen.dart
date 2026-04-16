import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart' as r;
import '../../../core/models/match.dart';
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
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_shimmer.dart';

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

    // One-shot coin refresh per session. The attempted-flag is flipped
    // SYNCHRONOUSLY (before awaiting) so rebuilds during an in-flight
    // request don't start another one — that would storm /profile/me.
    // On failure (fetched == null) we RELEASE the flag so a subsequent
    // rebuild, lifecycle resume, or socket tick can retry; otherwise a
    // single cold-start failure would leave coins stuck at 0 until the
    // user manually pulls to refresh.
    if (!ref.read(coinsFetchAttemptedProvider)) {
      ref.read(coinsFetchAttemptedProvider.notifier).state = true;
      Future.microtask(() async {
        final fetched = await ref.read(authStateProvider.notifier).fetchCoins();
        ref.read(userCoinsProvider.notifier).state =
            applyFetchedCoins(ref.read(userCoinsProvider), fetched);
        if (fetched == null) {
          ref.read(coinsFetchAttemptedProvider.notifier).state = false;
        }
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
            padding: EdgeInsets.only(right: r.s(context, 16)),
            child: CoinDisplay(coins: coins),
          ),
        ],
      ),
      body: Stack(
        children: [
          RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(liveStateProvider);
          final fetched = await ref.read(authStateProvider.notifier).fetchCoins();
          ref.read(userCoinsProvider.notifier).state =
              applyFetchedCoins(ref.read(userCoinsProvider), fetched);
        },
        child: CustomScrollView(
          slivers: [
            // Refresh indicator (thin bar at top)
            if (liveState.isRefreshing)
              const SliverToBoxAdapter(
                child: LinearProgressIndicator(minHeight: 2, color: AppColors.neonGreen),
              ),

            // Hero: scoreboard for any active match
            if (liveState.activeMatch != null) ...[
              SliverToBoxAdapter(
                child: Padding(
                  padding: r.sLTRB(context, 16, 8, 16, 0),
                  child: Scoreboard(match: liveState.activeMatch!),
                ),
              ),

              // Predict preview card — only for live matches
              if (liveState.activeMatch!.isLive) ...[
                if (predictState.isLoading)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: r.sLTRB(context, 16, 12, 16, 0),
                      child: Container(
                        padding: r.sa(context, 20),
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
                else ...[
                  SliverToBoxAdapter(
                    child: _sectionHeader(
                      context: context,
                      icon: Icons.sports_soccer,
                      title: s.predictThisMatch,
                      trailing: s.goPredict,
                      color: AppColors.amber,
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: r.sLTRB(context, 16, 0, 16, 0),
                      child: PredictBanner(
                        activeQuestion: predictState.activeQuestion,
                        nextOpensAt: predictState.upcomingQuestions.isNotEmpty
                            ? predictState.upcomingQuestions.first.opensAt
                            : predictState.nextEstimatedAt,
                      ),
                    ),
                  ),
                ],
              ],
            ],

            // Loading shimmer on cold start
            if (liveState.isLoading)
              SliverToBoxAdapter(
                child: Padding(
                  padding: r.sa(context, 14),
                  child: Column(
                    children: List.generate(3, (_) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: LoadingShimmer(height: r.s(context, 80)),
                    )),
                  ),
                ),
              ),

            // Empty state when no matches (only after loading completes)
            if (!liveState.isLoading && liveState.activeMatch == null && liveState.matches.isEmpty)
              SliverFillRemaining(
                child: EmptyState(
                  icon: '📺',
                  title: s.noLiveMatches,
                  subtitle: s.comeBackLater,
                ),
              ),

            // ── 3 CATEGORY SECTIONS (Design v4.0) ──
            // Each category is its own card container with distinct color and behavior.

            // ── CATEGORY 1: ĐANG DIỄN RA (LIVE) — red ──
            if (liveState.liveMatches.isNotEmpty)
              SliverToBoxAdapter(
                child: Container(
                  margin: r.sLTRB(context, 12, 12, 12, 0),
                  decoration: BoxDecoration(
                    color: AppColors.cardSurface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: Column(
                    children: [
                      _matchSectionHeader(
                        context: context,
                        dotColor: AppColors.red,
                        dotAnimated: true,
                        label: s.liveMatches,
                        count: liveState.liveMatches.length,
                        isExpanded: liveState.liveExpanded,
                        showButton: liveState.liveMatches.length > 4,
                        buttonColor: AppColors.neonGreen,
                        onToggle: () => ref.read(liveStateProvider.notifier).toggleLiveExpanded(),
                        s: s,
                      ),
                      Padding(
                        padding: r.sLTRB(context, 12, 0, 12, 12),
                        child: _groupedMatchList(
                          context: context,
                          matches: liveState.displayedLiveMatches,
                          selectedId: liveState.activeMatch?.fixtureId,
                          onTap: (match) => ref.read(liveStateProvider.notifier).selectMatch(match),
                          onPredictTap: (match) {
                            ref.read(liveStateProvider.notifier).selectMatch(match);
                            context.go('/predict');
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // ── CATEGORY 2: ĐÃ TRẢ LỜI (Answered FT) — neon ──
            if (liveState.answeredMatches.isNotEmpty)
              SliverToBoxAdapter(
                child: Container(
                  margin: r.sLTRB(context, 12, 12, 12, 0),
                  decoration: BoxDecoration(
                    color: AppColors.cardSurface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.neonGreen.withOpacity(0.15)),
                  ),
                  child: Column(
                    children: [
                      _matchSectionHeader(
                        context: context,
                        dotColor: AppColors.neonGreen,
                        dotAnimated: false,
                        label: 'ANSWERED',
                        count: liveState.answeredMatches.length,
                        isExpanded: liveState.answeredExpanded,
                        showButton: liveState.answeredMatches.length > 2,
                        buttonColor: AppColors.neonGreen,
                        onToggle: () => ref.read(liveStateProvider.notifier).toggleAnsweredExpanded(),
                        s: s,
                      ),
                      Padding(
                        padding: r.sLTRB(context, 12, 0, 12, 12),
                        child: _groupedMatchList(
                          context: context,
                          matches: liveState.displayedAnsweredMatches,
                          onTap: (match) {
                            context.push('/match/${match.fixtureId}', extra: match);
                          },
                          predictionSummaries: liveState.predictionSummaries,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // ── CATEGORY 3: CHƯA ĐÁ (Not Started) — amber ──
            if (liveState.notStartedMatches.isNotEmpty)
              SliverToBoxAdapter(
                child: Container(
                  margin: r.sLTRB(context, 12, 12, 12, 0),
                  decoration: BoxDecoration(
                    color: AppColors.cardSurface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: Column(
                    children: [
                      _matchSectionHeader(
                        context: context,
                        dotColor: AppColors.amber,
                        dotAnimated: false,
                        label: s.todayMatches,
                        count: liveState.notStartedMatches.length,
                        isExpanded: liveState.notStartedExpanded,
                        showButton: liveState.notStartedMatches.length > 2,
                        buttonColor: AppColors.amber,
                        onToggle: () => ref.read(liveStateProvider.notifier).toggleNotStartedExpanded(),
                        s: s,
                      ),
                      Padding(
                        padding: r.sLTRB(context, 12, 0, 12, 12),
                        child: _groupedMatchList(
                          context: context,
                          matches: liveState.displayedNotStartedMatches,
                          onTap: (match) {
                            context.push('/match-info/${match.fixtureId}', extra: match);
                          },
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            SliverToBoxAdapter(child: SizedBox(height: r.s(context, 24))),
          ],
        ),
      ),
      // Tutorial overlay
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

  Widget _matchSectionHeader({
    required BuildContext context,
    required Color dotColor,
    required bool dotAnimated,
    required String label,
    required int count,
    required bool isExpanded,
    required bool showButton,
    required Color buttonColor,
    required VoidCallback onToggle,
    required dynamic s,
  }) {
    return Padding(
      padding: r.sLTRB(context, 15, 14, 15, 7),
      child: Row(
        children: [
          // Dot
          Container(
            width: 5, height: 5,
            decoration: BoxDecoration(shape: BoxShape.circle, color: dotColor),
          ),
          const SizedBox(width: 7),
          // Label
          Text(label,
            style: TextStyle(
              fontFamily: AppFonts.barlowCondensed,
              fontSize: r.sf(context, 10),
              fontWeight: FontWeight.w700,
              letterSpacing: 2,
              color: AppColors.textSecondary.withOpacity(0.7),
            )),
          const Spacer(),
          // See all / Collapse button
          if (showButton)
            GestureDetector(
              onTap: onToggle,
              child: Container(
                padding: r.sp(context, h: 8, v: 3),
                decoration: BoxDecoration(
                  color: buttonColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(7),
                  border: Border.all(color: buttonColor.withOpacity(0.18)),
                ),
                child: Text(
                  isExpanded ? s.collapse : s.seeAllCount(count),
                  style: TextStyle(
                    fontFamily: AppFonts.barlowCondensed,
                    fontSize: r.sf(context, 10),
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                    color: buttonColor,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _sectionHeader({
    required BuildContext context,
    required IconData icon,
    required String title,
    String? trailing,
    required Color color,
  }) {
    return Padding(
      padding: r.sLTRB(context, 16, 16, 16, 8),
      child: Row(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            title,
            style: TextStyle(
              fontFamily: AppFonts.barlowCondensed,
              fontSize: r.sf(context, 10),
              fontWeight: FontWeight.w700,
              color: color,
              letterSpacing: 2,
            ),
          ),
          const Spacer(),
          if (trailing != null)
            Text(
              trailing,
              style: TextStyle(
                fontSize: r.sf(context, 12),
                color: color,
                fontWeight: FontWeight.w500,
              ),
            ),
        ],
      ),
    );
  }

  Widget _groupedMatchList({
    required BuildContext context,
    required List<MatchData> matches,
    int? selectedId,
    required void Function(MatchData) onTap,
    void Function(MatchData)? onPredictTap,
    bool dimFinished = false,
    Map<int, PredictionSummary>? predictionSummaries,
  }) {
    // Group by league name, preserve order
    final groups = <String, List<MatchData>>{};
    for (final match in matches) {
      final league = match.league ?? 'Other';
      groups.putIfAbsent(league, () => []).add(match);
    }

    final children = <Widget>[];
    for (final entry in groups.entries) {
      // League header
      final firstMatch = entry.value.first;
      children.add(Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 6),
        child: Row(
          children: [
            if (firstMatch.leagueLogoUrl != null) ...[
              CachedNetworkImage(
                imageUrl: firstMatch.leagueLogoUrl!,
                width: r.s(context, 16),
                height: r.s(context, 16),
                errorWidget: (_, __, ___) => Icon(Icons.emoji_events, size: r.s(context, 14), color: AppColors.textSecondary),
              ),
              const SizedBox(width: 6),
            ],
            Expanded(
              child: Text(
                '${entry.key}${firstMatch.leagueRound != null ? ' \u00b7 ${firstMatch.leagueRound}' : ''}',
                style: TextStyle(
                  fontFamily: AppFonts.barlowCondensed,
                  fontSize: r.sf(context, 10),
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.5,
                  color: AppColors.textSecondary.withOpacity(0.6),
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ));

      // Matches in this league
      for (final match in entry.value) {
        final isFt = match.status == 'FT' || match.status == 'AET' || match.status == 'PEN';
        final summary = predictionSummaries?[match.fixtureId];
        children.add(Padding(
          padding: const EdgeInsets.only(bottom: 7),
          child: Opacity(
            opacity: dimFinished && isFt ? 0.68 : 1.0,
            child: MatchCard(
              match: match,
              isSelected: match.fixtureId == selectedId,
              onTap: () => onTap(match),
              onPredictTap: onPredictTap == null ? null : () => onPredictTap(match),
              predictionSummary: summary,
            ),
          ),
        ));
      }
    }

    return Column(children: children);
  }
}
