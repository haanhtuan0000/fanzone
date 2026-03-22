import 'dart:async';
import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class CountdownStrip extends StatefulWidget {
  final DateTime closesAt;
  final VoidCallback? onExpired;

  const CountdownStrip({super.key, required this.closesAt, this.onExpired});

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
    _remaining = widget.closesAt.difference(DateTime.now());
    if (_remaining.isNegative) {
      _remaining = Duration.zero;
      _expired = true;
    }
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() {
        _remaining = widget.closesAt.difference(DateTime.now());
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
      _remaining = widget.closesAt.difference(DateTime.now());
      _timer.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() {
          _remaining = widget.closesAt.difference(DateTime.now());
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
    final totalSeconds = 30.0;
    final remainingSeconds = _remaining.inSeconds.toDouble().clamp(0, totalSeconds);
    final progress = remainingSeconds / totalSeconds;
    final isUrgent = remainingSeconds <= 10;
    final isExpired = remainingSeconds <= 0;

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isExpired ? Icons.timer_off : Icons.timer,
              color: isExpired ? AppColors.textSecondary : (isUrgent ? AppColors.red : AppColors.amber),
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              isExpired ? 'TIME UP' : '${remainingSeconds.toInt()}s',
              style: TextStyle(
                fontFamily: AppFonts.bebasNeue,
                fontSize: 32,
                color: isExpired ? AppColors.textSecondary : (isUrgent ? AppColors.red : AppColors.amber),
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
