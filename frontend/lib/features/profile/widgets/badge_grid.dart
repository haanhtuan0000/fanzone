import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/models/achievement.dart';
import 'badge_detail_modal.dart';

class BadgeGrid extends StatelessWidget {
  final List<Achievement> achievements;
  const BadgeGrid({super.key, required this.achievements});

  IconData _getIcon(String conditionType) {
    switch (conditionType) {
      case 'STREAK': return Icons.local_fire_department;
      case 'ACCURACY': return Icons.gps_fixed;
      case 'TOTAL': return Icons.sports_soccer;
      case 'CONSECUTIVE_CORRECT': return Icons.bolt;
      default: return Icons.emoji_events;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (achievements.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.cardSurface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(
          child: Text(
            'Chua co thanh tich nao',
            style: TextStyle(color: AppColors.textSecondary),
          ),
        ),
      );
    }

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
      ),
      itemCount: achievements.length,
      itemBuilder: (context, index) {
        final achievement = achievements[index];
        return GestureDetector(
          onTap: () => BadgeDetailModal.show(context, achievement: achievement),
          child: Container(
            decoration: BoxDecoration(
              color: achievement.earned
                  ? AppColors.amber.withOpacity(0.15)
                  : AppColors.cardSurface,
              borderRadius: BorderRadius.circular(12),
              border: achievement.earned
                  ? Border.all(color: AppColors.amber.withOpacity(0.3))
                  : null,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  _getIcon(achievement.conditionType),
                  color: achievement.earned ? AppColors.amber : AppColors.textSecondary.withOpacity(0.3),
                  size: 28,
                ),
                const SizedBox(height: 4),
                Text(
                  achievement.name,
                  style: TextStyle(
                    color: achievement.earned ? AppColors.textPrimary : AppColors.textSecondary.withOpacity(0.5),
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
