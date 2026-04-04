import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/leaderboard_entry.dart';
import '../../../shared/utils/country_utils.dart';

class RankRow extends StatelessWidget {
  final LeaderboardEntry entry;
  final bool isMe;
  final VoidCallback? onTap;

  const RankRow({
    super.key,
    required this.entry,
    this.isMe = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    final flag = countryFlag(entry.countryCode);
    final country = countryName(entry.countryCode);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: isMe
              ? AppColors.neonGreen.withOpacity(0.1)
              : entry.rank % 2 == 0
                  ? AppColors.cardSurface
                  : AppColors.cardSurfaceLight,
          borderRadius: BorderRadius.circular(8),
          border: isMe ? Border.all(color: AppColors.neonGreen.withOpacity(0.4)) : null,
        ),
        child: Row(
          children: [
            // Rank number
            SizedBox(
              width: 28,
              child: Text(
                '${entry.rank}',
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: 18,
                  color: isMe ? AppColors.neonGreen : AppColors.textSecondary,
                ),
              ),
            ),
            // Country flag
            Text(flag, style: const TextStyle(fontSize: 20)),
            const SizedBox(width: 10),
            // Name + country + accuracy
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          entry.displayName,
                          style: TextStyle(
                            color: isMe ? AppColors.neonGreen : AppColors.textPrimary,
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isMe)
                        Text(
                          ' ${s.me}',
                          style: const TextStyle(
                            color: AppColors.neonGreen,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                    ],
                  ),
                  Text(
                    '$country - ${s.accuracyShort(entry.accuracy)}',
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                  ),
                ],
              ),
            ),
            // Coins
            Text(
              '${entry.coins}',
              style: TextStyle(
                fontFamily: AppFonts.bebasNeue,
                color: isMe ? AppColors.neonGreen : AppColors.amber,
                fontSize: 16,
              ),
            ),
            const SizedBox(width: 4),
            const Text('🪙', style: TextStyle(fontSize: 12)),
            const SizedBox(width: 6),
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
      ),
    );
  }
}
