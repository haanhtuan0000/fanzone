import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class XpBar extends StatelessWidget {
  final int currentXp;
  final int xpToNextLevel;

  const XpBar({
    super.key,
    required this.currentXp,
    required this.xpToNextLevel,
  });

  @override
  Widget build(BuildContext context) {
    final progress = xpToNextLevel > 0 ? (currentXp / xpToNextLevel).clamp(0.0, 1.0) : 0.0;

    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('XP', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
            Text(
              '$currentXp / $xpToNextLevel',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: SizedBox(
            height: 12,
            child: Stack(
              children: [
                Container(color: AppColors.cardSurface),
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: progress),
                  duration: AppDurations.slow,
                  curve: Curves.easeOutCubic,
                  builder: (context, value, child) => FractionallySizedBox(
                    widthFactor: value,
                    child: child,
                  ),
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [AppColors.neonGreen, AppColors.blue],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
