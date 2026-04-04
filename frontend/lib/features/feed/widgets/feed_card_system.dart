import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/feed_event.dart';
import '../../../shared/utils/time_ago.dart';

String _localizedMessage(String message) {
  final parts = message.split('|');
  if (parts.length == 2) {
    return identical(AppStrings.current, AppStrings.en) ? parts[0] : parts[1];
  }
  return message;
}

class FeedCardSystem extends StatelessWidget {
  final FeedEvent event;
  const FeedCardSystem({super.key, required this.event});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.blue.withOpacity(0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.blue.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.blue.withOpacity(0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.info_outline, color: AppColors.blue, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              _localizedMessage(event.message),
              style: const TextStyle(color: AppColors.textPrimary, fontSize: 14),
            ),
          ),
          Text(timeAgo(event.createdAt), style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
        ],
      ),
    );
  }
}
