import 'dart:async';
import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';

class CountdownStrip extends StatefulWidget {
  final DateTime closesAt;
  final DateTime? opensAt;
  final VoidCallback? onExpired;

  const CountdownStrip({super.key, required this.closesAt, this.opensAt, this.onExpired});

  @override
  State<CountdownStrip> createState() => _CountdownStripState();
}

class _CountdownStripState extends State<CountdownStrip> {
  late Timer _timer;
  late Duration _remaining;
  bool _expired = false;

  @override
  void initState() {
    super.initState();
    // Submit 3s early to beat server-side expiry check
    const earlySubmit = Duration(seconds: 3);
    _remaining = widget.closesAt.toUtc().difference(DateTime.now().toUtc()) - earlySubmit;
    if (_remaining.isNegative) {
      _remaining = Duration.zero;
      _expired = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        widget.onExpired?.call();
      });
    }
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() {
        _remaining = widget.closesAt.toUtc().difference(DateTime.now().toUtc()) - earlySubmit;
        if (_remaining.isNegative || _remaining == Duration.zero) {
          _remaining = Duration.zero;
          _timer.cancel();
          if (!_expired) {
            _expired = true;
            widget.onExpired?.call();
          }
        }
      });
    });
  }

  @override
  void didUpdateWidget(CountdownStrip oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.closesAt != widget.closesAt) {
      _expired = false;
      _remaining = widget.closesAt.toUtc().difference(DateTime.now().toUtc()) - const Duration(seconds: 3);
      _timer.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() {
          _remaining = widget.closesAt.toUtc().difference(DateTime.now().toUtc());
          if (_remaining.isNegative || _remaining == Duration.zero) {
            _remaining = Duration.zero;
            _timer.cancel();
            if (!_expired) {
              _expired = true;
              widget.onExpired?.call();
            }
          }
        });
      });
    }
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final totalSeconds = widget.opensAt != null
        ? widget.closesAt.toUtc().difference(widget.opensAt!.toUtc()).inSeconds.toDouble()
        : _remaining.inSeconds > 0 ? _remaining.inSeconds.toDouble() : 30.0;
    final remainingSeconds = _remaining.inSeconds.toDouble().clamp(0, totalSeconds);
    final progress = remainingSeconds / totalSeconds;
    final isUrgent = remainingSeconds <= 10;
    final isExpired = remainingSeconds <= 0;

    final timerColor = isExpired ? AppColors.textSecondary : (isUrgent ? AppColors.red : AppColors.amber);

    return Column(
      children: [
        // Label: "Câu hỏi đóng sau" / "Question closes in"
        if (!isExpired)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              AppStrings.current.questionClosesIn,
              style: TextStyle(fontSize: 11, color: AppColors.textSecondary, letterSpacing: 0.5),
            ),
          ),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isExpired ? Icons.timer_off : Icons.timer,
              color: timerColor,
              size: 24,
            ),
            const SizedBox(width: 8),
            Text(
              isExpired ? 'TIME UP' : '${remainingSeconds.toInt()}s',
              style: TextStyle(
                fontFamily: AppFonts.bebasNeue,
                fontSize: 32,
                color: timerColor,
                letterSpacing: 2,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: progress,
            minHeight: 6,
            backgroundColor: AppColors.cardSurface,
            valueColor: AlwaysStoppedAnimation(
              isExpired ? AppColors.textSecondary : (isUrgent ? AppColors.red : AppColors.amber),
            ),
          ),
        ),
      ],
    );
  }
}
