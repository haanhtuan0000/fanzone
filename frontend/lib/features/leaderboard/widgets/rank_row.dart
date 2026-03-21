import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/models/leaderboard_entry.dart';

class RankRow extends StatelessWidget {
  final LeaderboardEntry entry;
  const RankRow({super.key, required this.entry});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: entry.rank % 2 == 0 ? AppColors.cardSurface : AppColors.cardSurfaceLight,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          // Rank number
          SizedBox(
            width: 32,
            child: Text(
              '${entry.rank}',
              style: const TextStyle(
                fontFamily: AppFonts.bebasNeue,
                fontSize: 18,
                color: AppColors.textSecondary,
              ),
            ),
          ),
          // Avatar
          Text(entry.avatarEmoji, style: const TextStyle(fontSize: 24)),
          const SizedBox(width: 10),
          // Name + country
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.displayName,
                  style: const TextStyle(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  '${entry.accuracy}% chinh xac',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                ),
              ],
            ),
          ),
          // Coins
          Text(
            '${entry.coins}',
            style: const TextStyle(
              fontFamily: AppFonts.bebasNeue,
              color: AppColors.amber,
              fontSize: 16,
            ),
          ),
          const SizedBox(width: 8),
          // Delta
          if (entry.delta != 0)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  entry.delta > 0 ? Icons.arrow_upward : Icons.arrow_downward,
                  color: entry.delta > 0 ? AppColors.neonGreen : AppColors.red,
                  size: 14,
                ),
                Text(
                  '${entry.delta.abs()}',
                  style: TextStyle(
                    color: entry.delta > 0 ? AppColors.neonGreen : AppColors.red,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
