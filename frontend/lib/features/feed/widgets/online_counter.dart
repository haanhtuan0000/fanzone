import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class OnlineCounter extends StatefulWidget {
  final int count;
  const OnlineCounter({super.key, required this.count});

  @override
  State<OnlineCounter> createState() => _OnlineCounterState();
}

class _OnlineCounterState extends State<OnlineCounter> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: AppColors.cardSurface,
      child: Row(
        children: [
          AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              return Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.neonGreen.withOpacity(0.5 + _controller.value * 0.5),
                ),
              );
            },
          ),
          const SizedBox(width: 8),
          Text(
            '${widget.count} live match${widget.count != 1 ? 'es' : ''} now',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
          ),
        ],
      ),
    );
  }
}
