import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/models/match.dart';
import '../../../shared/widgets/live_badge.dart';

class MatchCard extends StatelessWidget {
  final MatchData match;
  final bool isSelected;
  final VoidCallback onTap;

  const MatchCard({
    super.key,
    required this.match,
    this.isSelected = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.neonGreen.withOpacity(0.08) : AppColors.cardSurface,
          borderRadius: BorderRadius.circular(12),
          border: isSelected
              ? Border.all(color: AppColors.neonGreen.withOpacity(0.4))
              : null,
        ),
        child: Row(
          children: [
            // Home team
            Expanded(
              child: Text(
                match.homeTeam,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
                textAlign: TextAlign.right,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            // Score / time
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Column(
                children: [
                  if (match.isLive) ...[
                    Text(
                      '${match.homeScore} - ${match.awayScore}',
                      style: const TextStyle(
                        fontFamily: AppFonts.bebasNeue,
                        fontSize: 20,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    const LiveBadge(),
                  ] else ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: match.status == 'FT'
                            ? AppColors.textSecondary.withOpacity(0.15)
                            : AppColors.amber.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        match.status == 'FT'
                            ? '${match.homeScore} - ${match.awayScore}'
                            : match.kickoffTime != null
                                ? '${match.kickoffTime!.toLocal().hour.toString().padLeft(2, '0')}:${match.kickoffTime!.toLocal().minute.toString().padLeft(2, '0')}'
                                : match.status,
                        style: TextStyle(
                          color: match.status == 'FT' ? AppColors.textSecondary : AppColors.amber,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            // Away team
            Expanded(
              child: Text(
                match.awayTeam,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
