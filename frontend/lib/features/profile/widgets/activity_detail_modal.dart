import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../shared/utils/time_ago.dart';

class ActivityDetailModal extends StatelessWidget {
  final Map<String, dynamic> activity;
  const ActivityDetailModal({super.key, required this.activity});

  static void show(BuildContext context, {required Map<String, dynamic> activity}) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.cardSurface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => ActivityDetailModal(activity: activity),
    );
  }

  String _typeIcon(String type) {
    switch (type) {
      case 'PREDICTION_WIN': return '✅';
      case 'PREDICTION_LOSS': return '❌';
      case 'ACHIEVEMENT': return '🏆';
      case 'LEVEL_UP': return '⬆️';
      case 'DAILY_BONUS': return '🎁';
      case 'ONBOARDING': return '🎉';
      default: return '📋';
    }
  }

  String _typeLabel(String type) {
    final isEn = identical(AppStrings.current, AppStrings.en);
    switch (type) {
      case 'PREDICTION_WIN': return isEn ? 'Correct Prediction' : 'Dự đoán Đúng';
      case 'PREDICTION_LOSS': return isEn ? 'Wrong Prediction' : 'Dự đoán Sai';
      case 'ACHIEVEMENT': return isEn ? 'Achievement Unlocked' : 'Mở Khóa Thành Tích';
      case 'DAILY_BONUS': return isEn ? 'Daily Bonus' : 'Thưởng Hằng Ngày';
      case 'ONBOARDING': return isEn ? 'Welcome Bonus' : 'Thưởng Chào Mừng';
      case 'LEVEL_UP': return isEn ? 'Level Up!' : 'Lên Cấp!';
      default: return type.replaceAll('_', ' ');
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = activity['type'] as String? ?? '';
    final amount = activity['amount'] as int? ?? 0;
    final isPositive = amount >= 0;
    final createdAt = activity['createdAt'] != null
        ? DateTime.tryParse(activity['createdAt'])
        : null;
    final balanceAfter = activity['balanceAfter'] as int?;

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
          Text(_typeIcon(type), style: const TextStyle(fontSize: 48)),
          const SizedBox(height: 12),
          Text(
            _typeLabel(type),
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          // Amount
          Text(
            '${isPositive ? "+" : ""}$amount',
            style: TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: 36,
              color: isPositive ? AppColors.neonGreen : AppColors.red,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'coins',
            style: TextStyle(color: AppColors.textSecondary, fontSize: 14),
          ),
          const SizedBox(height: 16),
          // Balance after & timestamp
          if (balanceAfter != null)
            Text(
              identical(AppStrings.current, AppStrings.en)
                  ? 'Balance after: $balanceAfter coins'
                  : 'Số dư sau: $balanceAfter xu',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
          if (createdAt != null) ...[
            const SizedBox(height: 4),
            Text(
              timeAgo(createdAt),
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
          ],
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
