import 'dart:async';
import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';

class WaitingCard extends StatefulWidget {
  final DateTime? nextOpensAt;

  const WaitingCard({super.key, this.nextOpensAt});

  @override
  State<WaitingCard> createState() => _WaitingCardState();
}

class _WaitingCardState extends State<WaitingCard> {
  Timer? _timer;
  Duration _remaining = Duration.zero;

  @override
  void initState() {
    super.initState();
    _updateRemaining();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _updateRemaining());
  }

  @override
  void didUpdateWidget(WaitingCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.nextOpensAt != widget.nextOpensAt) {
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
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _formatDuration(Duration d) {
    final mins = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final secs = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$mins:$secs';
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    final hasCountdown = widget.nextOpensAt != null && _remaining.inSeconds > 0;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.amber.withOpacity(0.2)),
      ),
      child: Column(
        children: [
          Text(
            hasCountdown ? s.nextQuestionIn : s.waitingForNewQuestion,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 13,
            ),
          ),
          if (hasCountdown) ...[
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.hourglass_bottom, color: AppColors.amber, size: 22),
                const SizedBox(width: 8),
                Text(
                  _formatDuration(_remaining),
                  style: const TextStyle(
                    fontFamily: AppFonts.bebasNeue,
                    fontSize: 36,
                    color: AppColors.textPrimary,
                    letterSpacing: 2,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
