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

class FeedCardCorrect extends StatelessWidget {
  final FeedEvent event;
  const FeedCardCorrect({super.key, required this.event});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.neonGreen.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          // Avatar
          Text(event.userAvatarEmoji ?? '⚽', style: const TextStyle(fontSize: 24)),
          const SizedBox(width: 10),
          // Username + message
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.userDisplayName ?? 'Fan',
                  style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textPrimary, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        _localizedMessage(event.message),
                        style: const TextStyle(color: AppColors.neonGreen, fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '+${event.coinsDelta ?? 0} 🪙',
                      style: const TextStyle(
                        fontFamily: AppFonts.bebasNeue,
                        color: AppColors.neonGreen,
                        fontSize: 14,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Time
          Text(timeAgo(event.createdAt), style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
        ],
      ),
    );
  }
}
