import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/models/match.dart';

/// Compact read-only strip showing live match context above the questions.
/// Design v4.0: smaller than the Live scoreboard, no tap/expand, fixed position.
class MatchInfoStrip extends StatelessWidget {
  final MatchData match;
  /// Coins earned this match — shown in top-right instead of LIVE badge
  /// per design v4.0 (issue 1604 #8).
  final int coinsEarned;
  const MatchInfoStrip({super.key, required this.match, this.coinsEarned = 0});

  @override
  Widget build(BuildContext context) {
    // badge variables removed — LIVE badge replaced by coins display (issue 1604 #8)

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
              // Match coins earned (design v4.0 — replaces LIVE badge)
              Text(
                '+$coinsEarned 🪙',
                style: TextStyle(
                  fontFamily: AppFonts.barlowCondensed,
                  fontSize: sf(context, 12),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                  color: AppColors.neonGreen,
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
