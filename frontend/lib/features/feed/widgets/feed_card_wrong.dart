import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/models/feed_event.dart';
import '../../../shared/utils/time_ago.dart';

class FeedCardWrong extends StatelessWidget {
  final FeedEvent event;
  const FeedCardWrong({super.key, required this.event});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.red.withOpacity(0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.red.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Text(event.userAvatarEmoji ?? '⚽', style: const TextStyle(fontSize: 28)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.userDisplayName ?? 'Fan',
                  style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textPrimary, fontSize: 14),
                ),
                Text(event.message, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${event.coinsDelta ?? 0}',
                style: const TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  color: AppColors.red,
                  fontSize: 18,
                ),
              ),
              Text(timeAgo(event.createdAt), style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }
}
