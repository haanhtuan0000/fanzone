import 'dart:async';
import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class CountdownStrip extends StatefulWidget {
  final DateTime closesAt;
  const CountdownStrip({super.key, required this.closesAt});

  @override
  State<CountdownStrip> createState() => _CountdownStripState();
}

class _CountdownStripState extends State<CountdownStrip> {
  late Timer _timer;
  late Duration _remaining;

  @override
  void initState() {
    super.initState();
    _remaining = widget.closesAt.difference(DateTime.now());
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() {
        _remaining = widget.closesAt.difference(DateTime.now());
        if (_remaining.isNegative) {
          _remaining = Duration.zero;
          _timer.cancel();
        }
      });
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final totalSeconds = 30.0; // Default countdown duration
    final remainingSeconds = _remaining.inSeconds.toDouble().clamp(0, totalSeconds);
    final progress = remainingSeconds / totalSeconds;
    final isUrgent = remainingSeconds <= 10;

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.timer,
              color: isUrgent ? AppColors.red : AppColors.amber,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              '${remainingSeconds.toInt()}s',
              style: TextStyle(
                fontFamily: AppFonts.bebasNeue,
                fontSize: 32,
                color: isUrgent ? AppColors.red : AppColors.amber,
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
              isUrgent ? AppColors.red : AppColors.amber,
            ),
          ),
        ),
      ],
    );
  }
}
