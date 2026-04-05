import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';

class StreakCalendar extends StatelessWidget {
  final int streakDays;
  const StreakCalendar({super.key, required this.streakDays});

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    final dayLabels = identical(AppStrings.current, AppStrings.en)
        ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        : ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    final todayIndex = DateTime.now().weekday - 1; // 0 = Monday

    // Build set of completed day indices (this week only)
    // streakDays includes today, counting backwards
    final completedIndices = <int>{};
    for (int i = 0; i < streakDays && i <= todayIndex; i++) {
      completedIndices.add(todayIndex - i);
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.local_fire_department, color: AppColors.amber, size: 18),
              const SizedBox(width: 6),
              Text(
                s.streakDays(streakDays),
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: List.generate(7, (index) {
              final isCompleted = completedIndices.contains(index);
              final isToday = index == todayIndex;
              final isFuture = index > todayIndex;

              return Column(
                children: [
                  Text(
                    dayLabels[index],
                    style: TextStyle(
                      color: isFuture ? AppColors.textSecondary.withOpacity(0.4) : AppColors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isCompleted
                          ? AppColors.neonGreen
                          : isToday
                              ? AppColors.amber.withOpacity(0.3)
                              : isFuture
                                  ? AppColors.cardSurface
                                  : AppColors.cardSurfaceLight,
                      border: isToday && !isCompleted
                          ? Border.all(color: AppColors.amber, width: 2)
                          : null,
                      boxShadow: isCompleted
                          ? [BoxShadow(color: AppColors.neonGreen.withOpacity(0.3), blurRadius: 6)]
                          : null,
                    ),
                    child: isCompleted
                        ? const Icon(Icons.check, color: AppColors.background, size: 16)
                        : null,
                  ),
                ],
              );
            }),
          ),
        ],
      ),
    );
  }
}
