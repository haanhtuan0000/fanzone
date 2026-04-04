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

class FeedCardRank extends StatelessWidget {
  final FeedEvent event;
  const FeedCardRank({super.key, required this.event});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.amber.withOpacity(0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.amber.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Text(event.userAvatarEmoji ?? '🏆', style: const TextStyle(fontSize: 28)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.userDisplayName ?? 'Fan',
                  style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textPrimary, fontSize: 14),
                ),
                Text(_localizedMessage(event.message), style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              ],
            ),
          ),
          Text(timeAgo(event.createdAt), style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
        ],
      ),
    );
  }
}
