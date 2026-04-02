import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/question.dart';

/// Shows a preview of the current prediction question with countdown and reward.
/// When no active question, shows countdown to next question.
class PredictBanner extends StatefulWidget {
  final Question? activeQuestion;
  final DateTime? nextOpensAt;
  const PredictBanner({super.key, this.activeQuestion, this.nextOpensAt});

  @override
  State<PredictBanner> createState() => _PredictBannerState();
}

class _PredictBannerState extends State<PredictBanner> {
  Timer? _timer;
  int _secondsLeft = 0;
  int _nextQuestionSeconds = 0;

  @override
  void initState() {
    super.initState();
    _updateCountdown();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _updateCountdown());
  }

  @override
  void didUpdateWidget(PredictBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.activeQuestion?.id != oldWidget.activeQuestion?.id ||
        widget.nextOpensAt != oldWidget.nextOpensAt) {
      _updateCountdown();
    }
  }

  void _updateCountdown() {
    if (widget.activeQuestion != null) {
      final remaining = widget.activeQuestion!.closesAt.difference(DateTime.now()).inSeconds;
      setState(() {
        _secondsLeft = remaining > 0 ? remaining : 0;
        _nextQuestionSeconds = 0;
      });
    } else if (widget.nextOpensAt != null) {
      final remaining = widget.nextOpensAt!.difference(DateTime.now()).inSeconds;
      setState(() {
        _secondsLeft = 0;
        _nextQuestionSeconds = remaining > 0 ? remaining : 0;
      });
    } else {
      setState(() {
        _secondsLeft = 0;
        _nextQuestionSeconds = 0;
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    final q = widget.activeQuestion;

    return GestureDetector(
      onTap: () => context.go('/predict'),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.cardSurface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.divider),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: ⚽ PREDICT THIS MATCH ... Go predict →
            Row(
              children: [
                const Text('⚽', style: TextStyle(fontSize: 14)),
                const SizedBox(width: 6),
                Text(
                  s.predictThisMatch,
                  style: const TextStyle(
                    fontFamily: AppFonts.bebasNeue,
                    fontSize: 12,
                    color: AppColors.textSecondary,
                    letterSpacing: 1,
                  ),
                ),
                const Spacer(),
                Text(
                  '${s.goPredict} →',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.neonGreen,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),

            if (q != null) ...[
              const SizedBox(height: 10),
              // Question text
              Text(
                q.text,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 8),
              // Bottom row: countdown | reward
              Row(
                children: [
                  // Countdown
                  if (_secondsLeft > 0) ...[
                    const Text('⏳', style: TextStyle(fontSize: 12)),
                    const SizedBox(width: 4),
                    Text(
                      s.timeLeftShort(_secondsLeft),
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                  const Spacer(),
                  // Reward badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.neonGreen.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '+${_maxReward(q)} 🪙',
                      style: const TextStyle(
                        fontFamily: AppFonts.bebasNeue,
                        fontSize: 14,
                        color: AppColors.neonGreen,
                      ),
                    ),
                  ),
                ],
              ),
            ],

            // Fallback when no active question — show next question countdown
            if (q == null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  children: [
                    if (_nextQuestionSeconds > 0) ...[
                      const Icon(Icons.hourglass_bottom, color: AppColors.amber, size: 14),
                      const SizedBox(width: 4),
                      Text(
                        '${s.nextQuestionIn} ${_nextQuestionSeconds}s',
                        style: const TextStyle(color: AppColors.amber, fontSize: 13),
                      ),
                    ] else
                      Text(
                        s.waitingForNewQuestion,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                      ),
                    const Spacer(),
                    Text(
                      '${s.goPredict} →',
                      style: const TextStyle(fontSize: 12, color: AppColors.neonGreen, fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  int _maxReward(Question q) {
    // Max possible payout: bet × highest multiplier
    if (q.options.isEmpty) return q.rewardCoins;
    final maxMult = q.options.map((o) => o.multiplier).reduce((a, b) => a > b ? a : b);
    return (50 * maxMult).round();
  }
}
