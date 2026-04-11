import 'dart:async';
import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/l10n/app_strings.dart';

/// Phase boundaries in match minutes — when next questions are generated.
const _phaseBoundaries = [0, 15, 35, 45, 46, 60, 75, 90];

/// Estimate next question minute based on current elapsed time.
/// Returns null if match is past 90 min.
int? _estimateNextQuestionMinute(int? elapsed) {
  if (elapsed == null) return null;
  for (final boundary in _phaseBoundaries) {
    if (boundary > elapsed) return boundary;
  }
  return null; // Past 90 min
}

/// Compact inline countdown to the next question.
/// Shows between answered cards area, not as a standalone screen.
class NextQuestionStrip extends StatefulWidget {
  final DateTime? nextOpensAt;
  final int? matchElapsed;
  final VoidCallback? onReady;
  const NextQuestionStrip({super.key, this.nextOpensAt, this.matchElapsed, this.onReady});

  @override
  State<NextQuestionStrip> createState() => _NextQuestionStripState();
}

class _NextQuestionStripState extends State<NextQuestionStrip> {
  Timer? _timer;
  Duration _remaining = Duration.zero;
  bool _fired = false;
  bool _loading = false; // Brief loading state after countdown hits 0

  @override
  void initState() {
    super.initState();
    _updateRemaining();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _updateRemaining());
  }

  @override
  void didUpdateWidget(NextQuestionStrip oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.nextOpensAt != widget.nextOpensAt) {
      _fired = false;
      _updateRemaining();
    }
  }

  void _updateRemaining() {
    if (widget.nextOpensAt == null) {
      setState(() => _remaining = Duration.zero);
      return;
    }
    final diff = widget.nextOpensAt!.toUtc().difference(DateTime.now().toUtc());
    setState(() => _remaining = diff.isNegative ? Duration.zero : diff);

    // Fire onReady when countdown reaches 0, show loading briefly
    if (diff.inSeconds <= 0 && !_fired) {
      _fired = true;
      _loading = true;
      widget.onReady?.call();
      // Clear loading after 3s (by then loadQuestions should have responded)
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) setState(() => _loading = false);
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
    final str = AppStrings.current;
    final hasCountdown = widget.nextOpensAt != null && _remaining.inSeconds > 0;

    // Estimate next question time from phase schedule
    final nextMin = _estimateNextQuestionMinute(widget.matchElapsed);
    final hasEstimate = !hasCountdown && nextMin != null && widget.matchElapsed != null;
    final estimateMin = hasEstimate ? (nextMin! - widget.matchElapsed!) : 0;

    String text;
    IconData icon;

    // HT awareness: during half-time (elapsed 45-47), show specific message
    final isHalfTime = widget.matchElapsed != null && widget.matchElapsed! >= 45 && widget.matchElapsed! <= 47;

    if (_loading) {
      text = 'Loading question...';
      icon = Icons.hourglass_top;
    } else if (hasCountdown) {
      text = '${str.nextQuestionIn} ${_remaining.inSeconds}s';
      icon = Icons.hourglass_bottom;
    } else if (isHalfTime && widget.nextOpensAt == null) {
      text = 'Questions resume in the 2nd half';
      icon = Icons.coffee;
    } else if (hasEstimate && estimateMin > 0) {
      text = '${str.nextQuestionIn} ~${estimateMin} min';
      icon = Icons.schedule;
    } else {
      text = str.waitingForNewQuestion;
      icon = Icons.access_time;
    }

    return Container(
      margin: sLTRB(context, 16, 8, 16, 0),
      padding: sp(context, h: 16, v: 12),
      decoration: BoxDecoration(
        color: AppColors.amber.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.amber.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: AppColors.amber, size: s(context, 18)),
          const SizedBox(width: 8),
          Text(
            text,
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: sf(context, 13),
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
