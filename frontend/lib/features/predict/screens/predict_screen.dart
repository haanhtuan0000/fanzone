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
import '../widgets/waiting_card.dart';
import '../widgets/next_question_strip.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/question.dart';

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
            // Match header
            if (activeMatch != null)
              SliverToBoxAdapter(
                child: Container(
                  margin: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.cardSurface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Expanded(
                        child: Text(activeMatch.homeTeam,
                          style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 13),
                          textAlign: TextAlign.right, maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Text('${activeMatch.homeScore} - ${activeMatch.awayScore}',
                          style: const TextStyle(fontFamily: AppFonts.bebasNeue, color: AppColors.neonGreen, fontSize: 32)),
                      ),
                      Expanded(
                        child: Text(activeMatch.awayTeam,
                          style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 13),
                          textAlign: TextAlign.left, maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                      if (activeMatch.elapsed != null) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.red.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(activeMatch.status == 'HT' ? 'HT' : "${activeMatch.elapsed}'",
                            style: const TextStyle(color: AppColors.red, fontSize: 14, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ],
                  ),
                ),
              ),

            // Progress strip
            if (predictState.progressDots.isNotEmpty)
              SliverToBoxAdapter(
                child: ProgressStrip(
                  dots: predictState.progressDots,
                  totalCoins: predictState.totalCoinsEarned,
                ),
              ),

            // ── DEBUG: All questions for this match ──
            SliverToBoxAdapter(
              child: _sectionDivider('DEBUG — ALL QUESTIONS'),
            ),
            // Active
            if (question != null)
              SliverToBoxAdapter(
                child: _debugQuestionTile(question, 'OPEN'),
              ),
            // Upcoming (PENDING)
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final q = predictState.upcomingQuestions[index];
                  return _debugQuestionTile(q, 'PENDING');
                },
                childCount: predictState.upcomingQuestions.length,
              ),
            ),
            // Answered (LOCKED / RESOLVED / VOIDED)
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (context, index) {
                  final a = answered[index];
                  return _debugQuestionTile(a.question, a.status.toUpperCase(), pick: a.myPickOptionId);
                },
                childCount: answered.length,
              ),
            ),
            SliverToBoxAdapter(
              child: _sectionDivider('END DEBUG'),
            ),
            // ── END DEBUG ──

            // Next question countdown (compact, inline — between questions)
            if ((question == null || predictState.isExpired) &&
                (answered.isNotEmpty || predictState.upcomingQuestions.isNotEmpty))
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

            // When no active question and no answered questions, show waiting strip
            if (question == null && answered.isEmpty && (predictState.upcomingQuestions.isNotEmpty || activeMatch != null))
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

  Widget _debugQuestionTile(Question q, String status, {String? pick}) {
    final statusColor = {
      'OPEN': AppColors.neonGreen,
      'PENDING': AppColors.amber,
      'LOCKED': AppColors.blue,
      'RESOLVED': AppColors.textSecondary,
      'CORRECT': AppColors.neonGreen,
      'WRONG': AppColors.red,
      'VOIDED': AppColors.purple,
      'SKIP': AppColors.textSecondary,
    }[status] ?? AppColors.textSecondary;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: statusColor.withOpacity(0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Status badge + category
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(status,
                  style: TextStyle(color: statusColor, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
              ),
              const SizedBox(width: 8),
              Text(q.category, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
              const SizedBox(width: 8),
              Text(
                "${q.matchMinute ?? '?'}'${q.matchPhase != null ? ' ${q.matchPhase}' : ''}",
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 10, fontFamily: 'monospace'),
              ),
              const Spacer(),
              Text('${q.rewardCoins}c', style: const TextStyle(color: AppColors.amber, fontSize: 10)),
            ],
          ),
          const SizedBox(height: 6),
          // Question text
          Text(q.text, style: const TextStyle(color: AppColors.textPrimary, fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          // Options
          ...q.options.map((o) {
            final isPicked = o.id == pick;
            return Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Row(
                children: [
                  if (isPicked)
                    const Icon(Icons.check_circle, color: AppColors.neonGreen, size: 14)
                  else
                    const Icon(Icons.circle_outlined, color: AppColors.textSecondary, size: 14),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text('${o.emoji ?? ''} ${o.name} (x${o.multiplier.toStringAsFixed(1)})',
                      style: TextStyle(
                        color: isPicked ? AppColors.neonGreen : AppColors.textSecondary,
                        fontSize: 11,
                      )),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
