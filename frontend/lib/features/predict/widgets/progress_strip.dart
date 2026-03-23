import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class ProgressStrip extends StatelessWidget {
  final List<String> dots; // 'correct', 'wrong', 'pending', 'active', 'skip', 'upcoming'
  final int totalCoins;

  const ProgressStrip({super.key, required this.dots, this.totalCoins = 0});

  Color _dotColor(String status) {
    switch (status) {
      case 'correct': return AppColors.neonGreen;
      case 'wrong': return AppColors.red;
      case 'pending': return AppColors.amber;
      case 'active': return const Color(0xFF0A84FF);
      case 'skip': return AppColors.textSecondary.withOpacity(0.3);
      default: return AppColors.textSecondary.withOpacity(0.15);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Text(
            'TIEN DO',
            style: TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: 10,
              color: AppColors.textSecondary,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: dots.map((status) {
                return Container(
                  width: 12,
                  height: 12,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: _dotColor(status),
                    border: status == 'active'
                        ? Border.all(color: const Color(0xFF0A84FF), width: 2)
                        : null,
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(width: 10),
          Text(
            '${totalCoins >= 0 ? "+" : ""}$totalCoins',
            style: TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: 14,
              color: totalCoins >= 0 ? AppColors.neonGreen : AppColors.red,
            ),
          ),
        ],
      ),
    );
  }
}
