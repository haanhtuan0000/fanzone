import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/models/match.dart';
import '../../../core/l10n/app_strings.dart';
import '../providers/live_provider.dart';

class MatchCard extends StatelessWidget {
  final MatchData match;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback? onPredictTap;
  /// If provided, renders Row 3 with prediction summary (Design v4.0
  /// "Đã trả lời" category). Shows N✓ · N✗ · +Nxu.
  final PredictionSummary? predictionSummary;

  const MatchCard({
    super.key,
    required this.match,
    this.isSelected = false,
    required this.onTap,
    this.onPredictTap,
    this.predictionSummary,
  });

  @override
  Widget build(BuildContext context) {
    final loc = AppStrings.current;
    final hasAnsweredRow = predictionSummary != null && !match.isLive;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: sa(context, 14),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.neonGreen.withOpacity(0.06)
              : hasAnsweredRow
                  ? AppColors.neonGreen.withOpacity(0.03)
                  : AppColors.cardSurface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected
                ? AppColors.neonGreen.withOpacity(0.4)
                : hasAnsweredRow
                    ? AppColors.neonGreen.withOpacity(0.18)
                    : AppColors.divider,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Column(
          children: [
            // Row 1: league + live badge / kickoff time
            Row(
              children: [
                if (match.leagueLogoUrl != null)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: Image.network(
                      match.leagueLogoUrl!,
                      width: 16, height: 16,
                      errorBuilder: (_, __, ___) => SizedBox(width: s(context, 16)),
                    ),
                  ),
                Expanded(
                  child: Text(
                    match.league ?? '',
                    style: TextStyle(
                      fontSize: sf(context, 11),
                      color: AppColors.textSecondary,
                      letterSpacing: 0.5,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (match.isLive)
                  _liveBadge(context)
                else if (match.status == 'FT')
                  _statusBadge(context, 'FT', AppColors.textSecondary)
                else if (match.kickoffTime != null)
                  _timeBadge(context),
              ],
            ),
            SizedBox(height: s(context, 10)),

            // Row 2: home ● — score/vs — ● away
            Row(
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          match.homeTeam,
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w600,
                            fontSize: sf(context, 14),
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
                Padding(
                  padding: sp(context, h: 12),
                  child: match.isLive || match.status == 'FT' || match.status == 'HT'
                      ? Text(
                          '${match.homeScore}–${match.awayScore}',
                          style: TextStyle(
                            fontFamily: AppFonts.bebasNeue,
                            fontSize: sf(context, 22),
                            color: match.isLive ? AppColors.textPrimary : AppColors.textSecondary,
                          ),
                        )
                      : Text(
                          'VS',
                          style: TextStyle(
                            fontFamily: AppFonts.bebasNeue,
                            fontSize: sf(context, 16),
                            color: AppColors.textSecondary,
                          ),
                        ),
                ),
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
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w600,
                            fontSize: sf(context, 14),
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

            // ── Row 3 variants (Design v4.0) ──

            // LIVE: fan bar with "⚡ Predicting — N fan"
            if (match.isLive) ...[
              SizedBox(height: s(context, 8)),
              GestureDetector(
                onTap: () {
                  if (onPredictTap != null) {
                    onPredictTap!();
                  } else {
                    context.go('/predict');
                  }
                },
                child: Container(
                  width: double.infinity,
                  padding: sp(context, v: 7, h: 10),
                  decoration: BoxDecoration(
                    color: AppColors.neonGreen.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppColors.neonGreen.withOpacity(0.2)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 5, height: 5,
                        decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.neonGreen),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        '⚡ ${match.fanOnlineCount != null ? loc.fanOnline(match.fanOnlineCount!) : loc.predicting}',
                        style: TextStyle(
                          fontFamily: AppFonts.barlowCondensed,
                          color: AppColors.neonGreen,
                          fontSize: sf(context, 11),
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],

            // ANSWERED (FT + user participated): prediction summary row
            if (hasAnsweredRow) ...[
              SizedBox(height: s(context, 8)),
              Container(
                width: double.infinity,
                padding: sp(context, v: 7, h: 10),
                decoration: BoxDecoration(
                  color: AppColors.neonGreen.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Text(
                      'My predictions',
                      style: TextStyle(
                        fontFamily: AppFonts.barlowCondensed,
                        color: AppColors.textSecondary,
                        fontSize: sf(context, 11),
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.3,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '${predictionSummary!.correct}✓',
                      style: TextStyle(
                        fontFamily: AppFonts.barlowCondensed,
                        color: AppColors.neonGreen,
                        fontSize: sf(context, 12),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      ' · ${predictionSummary!.wrong}✗',
                      style: TextStyle(
                        fontFamily: AppFonts.barlowCondensed,
                        color: AppColors.red,
                        fontSize: sf(context, 12),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      ' · +${predictionSummary!.coinsEarned}',
                      style: TextStyle(
                        fontFamily: AppFonts.barlowCondensed,
                        color: AppColors.amber,
                        fontSize: sf(context, 12),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      '🪙',
                      style: TextStyle(fontSize: sf(context, 10)),
                    ),
                  ],
                ),
              ),
            ],

            // NS: no Row 3
          ],
        ),
      ),
    );
  }

  Widget _liveBadge(BuildContext context) {
    return Container(
      padding: sp(context, h: 8, v: 3),
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
            match.status == 'HT' ? 'HT' : 'LIVE ${match.elapsed ?? ""}\'',
            style: TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: sf(context, 11),
              color: AppColors.red,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _timeBadge(BuildContext context) {
    final hour = match.kickoffTime!.toLocal().hour.toString().padLeft(2, '0');
    final minute = match.kickoffTime!.toLocal().minute.toString().padLeft(2, '0');
    return Container(
      padding: sp(context, h: 8, v: 3),
      decoration: BoxDecoration(
        color: AppColors.amber.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        '$hour:$minute',
        style: TextStyle(
          fontFamily: AppFonts.bebasNeue,
          fontSize: sf(context, 11),
          color: AppColors.amber,
        ),
      ),
    );
  }

  Widget _statusBadge(BuildContext context, String text, Color color) {
    return Container(
      padding: sp(context, h: 8, v: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontFamily: AppFonts.bebasNeue,
          fontSize: sf(context, 11),
          color: color,
        ),
      ),
    );
  }
}
