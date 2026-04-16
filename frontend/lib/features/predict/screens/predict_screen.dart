import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../live/providers/live_provider.dart';
import '../providers/predict_provider.dart';
import '../widgets/countdown_strip.dart';
import '../widgets/predict_card.dart';
import '../widgets/option_button.dart';
import '../widgets/progress_strip.dart';
import '../../../shared/widgets/empty_state.dart';
import '../widgets/answered_card.dart';
import '../widgets/next_question_strip.dart';
import '../widgets/match_info_strip.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/question.dart';

class PredictScreen extends ConsumerStatefulWidget {
  const PredictScreen({super.key});

  @override
  ConsumerState<PredictScreen> createState() => _PredictScreenState();
}

class _PredictScreenState extends ConsumerState<PredictScreen> {
  @override
  Widget build(BuildContext context) {
    final str = AppStrings.current;
    final predictState = ref.watch(predictStateProvider);
    final activeMatch = ref.watch(liveStateProvider).activeMatch;

    // Load questions if state doesn't match current match
    if (activeMatch != null && activeMatch.isLive && predictState.fixtureId != activeMatch.fixtureId) {
      Future.microtask(() {
        if (mounted) {
          ref.read(predictStateProvider.notifier).loadQuestions(activeMatch.fixtureId);
        }
      });
    }

    final stateMatchesCurrent = predictState.fixtureId != null &&
        activeMatch != null &&
        predictState.fixtureId == activeMatch.fixtureId;

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
                Text('🎉 ', style: TextStyle(fontSize: sf(context, 20))),
                Expanded(child: Text(str.firstPredictionBonus)),
              ],
            ),
            backgroundColor: AppColors.neonGreen.withOpacity(0.9),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    });

    final coins = ref.watch(userCoinsProvider);

    // No live match — show empty state instead of infinite spinner
    if (activeMatch == null || !activeMatch.isLive) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(
          child: EmptyState(
            icon: '⚡',
            title: str.waitingForNewQuestion,
            subtitle: str.comeBackLater,
          ),
        ),
      );
    }

    if (!stateMatchesCurrent || (predictState.isLoading && predictState.activeQuestion == null && predictState.answeredQuestions.isEmpty)) {
      return Scaffold(
        appBar: AppBar(
          actions: [_coinBadge(context, coins)],
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
                '${_abbreviate(activeMatch.homeTeam)} vs ${_abbreviate(activeMatch.awayTeam)} · ${activeMatch.status == "HT" ? "HT" : "${activeMatch.elapsed ?? ""}\'"}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: AppFonts.barlowCondensed,
                  fontSize: sf(context, 12),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.5,
                  color: AppColors.textSecondary,
                ),
              )
            : null,
        actions: [
          Padding(
            padding: EdgeInsets.only(right: s(context, 16)),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // Top row: total balance (amber)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.monetization_on, color: AppColors.amber, size: 16),
                    const SizedBox(width: 3),
                    Text('$coins',
                      style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: sf(context, 16),
                        color: AppColors.amber, letterSpacing: 0.5)),
                  ],
                ),
                // Bottom row: this match earnings — sign + color reflect win/loss state
                Builder(builder: (_) {
                  final earned = predictState.totalCoinsEarned;
                  final isPositive = earned >= 0;
                  return Text(
                    '${isPositive ? "+" : ""}$earned this match',
                    style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 9),
                      fontWeight: FontWeight.w700,
                      color: isPositive ? AppColors.neonGreen : AppColors.red,
                      letterSpacing: 0.4),
                  );
                }),
              ],
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Match Info Strip — fixed above scrollable questions (Design v4.0)
          if (activeMatch != null)
            MatchInfoStrip(match: activeMatch),
          Expanded(
            child: RefreshIndicator(
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
                  // Only count down to REAL pending questions — never use
                  // nextEstimatedAt (a guess from phase boundaries). The
                  // estimate can promise "5s" when no question has been
                  // generated yet, producing the "5s → Loading → 13 min"
                  // whiplash observed on fixture 1416165.
                  nextOpensAt: predictState.upcomingQuestions.isNotEmpty
                      ? predictState.upcomingQuestions.first.opensAt
                      : null,
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
                child: _sectionDivider(context, str.activeQuestion),
              ),

              // Countdown (below divider, directly above question card)
              SliverToBoxAdapter(
                child: Padding(
                  padding: sLTRB(context, 16, 0, 16, 8),
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
                  padding: sp(context, h: 16),
                  child: PredictCard(question: question),
                ),
              ),

              // Options
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final option = question.options[index];
                    return Padding(
                      padding: sLTRB(context, 16, 0, 16, 8),
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
                    padding: sp(context, h: 16, v: 4),
                    child: Text(
                      str.confirmed,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.neonGreen, fontSize: sf(context, 12)),
                    ),
                  ),
                ),

            ],

            // Answered questions section
            if (answered.isNotEmpty) ...[
              // Split into resolved and pending
              if (answered.any((a) => a.status == 'correct' || a.status == 'wrong' || a.status == 'voided'))
                SliverToBoxAdapter(child: _sectionDivider(context, str.hasResults)),

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
                  child: _sectionDivider(context, str.waitingResultsCount(pendingCount)),
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

            // ── DEBUG: All questions for this match (sorted by matchMinute desc) ──
            ..._buildDebugSection(context, question, predictState, answered),

            // Bottom padding
            SliverToBoxAdapter(child: SizedBox(height: s(context, 24))),
          ],
        ),
      ),
          ), // Expanded
        ], // Column children
      ), // Column (body)
    );
  }

  Widget _coinBadge(BuildContext context, int coins) {
    return Padding(
      padding: EdgeInsets.only(right: s(context, 16)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.monetization_on, color: AppColors.amber, size: s(context, 20)),
          const SizedBox(width: 4),
          Text('$coins', style: TextStyle(fontFamily: AppFonts.bebasNeue, color: AppColors.amber, fontSize: sf(context, 18))),
        ],
      ),
    );
  }

  List<Widget> _buildDebugSection(BuildContext context, Question? question, PredictState predictState, List<AnsweredQuestion> answered) {
    final debugEntries = <({Question q, String status, String? pick})>[];
    if (question != null) {
      debugEntries.add((q: question, status: 'OPEN', pick: null));
    }
    for (final u in predictState.upcomingQuestions) {
      debugEntries.add((q: u, status: 'PENDING', pick: null));
    }
    for (final a in answered) {
      debugEntries.add((q: a.question, status: a.status.toUpperCase(), pick: a.myPickOptionId));
    }
    debugEntries.sort((a, b) => (b.q.matchMinute ?? 0).compareTo(a.q.matchMinute ?? 0));
    return [
      SliverToBoxAdapter(child: _sectionDivider(context, 'DEBUG — ALL QUESTIONS')),
      SliverList(
        delegate: SliverChildBuilderDelegate(
          (context, index) {
            final e = debugEntries[index];
            return _debugQuestionTile(context, e.q, e.status, pick: e.pick);
          },
          childCount: debugEntries.length,
        ),
      ),
      SliverToBoxAdapter(child: _sectionDivider(context, 'END DEBUG')),
    ];
  }

  Widget _debugQuestionTile(BuildContext context, Question q, String status, {String? pick}) {
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
      margin: sLTRB(context, 16, 0, 16, 8),
      padding: sa(context, 12),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: statusColor.withOpacity(0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: sp(context, h: 6, v: 2),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(status,
                  style: TextStyle(color: statusColor, fontSize: sf(context, 10), fontWeight: FontWeight.bold, letterSpacing: 1)),
              ),
              const SizedBox(width: 8),
              Text(q.category, style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 10))),
              const SizedBox(width: 8),
              Text(
                "${q.matchMinute ?? '?'}'${q.matchPhase != null ? ' ${q.matchPhase}' : ''} · ${q.opensAt.toLocal().hour.toString().padLeft(2,'0')}:${q.opensAt.toLocal().minute.toString().padLeft(2,'0')}:${q.opensAt.toLocal().second.toString().padLeft(2,'0')}",
                style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 10), fontFamily: 'monospace'),
              ),
              const Spacer(),
              Text('${q.rewardCoins}c', style: TextStyle(color: AppColors.amber, fontSize: sf(context, 10))),
            ],
          ),
          const SizedBox(height: 6),
          Text(q.text, style: TextStyle(color: AppColors.textPrimary, fontSize: sf(context, 13), fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
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
                        fontSize: sf(context, 11),
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

  Widget _sectionDivider(BuildContext context, String label) {
    return Padding(
      padding: sp(context, h: 16, v: 10),
      child: Row(
        children: [
          Expanded(child: Container(height: 1, color: AppColors.divider)),
          Padding(
            padding: sp(context, h: 8),
            child: Text(label,
              style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: sf(context, 10),
                color: AppColors.textSecondary, letterSpacing: 2)),
          ),
          Expanded(child: Container(height: 1, color: AppColors.divider)),
        ],
      ),
    );
  }

  /// Abbreviate team name for the compact AppBar title. The Match Info Strip
  /// below shows the full names; the AppBar just needs enough context so the
  /// user knows which match they're on without the minute being cut off.
  String _abbreviate(String name) {
    // If short enough, keep as-is
    if (name.length <= 10) return name;
    // Try first word (e.g. "Kansanshi Dynamos" → "Kansanshi")
    final firstWord = name.split(' ').first;
    if (firstWord.length >= 3) return firstWord;
    return name.substring(0, 10);
  }
}
