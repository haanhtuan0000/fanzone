import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/models/match.dart';
import '../../../core/l10n/app_strings.dart';

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
    final s = AppStrings.current;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: isSelected ? AppColors.neonGreen.withOpacity(0.06) : AppColors.cardSurface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? AppColors.neonGreen.withOpacity(0.4) : AppColors.divider,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Column(
          children: [
            // Top row: league + live badge / kickoff time
            Row(
              children: [
                if (match.leagueLogoUrl != null)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: Image.network(
                      match.leagueLogoUrl!,
                      width: 16, height: 16,
                      errorBuilder: (_, __, ___) => const SizedBox(width: 16),
                    ),
                  ),
                Expanded(
                  child: Text(
                    match.league ?? '',
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondary,
                      letterSpacing: 0.5,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (match.isLive)
                  _liveBadge()
                else if (match.status == 'FT')
                  _statusBadge('FT', AppColors.textSecondary)
                else if (match.kickoffTime != null)
                  _timeBadge(),
              ],
            ),
            const SizedBox(height: 10),
            // Main row: home ● — score/vs — ● away
            Row(
              children: [
                // Home team + dot
                Expanded(
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          match.homeTeam,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        width: 8, height: 8,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.blue,
                        ),
                      ),
                    ],
                  ),
                ),
                // Score or VS
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: match.isLive || match.status == 'FT' || match.status == 'HT'
                      ? Text(
                          '${match.homeScore}–${match.awayScore}',
                          style: TextStyle(
                            fontFamily: AppFonts.bebasNeue,
                            fontSize: 22,
                            color: match.isLive ? AppColors.textPrimary : AppColors.textSecondary,
                          ),
                        )
                      : const Text(
                          'VS',
                          style: TextStyle(
                            fontFamily: AppFonts.bebasNeue,
                            fontSize: 16,
                            color: AppColors.textSecondary,
                          ),
                        ),
                ),
                // Away team + dot
                Expanded(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Container(
                        width: 8, height: 8,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.red,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          match.awayTeam,
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
                    ],
                  ),
                ),
              ],
            ),
            // Engagement strip for selected live match
            if (isSelected && match.isLive) ...[
              const SizedBox(height: 10),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.neonGreen.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.bolt, color: AppColors.neonGreen, size: 16),
                    const SizedBox(width: 4),
                    Text(
                      match.fanOnlineCount != null
                          ? s.fanOnline(match.fanOnlineCount!)
                          : s.predicting,
                      style: const TextStyle(
                        color: AppColors.neonGreen,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _liveBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.red.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6, height: 6,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: AppColors.red,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            'LIVE ${match.elapsed ?? ""}\'',
            style: const TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: 11,
              color: AppColors.red,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _timeBadge() {
    final hour = match.kickoffTime!.toLocal().hour.toString().padLeft(2, '0');
    final minute = match.kickoffTime!.toLocal().minute.toString().padLeft(2, '0');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.amber.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        '$hour:$minute',
        style: const TextStyle(
          fontFamily: AppFonts.bebasNeue,
          fontSize: 11,
          color: AppColors.amber,
        ),
      ),
    );
  }

  Widget _statusBadge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontFamily: AppFonts.bebasNeue,
          fontSize: 11,
          color: color,
        ),
      ),
    );
  }
}
