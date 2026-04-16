import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/models/match.dart';

/// Compact read-only strip showing live match context above the questions.
/// Design v4.0: smaller than the Live scoreboard, no tap/expand, fixed position.
class MatchInfoStrip extends StatelessWidget {
  final MatchData match;
  const MatchInfoStrip({super.key, required this.match});

  @override
  Widget build(BuildContext context) {
    final isHT = match.status == 'HT';
    final badgeColor = isHT ? AppColors.amber : AppColors.red;
    final badgeText = isHT
        ? 'HT'
        : match.elapsed != null ? 'LIVE ${match.elapsed}\'' : 'LIVE';

    return Container(
      padding: EdgeInsets.symmetric(horizontal: s(context, 14), vertical: s(context, 10)),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment(-1, -0.5),
          end: Alignment(1, 1),
          colors: [Color(0xFF0c1a0e), Color(0xFF08081a)],
        ),
        border: Border(bottom: BorderSide(color: AppColors.divider, width: 0.5)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Row 1: league + badge
          Row(
            children: [
              if (match.leagueLogoUrl != null) ...[
                CachedNetworkImage(
                  imageUrl: match.leagueLogoUrl!,
                  width: s(context, 14), height: s(context, 14),
                  errorWidget: (_, __, ___) => const SizedBox.shrink(),
                ),
                SizedBox(width: s(context, 5)),
              ],
              Expanded(
                child: Text(
                  match.league ?? '',
                  style: TextStyle(
                    fontFamily: AppFonts.barlowCondensed,
                    fontSize: sf(context, 9),
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                    color: AppColors.textSecondary.withOpacity(0.6),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Container(
                padding: EdgeInsets.symmetric(horizontal: s(context, 8), vertical: 2),
                decoration: BoxDecoration(
                  color: badgeColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: badgeColor.withOpacity(0.3)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 5, height: 5,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: badgeColor),
                    ),
                    SizedBox(width: s(context, 4)),
                    Text(
                      badgeText,
                      style: TextStyle(
                        fontFamily: AppFonts.barlowCondensed,
                        fontSize: sf(context, 9),
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.8,
                        color: badgeColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          SizedBox(height: s(context, 8)),

          // Row 2: score
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Home
              Expanded(
                child: Text(
                  match.homeTeam,
                  textAlign: TextAlign.right,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: AppFonts.barlowCondensed,
                    fontSize: sf(context, 13),
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
              Container(
                width: 5, height: 5,
                margin: EdgeInsets.symmetric(horizontal: s(context, 8)),
                decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.blue),
              ),
              // Score
              Text(
                '${match.homeScore}',
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: sf(context, 28),
                  color: AppColors.textPrimary,
                  height: 1,
                ),
              ),
              Padding(
                padding: EdgeInsets.symmetric(horizontal: s(context, 6)),
                child: Text(
                  '—',
                  style: TextStyle(
                    fontFamily: AppFonts.bebasNeue,
                    fontSize: sf(context, 20),
                    color: AppColors.textSecondary,
                    height: 1,
                  ),
                ),
              ),
              Text(
                '${match.awayScore}',
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: sf(context, 28),
                  color: AppColors.textPrimary,
                  height: 1,
                ),
              ),
              Container(
                width: 5, height: 5,
                margin: EdgeInsets.symmetric(horizontal: s(context, 8)),
                decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.red),
              ),
              // Away
              Expanded(
                child: Text(
                  match.awayTeam,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: AppFonts.barlowCondensed,
                    fontSize: sf(context, 13),
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
