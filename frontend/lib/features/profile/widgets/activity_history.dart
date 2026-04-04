import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../shared/utils/time_ago.dart';
import 'activity_detail_modal.dart';

class ActivityHistory extends StatelessWidget {
  final List<dynamic> activity;
  final bool hasMore;
  final VoidCallback? onLoadMore;
  final bool isLoadingMore;

  const ActivityHistory({
    super.key,
    this.activity = const [],
    this.hasMore = false,
    this.onLoadMore,
    this.isLoadingMore = false,
  });

  String _typeIcon(String type) {
    switch (type) {
      case 'PREDICTION_WIN': return '✅';
      case 'PREDICTION_LOSS': return '❌';
      case 'ACHIEVEMENT': return '🏆';
      case 'LEVEL_UP': return '⬆️';
      default: return '📋';
    }
  }

  String _typeLabel(String type) {
    switch (type) {
      case 'PREDICTION_WIN': return identical(AppStrings.current, AppStrings.en) ? 'Correct Prediction' : 'Dự đoán Đúng';
      case 'PREDICTION_LOSS': return identical(AppStrings.current, AppStrings.en) ? 'Wrong Prediction' : 'Dự đoán Sai';
      case 'ACHIEVEMENT': return identical(AppStrings.current, AppStrings.en) ? 'Achievement' : 'Thành Tích';
      case 'DAILY_BONUS': return identical(AppStrings.current, AppStrings.en) ? 'Daily Bonus' : 'Thưởng Hằng Ngày';
      case 'ONBOARDING': return identical(AppStrings.current, AppStrings.en) ? 'Welcome Bonus' : 'Thưởng Chào Mừng';
      default: return type.replaceAll('_', ' ');
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    if (activity.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.cardSurface,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Text(
            s.noRecentActivity,
            style: const TextStyle(color: AppColors.textSecondary),
          ),
        ),
      );
    }

    return Column(
      children: [
        ...activity.map((item) {
          final map = item as Map<String, dynamic>;
          final type = map['type'] as String? ?? '';
          final amount = map['amount'] as int? ?? 0;
          final isPositive = amount >= 0;
          final createdAt = map['createdAt'] != null
              ? DateTime.tryParse(map['createdAt'].toString())
              : null;

          return GestureDetector(
            onTap: () => ActivityDetailModal.show(context, activity: map),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.cardSurface,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                children: [
                  Text(_typeIcon(type), style: const TextStyle(fontSize: 20)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _typeLabel(type),
                          style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
                        ),
                        if (createdAt != null)
                          Text(
                            timeAgo(createdAt),
                            style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                          ),
                      ],
                    ),
                  ),
                  Text(
                    '${isPositive ? "+" : ""}$amount',
                    style: TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 18,
                      color: isPositive ? AppColors.neonGreen : AppColors.red,
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
        // Load more button
        if (hasMore)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: isLoadingMore
                ? const SizedBox(
                    height: 32,
                    child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                : TextButton(
                    onPressed: onLoadMore,
                    child: Text(
                      s.loadMore,
                      style: const TextStyle(color: AppColors.neonGreen, fontSize: 14),
                    ),
                  ),
          ),
      ],
    );
  }
}
