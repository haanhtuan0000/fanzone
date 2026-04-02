import 'dart:async';
import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';

/// Compact inline countdown to the next question.
/// Shows between answered cards area, not as a standalone screen.
class NextQuestionStrip extends StatefulWidget {
  final DateTime? nextOpensAt;
  final VoidCallback? onReady;
  const NextQuestionStrip({super.key, this.nextOpensAt, this.onReady});

  @override
  State<NextQuestionStrip> createState() => _NextQuestionStripState();
}

class _NextQuestionStripState extends State<NextQuestionStrip> {
  Timer? _timer;
  Duration _remaining = Duration.zero;
  bool _fired = false;

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

    // Fire onReady when countdown reaches 0
    if (diff.inSeconds <= 0 && !_fired) {
      _fired = true;
      widget.onReady?.call();
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
    final hasCountdown = widget.nextOpensAt != null && _remaining.inSeconds > 0;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.amber.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.amber.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            hasCountdown ? Icons.hourglass_bottom : Icons.access_time,
            color: AppColors.amber,
            size: 18,
          ),
          const SizedBox(width: 8),
          Text(
            hasCountdown
                ? '${s.nextQuestionIn} ${_remaining.inSeconds}s'
                : s.waitingForNewQuestion,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
