import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../app/constants.dart';
import '../../live/providers/live_provider.dart';
import '../providers/predict_provider.dart';
import '../widgets/countdown_strip.dart';
import '../widgets/predict_card.dart';
import '../widgets/option_button.dart';
import '../widgets/progress_strip.dart';
import '../widgets/answered_card.dart';
import '../widgets/next_question_strip.dart';
import '../../../core/l10n/app_strings.dart';

class PredictScreen extends ConsumerStatefulWidget {
  const PredictScreen({super.key});

  @override
  ConsumerState<PredictScreen> createState() => _PredictScreenState();
}

class _PredictScreenState extends ConsumerState<PredictScreen> {
  bool _refreshed = false;
  int? _lastFixtureId;

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    final predictState = ref.watch(predictStateProvider);
    final activeMatch = ref.watch(liveStateProvider).activeMatch;

    // Reset refresh flag when match changes
    if (activeMatch != null && activeMatch.fixtureId != _lastFixtureId) {
      _refreshed = false;
      _lastFixtureId = activeMatch.fixtureId;
    }

    // Refresh questions when this screen is shown or match changes
    if (!_refreshed && activeMatch != null && activeMatch.isLive) {
      _refreshed = true;
      Future.microtask(() {
        if (mounted) {
          ref.read(predictStateProvider.notifier).loadQuestions(activeMatch.fixtureId);
        }
      });
    }

    // Show error as snackbar
    ref.listen<PredictState>(predictStateProvider, (prev, next) {
      if (next.error != null && next.error != prev?.error) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.error!), duration: const Duration(seconds: 3)),
        );
      }
      // First prediction bonus toast
      if (next.showFirstPredictionBonus && !(prev?.showFirstPredictionBonus ?? false)) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Text('🎉 ', style: TextStyle(fontSize: 20)),
                Expanded(child: Text(s.firstPredictionBonus)),
              ],
            ),
            backgroundColor: AppColors.neonGreen.withOpacity(0.9),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    });

    final coins = ref.watch(userCoinsProvider);

    if (predictState.isLoading && predictState.activeQuestion == null && predictState.answeredQuestions.isEmpty) {
      return Scaffold(
        appBar: AppBar(
          actions: [_coinBadge(coins)],
        ),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final question = predictState.activeQuestion;
    final answered = predictState.answeredQuestions;
    final pendingCount = answered.where((a) => a.status == 'pending').length;

    return Scaffold(
      appBar: AppBar(
        title: activeMatch != null
            ? Text(
                '${activeMatch.homeTeam} vs ${activeMatch.awayTeam}${activeMatch.elapsed != null ? ' · ${activeMatch.status == "HT" ? "HT" : "${activeMatch.elapsed}\'"}' : ''}',
                style: const TextStyle(
                  fontFamily: AppFonts.barlowCondensed,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                  color: AppColors.textSecondary,
                ),
              )
            : null,
        actions: [_coinBadge(coins)],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          final match = ref.read(liveStateProvider).activeMatch;
          if (match != null) {
            await ref.read(predictStateProvider.notifier).loadQuestions(match.fixtureId);
          }
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            // Progress strip
            if (predictState.progressDots.isNotEmpty)
              SliverToBoxAdapter(
                child: ProgressStrip(
                  dots: predictState.progressDots,
                  totalCoins: predictState.totalCoinsEarned,
                ),
              ),

            // Next question countdown — shown whenever no active question
            if ((question == null || predictState.isExpired) &&
                (answered.isNotEmpty || predictState.upcomingQuestions.isNotEmpty || activeMatch != null))
              SliverToBoxAdapter(
                child: NextQuestionStrip(
                  nextOpensAt: predictState.upcomingQuestions.isNotEmpty
                      ? predictState.upcomingQuestions.first.opensAt
                      : null,
                  matchElapsed: activeMatch?.elapsed,
                  onReady: () {
                    final match = ref.read(liveStateProvider).activeMatch;
                    if (match != null) {
                      ref.read(predictStateProvider.notifier).loadQuestions(match.fixtureId);
                    }
                  },
                ),
              ),

            // Active question section (only if not expired)
            if (question != null && !predictState.isExpired) ...[
              // Section divider
              SliverToBoxAdapter(
                child: _sectionDivider(s.activeQuestion),
              ),

              // Countdown (below divider, directly above question card)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: CountdownStrip(
                    closesAt: question.closesAt,
                    opensAt: question.opensAt,
                    onExpired: () {
                      ref.read(predictStateProvider.notifier).expireQuestion();
                    },
                  ),
                ),
              ),

              // Question card
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: PredictCard(question: question),
                ),
              ),

              // Options
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final option = question.options[index];
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: OptionButton(
                        option: option,
                        isSelected: predictState.selectedOptionId == option.id,
                        isLocked: predictState.isLocked,
                        onTap: () {
                          if (!predictState.isLocked && !predictState.isExpired) {
                            ref.read(predictStateProvider.notifier).selectOption(option.id);
                          }
                        },
                      ),
                    );
                  },
                  childCount: question.options.length,
                ),
              ),

              // Selection indicator
              if (predictState.selectedOptionId != null && !predictState.isExpired)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Text(
                      s.confirmed,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.neonGreen, fontSize: 12),
                    ),
                  ),
                ),

            ],

            // Answered questions section
            if (answered.isNotEmpty) ...[
              // Split into resolved and pending
              if (answered.any((a) => a.status == 'correct' || a.status == 'wrong' || a.status == 'voided'))
                SliverToBoxAdapter(child: _sectionDivider(s.hasResults)),

              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final resolvedList = answered.where((a) => a.status == 'correct' || a.status == 'wrong' || a.status == 'voided').toList();
                    if (index >= resolvedList.length) return null;
                    return AnsweredCard(key: ValueKey(resolvedList[index].question.id), answered: resolvedList[index], index: index + 1);
                  },
                  childCount: answered.where((a) => a.status == 'correct' || a.status == 'wrong' || a.status == 'voided').length,
                ),
              ),

              if (answered.any((a) => a.status == 'pending'))
                SliverToBoxAdapter(
                  child: _sectionDivider(s.waitingResultsCount(pendingCount)),
                ),

              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final pendingList = answered.where((a) => a.status == 'pending').toList();
                    if (index >= pendingList.length) return null;
                    return AnsweredCard(key: ValueKey(pendingList[index].question.id), answered: pendingList[index], index: index + 1);
                  },
                  childCount: answered.where((a) => a.status == 'pending').length,
                ),
              ),

              // Skipped/missed questions intentionally hidden
            ],

            // Bottom padding
            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ),
      ),
    );
  }

  Widget _coinBadge(int coins) {
    return Padding(
      padding: const EdgeInsets.only(right: 16),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.monetization_on, color: AppColors.amber, size: 20),
          const SizedBox(width: 4),
          Text('$coins', style: const TextStyle(fontFamily: AppFonts.bebasNeue, color: AppColors.amber, fontSize: 18)),
        ],
      ),
    );
  }

  Widget _sectionDivider(String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(child: Container(height: 1, color: AppColors.divider)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(label,
              style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 10,
                color: AppColors.textSecondary, letterSpacing: 2)),
          ),
          Expanded(child: Container(height: 1, color: AppColors.divider)),
        ],
      ),
    );
  }

}
