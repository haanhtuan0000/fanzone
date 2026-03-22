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
import '../../../core/l10n/app_strings.dart';
import '../widgets/result_overlay.dart';

class PredictScreen extends ConsumerWidget {
  const PredictScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = AppStrings.current;
    final predictState = ref.watch(predictStateProvider);
    final activeMatch = ref.watch(liveStateProvider).activeMatch;

    if (predictState.isLoading) {
      return Scaffold(
        appBar: AppBar(title: Text(s.predict)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (predictState.activeQuestion == null) {
      return Scaffold(
        appBar: AppBar(title: Text(s.predict)),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.bolt, size: 64, color: AppColors.textSecondary.withOpacity(0.5)),
              const SizedBox(height: 16),
              Text(
                s.noQuestions,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 18),
              ),
              const SizedBox(height: 8),
              Text(
                s.waitForMatch,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
              ),
            ],
          ),
        ),
      );
    }

    final question = predictState.activeQuestion!;

    return Scaffold(
      appBar: AppBar(title: Text(s.predict)),
      body: Stack(
        children: [
          RefreshIndicator(
            onRefresh: () async {
              final match = ref.read(liveStateProvider).activeMatch;
              if (match != null) {
                await ref.read(predictStateProvider.notifier).loadQuestions(match.fixtureId);
              }
            },
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Match header
                if (activeMatch != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: AppColors.cardSurface,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.divider),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          activeMatch.homeTeam,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 10),
                          child: Text(
                            '${activeMatch.homeScore} - ${activeMatch.awayScore}',
                            style: const TextStyle(
                              fontFamily: AppFonts.bebasNeue,
                              color: AppColors.neonGreen,
                              fontSize: 22,
                            ),
                          ),
                        ),
                        Text(
                          activeMatch.awayTeam,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        if (activeMatch.elapsed != null) ...[
                          const SizedBox(width: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.red.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              "${activeMatch.elapsed}'",
                              style: const TextStyle(
                                color: AppColors.red,
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                // Countdown
                CountdownStrip(
                  closesAt: question.closesAt,
                  opensAt: question.opensAt,
                  onExpired: () {
                    ref.read(predictStateProvider.notifier).expireQuestion();
                  },
                ),
                const SizedBox(height: 16),
                // Question card
                PredictCard(question: question),
                const SizedBox(height: 16),
                // Options
                ...question.options.map((option) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
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
                }),
                // Stake display + Confirm button
                // Expired message
                if (predictState.isExpired && !predictState.isLocked) ...[
                  const SizedBox(height: 16),
                  Container(
                    height: 52,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppColors.red.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.red.withOpacity(0.3)),
                    ),
                    child: const Text(
                      'TIME UP — LOADING NEXT...',
                      style: TextStyle(
                        fontFamily: AppFonts.bebasNeue,
                        fontSize: 20,
                        color: AppColors.red,
                        letterSpacing: 2,
                      ),
                    ),
                  ),
                ],
                if (predictState.selectedOptionId != null && !predictState.isExpired) ...[
                  const SizedBox(height: 8),
                  CoinStakeDisplay(
                    coinsBet: question.rewardCoins,
                    multiplier: question.options
                        .firstWhere((o) => o.id == predictState.selectedOptionId)
                        .multiplier,
                  ),
                  const SizedBox(height: 16),
                  if (!predictState.isLocked)
                    SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        onPressed: () {
                          print('[UI] Confirm button TAPPED. selectedOptionId=${predictState.selectedOptionId}, isLocked=${predictState.isLocked}');
                          ref.read(predictStateProvider.notifier).confirmPrediction();
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.neonGreen,
                          foregroundColor: Colors.black,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          textStyle: const TextStyle(
                            fontFamily: AppFonts.bebasNeue,
                            fontSize: 20,
                            letterSpacing: 2,
                          ),
                        ),
                        child: Text(s.confirmPrediction),
                      ),
                    ),
                  if (predictState.isLocked && predictState.lastResult == null)
                    Container(
                      height: 52,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.neonGreen.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.neonGreen.withOpacity(0.3)),
                      ),
                      child: Text(
                        s.confirmed,
                        style: const TextStyle(
                          fontFamily: AppFonts.bebasNeue,
                          fontSize: 20,
                          color: AppColors.neonGreen,
                          letterSpacing: 2,
                        ),
                      ),
                    ),
                ],
                const SizedBox(height: 24),
                // Question queue
                if (predictState.upcomingQuestions.isNotEmpty)
                  QuestionQueue(questions: predictState.upcomingQuestions),
              ],
            ),
          ),
          ),
          // Result overlay
          if (predictState.lastResult != null)
            ResultOverlay(
              isCorrect: predictState.lastResult!,
              coinsResult: predictState.lastCoinsResult ?? 0,
              onDismiss: () {
                ref.read(predictStateProvider.notifier).clearResult();
                ref.read(predictStateProvider.notifier).advanceToNext();
              },
            ),
        ],
      ),
    );
  }
}
