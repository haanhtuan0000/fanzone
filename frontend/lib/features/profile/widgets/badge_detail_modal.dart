import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/achievement.dart';

class BadgeDetailModal extends StatelessWidget {
  final Achievement achievement;
  const BadgeDetailModal({super.key, required this.achievement});

  static void show(BuildContext context, {required Achievement achievement}) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.cardSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => BadgeDetailModal(achievement: achievement),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.divider,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 24),
          Icon(
            achievement.earned ? Icons.emoji_events : Icons.lock_outline,
            color: achievement.earned ? AppColors.amber : AppColors.textSecondary,
            size: 48,
          ),
          const SizedBox(height: 12),
          Text(
            achievement.name,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            achievement.description,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          if (achievement.earned && achievement.earnedAt != null)
            Text(
              AppStrings.current.earnedOn(achievement.earnedAt!.day, achievement.earnedAt!.month, achievement.earnedAt!.year),
              style: const TextStyle(color: AppColors.neonGreen, fontSize: 13),
            )
          else ...[
            // Progress bar
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: achievement.progressPercent,
                minHeight: 8,
                backgroundColor: AppColors.cardSurfaceLight,
                valueColor: const AlwaysStoppedAnimation(AppColors.amber),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${achievement.progress} / ${achievement.conditionValue}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
          ],
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
