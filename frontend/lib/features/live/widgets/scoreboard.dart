import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../app/constants.dart';
import '../../../core/models/match.dart';
import '../../../shared/widgets/live_badge.dart';

class Scoreboard extends StatelessWidget {
  final MatchData match;
  const Scoreboard({super.key, required this.match});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
        border: match.isLive
            ? Border.all(color: AppColors.neonGreen.withOpacity(0.3), width: 1)
            : null,
      ),
      child: Column(
        children: [
          // League name + LIVE badge
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (match.league != null)
                Text(
                  match.league!.toUpperCase(),
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 12,
                    letterSpacing: 1,
                  ),
                ),
              if (match.isLive) ...[
                const SizedBox(width: 8),
                const LiveBadge(),
              ],
            ],
          ),
          const SizedBox(height: 16),
          // Teams + Score
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Home team
              Expanded(
                child: Column(
                  children: [
                    _teamLogo(match.homeLogoUrl),
                    const SizedBox(height: 8),
                    Text(
                      match.homeTeam,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              // Score
              Column(
                children: [
                  Text(
                    '${match.homeScore}  -  ${match.awayScore}',
                    style: const TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: AppSizes.scoreFontSize,
                      color: AppColors.textPrimary,
                      letterSpacing: 4,
                    ),
                  ),
                  if (match.elapsed != null)
                    Text(
                      "${match.elapsed}'",
                      style: TextStyle(
                        fontFamily: AppFonts.bebasNeue,
                        fontSize: AppSizes.clockFontSize,
                        color: match.isLive ? AppColors.neonGreen : AppColors.textSecondary,
                      ),
                    ),
                  if (match.homeHtScore != null && match.awayHtScore != null)
                    Text(
                      'HT: ${match.homeHtScore} - ${match.awayHtScore}',
                      style: const TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
              // Away team
              Expanded(
                child: Column(
                  children: [
                    _teamLogo(match.awayLogoUrl),
                    const SizedBox(height: 8),
                    Text(
                      match.awayTeam,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textPrimary,
                      ),
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _teamLogo(String? url) {
    if (url == null) {
      return Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.cardSurfaceLight,
        ),
        child: const Icon(Icons.sports_soccer, color: AppColors.textSecondary),
      );
    }
    return CachedNetworkImage(
      imageUrl: url,
      width: 48,
      height: 48,
      placeholder: (context, url) => const SizedBox(
        width: 48,
        height: 48,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      errorWidget: (context, url, error) => Container(
        width: 48,
        height: 48,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.cardSurfaceLight,
        ),
        child: const Icon(Icons.sports_soccer, color: AppColors.textSecondary),
      ),
    );
  }
}
