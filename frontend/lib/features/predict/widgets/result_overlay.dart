import 'dart:async';
import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class ResultOverlay extends StatefulWidget {
  final bool isCorrect;
  final int coinsResult;
  final VoidCallback onDismiss;

  const ResultOverlay({
    super.key,
    required this.isCorrect,
    required this.coinsResult,
    required this.onDismiss,
  });

  @override
  State<ResultOverlay> createState() => _ResultOverlayState();
}

class _ResultOverlayState extends State<ResultOverlay> {
  late Timer _autoDismiss;

  @override
  void initState() {
    super.initState();
    _autoDismiss = Timer(const Duration(seconds: 5), widget.onDismiss);
  }

  @override
  void dispose() {
    _autoDismiss.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onDismiss,
      child: Container(
        color: widget.isCorrect
            ? AppColors.neonGreen.withOpacity(0.15)
            : AppColors.red.withOpacity(0.15),
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                widget.isCorrect ? Icons.check_circle : Icons.cancel,
                color: widget.isCorrect ? AppColors.neonGreen : AppColors.red,
                size: 80,
              ),
              const SizedBox(height: 16),
              Text(
                widget.isCorrect ? 'CHINH XAC!' : 'SAI ROI!',
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: 36,
                  color: widget.isCorrect ? AppColors.neonGreen : AppColors.red,
                  letterSpacing: 4,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${widget.coinsResult >= 0 ? "+" : ""}${widget.coinsResult} coins',
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: 28,
                  color: widget.isCorrect ? AppColors.neonGreen : AppColors.red,
                ),
              ),
              if (!widget.isCorrect) ...[
                const SizedBox(height: 16),
                const Text(
                  'Tiec qua! Thu lai cau tiep nhe',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 16),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
