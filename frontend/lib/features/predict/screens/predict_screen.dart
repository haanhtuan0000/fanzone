import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../app/constants.dart';
import '../../live/providers/live_provider.dart';
import '../providers/predict_provider.dart';
import '../widgets/countdown_strip.dart';
import '../widgets/predict_card.dart';
import '../widgets/option_button.dart';
import '../widgets/coin_stake_display.dart';
import '../widgets/question_queue.dart';
import '../widgets/progress_strip.dart';
import '../widgets/answered_card.dart';
import '../widgets/no_question_banner.dart';
import '../../../core/l10n/app_strings.dart';

class PredictScreen extends ConsumerWidget {
  const PredictScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = AppStrings.current;
    final predictState = ref.watch(predictStateProvider);
    final activeMatch = ref.watch(liveStateProvider).activeMatch;

    if (predictState.isLoading && predictState.activeQuestion == null && predictState.answeredQuestions.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('PREDICT')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final question = predictState.activeQuestion;
    final answered = predictState.answeredQuestions;
    final pendingCount = answered.where((a) => a.status == 'pending').length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('PREDICT'),
        actions: [
          if (activeMatch != null)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Center(
                child: Text(
                  '${activeMatch.homeTeam} ${activeMatch.homeScore}-${activeMatch.awayScore} ${activeMatch.awayTeam}',
                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ),
            ),
        ],
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
                  margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppColors.cardSurface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.divider),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(activeMatch.homeTeam,
                        style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 14)),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Text('${activeMatch.homeScore} - ${activeMatch.awayScore}',
                          style: const TextStyle(fontFamily: AppFonts.bebasNeue, color: AppColors.neonGreen, fontSize: 22)),
                      ),
                      Text(activeMatch.awayTeam,
                        style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 14)),
                      if (activeMatch.elapsed != null) ...[
                        const SizedBox(width: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.red.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text("${activeMatch.elapsed}'",
                            style: const TextStyle(color: AppColors.red, fontSize: 12, fontWeight: FontWeight.bold)),
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

            // Active question section
            if (question != null) ...[
              // Countdown
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: CountdownStrip(
                    closesAt: question.closesAt,
                    opensAt: question.opensAt,
                    onExpired: () {
                      ref.read(predictStateProvider.notifier).expireQuestion();
                    },
                  ),
                ),
              ),

              // Section divider
              SliverToBoxAdapter(
                child: _sectionDivider(s.activeQuestion),
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

              // Stake + Confirm button
              if (predictState.selectedOptionId != null && !predictState.isExpired)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Column(
                      children: [
                        CoinStakeDisplay(
                          coinsBet: 50, // Fixed 50 coins per question
                          multiplier: question.options
                              .firstWhere((o) => o.id == predictState.selectedOptionId,
                                orElse: () => question.options.first)
                              .multiplier,
                        ),
                        const SizedBox(height: 12),
                        if (!predictState.isLocked)
                          SizedBox(
                            width: double.infinity,
                            height: 48,
                            child: ElevatedButton(
                              onPressed: () {
                                ref.read(predictStateProvider.notifier).confirmPrediction();
                              },
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.neonGreen,
                                foregroundColor: Colors.black,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                textStyle: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 16, letterSpacing: 1),
                              ),
                              child: Text(s.confirmBtn),
                            ),
                          ),
                        if (predictState.isLocked)
                          Container(
                            height: 48,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: AppColors.neonGreen.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppColors.neonGreen.withOpacity(0.3)),
                            ),
                            child: Text(s.confirmedBtn,
                              style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 16,
                                color: AppColors.neonGreen, letterSpacing: 2)),
                          ),
                      ],
                    ),
                  ),
                ),

              // Expired message
              if (predictState.isExpired)
                SliverToBoxAdapter(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.red.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.red.withOpacity(0.3)),
                    ),
                    child: Text(s.timeUp,
                      style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 16,
                        color: AppColors.red, letterSpacing: 2)),
                  ),
                ),
            ],

            // No active question banner
            if (question == null && answered.isNotEmpty)
              SliverToBoxAdapter(
                child: NoQuestionBanner(pendingCount: pendingCount),
              ),

            // Empty state
            if (question == null && answered.isEmpty && predictState.upcomingQuestions.isEmpty)
              SliverFillRemaining(
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.bolt, size: 64, color: AppColors.textSecondary.withOpacity(0.5)),
                      const SizedBox(height: 16),
                      Text(s.noQuestionsEmpty,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 18)),
                      const SizedBox(height: 8),
                      Text(s.waitForMatchStart,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                    ],
                  ),
                ),
              ),

            // Answered questions section
            if (answered.isNotEmpty) ...[
              // Split into resolved and pending
              if (answered.any((a) => a.status == 'correct' || a.status == 'wrong'))
                SliverToBoxAdapter(child: _sectionDivider(s.hasResults)),

              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final resolvedList = answered.where((a) => a.status == 'correct' || a.status == 'wrong').toList();
                    if (index >= resolvedList.length) return null;
                    return AnsweredCard(answered: resolvedList[index], index: index + 1);
                  },
                  childCount: answered.where((a) => a.status == 'correct' || a.status == 'wrong').length,
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
                    return AnsweredCard(answered: pendingList[index], index: index + 1);
                  },
                  childCount: answered.where((a) => a.status == 'pending').length,
                ),
              ),

              if (answered.any((a) => a.status == 'skip'))
                SliverToBoxAdapter(child: _sectionDivider(s.skipped)),

              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final skipList = answered.where((a) => a.status == 'skip').toList();
                    if (index >= skipList.length) return null;
                    return AnsweredCard(answered: skipList[index], index: index + 1);
                  },
                  childCount: answered.where((a) => a.status == 'skip').length,
                ),
              ),
            ],

            // Upcoming queue
            if (predictState.upcomingQuestions.isNotEmpty) ...[
              SliverToBoxAdapter(child: _sectionDivider(s.upcoming)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: QuestionQueue(questions: predictState.upcomingQuestions),
                ),
              ),
            ],

            // Bottom padding
            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ),
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
