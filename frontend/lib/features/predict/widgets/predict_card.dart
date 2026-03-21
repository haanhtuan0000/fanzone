import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/models/question.dart';

class PredictCard extends StatelessWidget {
  final Question question;
  const PredictCard({super.key, required this.question});

  Color get _categoryColor {
    switch (question.category) {
      case 'GOAL': return AppColors.neonGreen;
      case 'CARD': return AppColors.amber;
      case 'CORNER': return AppColors.textPrimary;
      case 'VAR': return AppColors.blue;
      case 'HALFTIME': return AppColors.purple;
      case 'SUBSTITUTION': return AppColors.amber;
      default: return AppColors.textSecondary;
    }
  }

  IconData get _categoryIcon {
    switch (question.category) {
      case 'GOAL': return Icons.sports_soccer;
      case 'CARD': return Icons.square;
      case 'CORNER': return Icons.flag;
      case 'VAR': return Icons.videocam;
      case 'HALFTIME': return Icons.timer;
      case 'SUBSTITUTION': return Icons.swap_horiz;
      default: return Icons.help;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          // Category tag + reward
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _categoryColor.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_categoryIcon, color: _categoryColor, size: 16),
                    const SizedBox(width: 4),
                    Text(
                      question.category,
                      style: TextStyle(
                        color: _categoryColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
              Row(
                children: [
                  const Icon(Icons.monetization_on, color: AppColors.amber, size: 18),
                  const SizedBox(width: 4),
                  Text(
                    '${question.rewardCoins}',
                    style: const TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      color: AppColors.amber,
                      fontSize: 18,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Question text
          Text(
            question.text,
            style: const TextStyle(
              fontFamily: AppFonts.barlowCondensed,
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
              height: 1.3,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
