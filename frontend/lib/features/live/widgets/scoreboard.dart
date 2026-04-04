import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../app/constants.dart';
import '../../../core/models/match.dart';
import '../../../core/l10n/app_strings.dart';

/// Integrated hero card: scoreboard + stats row + fan support bar.
class Scoreboard extends StatelessWidget {
  final MatchData match;
  const Scoreboard({super.key, required this.match});

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
        border: match.isLive
            ? Border.all(color: AppColors.neonGreen.withOpacity(0.3), width: 1)
            : null,
      ),
      child: Column(
        children: [
          // League name + round
          _leagueHeader(),
          const SizedBox(height: 14),

          // Teams + Score
          Row(
            children: [
              // Home team
              Expanded(child: _teamColumn(match.homeLogoUrl, match.homeTeam, match.homeForm)),
              // Score + clock
              _scoreColumn(),
              // Away team
              Expanded(child: _teamColumn(match.awayLogoUrl, match.awayTeam, match.awayForm)),
            ],
          ),
          const SizedBox(height: 14),

          // Stats row
          _statsRow(s),
          const SizedBox(height: 10),

          // Fan support bar
          _fanBar(s),
        ],
      ),
    );
  }

  Widget _leagueHeader() {
    final leagueText = StringBuffer();
    if (match.league != null) {
      leagueText.write(match.league!.toUpperCase());
    }
    if (match.leagueRound != null && match.leagueRound!.isNotEmpty) {
      leagueText.write(' — ${match.leagueRound!.toUpperCase()}');
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (match.leagueLogoUrl != null)
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: CachedNetworkImage(
              imageUrl: match.leagueLogoUrl!,
              width: 18, height: 18,
              errorWidget: (_, __, ___) => const Text('🏆', style: TextStyle(fontSize: 14)),
            ),
          )
        else
          const Padding(
            padding: EdgeInsets.only(right: 6),
            child: Text('🏆', style: TextStyle(fontSize: 14)),
          ),
        Flexible(
          child: Text(
            leagueText.toString(),
            style: const TextStyle(
              fontFamily: AppFonts.bebasNeue,
              color: AppColors.textSecondary,
              fontSize: 11,
              letterSpacing: 1.5,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  Widget _teamColumn(String? logoUrl, String name, String? form) {
    return Column(
      children: [
        _teamLogo(logoUrl),
        const SizedBox(height: 6),
        Text(
          name,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        if (form != null) ...[
          const SizedBox(height: 2),
          Text(
            form,
            style: const TextStyle(
              fontSize: 10,
              color: AppColors.textSecondary,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ],
    );
  }

  Widget _scoreColumn() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        children: [
          Text(
            '${match.homeScore}–${match.awayScore}',
            style: const TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: AppSizes.scoreFontSize,
              color: AppColors.textPrimary,
              letterSpacing: 2,
            ),
          ),
          if (match.elapsed != null)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.access_time,
                  size: 14,
                  color: match.isLive ? AppColors.neonGreen : AppColors.textSecondary,
                ),
                const SizedBox(width: 3),
                Text(
                  match.status == 'HT' ? 'HT' : '${match.elapsed}',
                  style: TextStyle(
                    fontFamily: AppFonts.bebasNeue,
                    fontSize: AppSizes.clockFontSize,
                    color: match.isLive ? AppColors.neonGreen : AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          if (match.homeHtScore != null && match.awayHtScore != null)
            Text(
              'HT: ${match.homeHtScore}–${match.awayHtScore}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
            ),
        ],
      ),
    );
  }

  Widget _statsRow(dynamic s) {
    final stats = match.statistics;
    final possession = stats?['possession'];
    final shots = stats?['shots'];
    final yellowCards = stats?['yellowCards'];
    final corners = stats?['corners'];

    final possessionStr = possession != null
        ? '${possession['home']}'.replaceAll('%', '')
        : '-';
    final shotsTotal = shots != null
        ? '${(shots['home'] as int? ?? 0) + (shots['away'] as int? ?? 0)}'
        : '-';
    final cardsTotal = yellowCards != null
        ? '${(yellowCards['home'] as int? ?? 0) + (yellowCards['away'] as int? ?? 0)}'
        : '-';
    final cornersTotal = corners != null
        ? '${(corners['home'] as int? ?? 0) + (corners['away'] as int? ?? 0)}'
        : '-';

    // Short team name for possession label (first 3 chars)
    final homeShort = match.homeTeam.length > 3
        ? match.homeTeam.substring(0, 3).toUpperCase()
        : match.homeTeam.toUpperCase();

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      decoration: BoxDecoration(
        color: AppColors.background.withOpacity(0.4),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          _statItem(
            possessionStr == '-' ? '-' : '$possessionStr%',
            '${s.statPossession} $homeShort',
            AppColors.blue,
          ),
          _statItem(shotsTotal, s.statShots, AppColors.textPrimary),
          _statItem(cardsTotal, s.statCards, AppColors.amber),
          _statItem(cornersTotal, s.statCorners, AppColors.neonGreen),
        ],
      ),
    );
  }

  Widget _statItem(String value, String label, Color color) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: 20,
              color: color,
            ),
          ),
          Text(
            label,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 10,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }

  Widget _fanBar(dynamic s) {
    final possession = match.statistics?['possession'];
    int homePercent = 50;
    if (possession != null) {
      final homeStr = (possession['home'] as String?) ?? '50%';
      homePercent = int.tryParse(homeStr.replaceAll('%', '')) ?? 50;
    }
    final awayPercent = 100 - homePercent;

    return Column(
      children: [
        Row(
          children: [
            Container(
              width: 8, height: 8,
              decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.neonGreen),
            ),
            const SizedBox(width: 4),
            Text(
              '$homePercent% ${s.fanLabel}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
            ),
            const Spacer(),
            Text(
              '$awayPercent%',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
            ),
            const SizedBox(width: 4),
            Container(
              width: 8, height: 8,
              decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.red),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: SizedBox(
            height: 6,
            child: Row(
              children: [
                Expanded(
                  flex: homePercent,
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [AppColors.neonGreen, Color(0xFF7CFF5C)],
                      ),
                    ),
                  ),
                ),
                Expanded(
                  flex: awayPercent,
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFFFF6666), AppColors.red],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _teamLogo(String? url) {
    if (url == null) {
      return Container(
        width: 52,
        height: 52,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.cardSurfaceLight,
        ),
        child: const Icon(Icons.sports_soccer, color: AppColors.textSecondary),
      );
    }
    return CachedNetworkImage(
      imageUrl: url,
      width: 52,
      height: 52,
      placeholder: (context, url) => const SizedBox(
        width: 52, height: 52,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      errorWidget: (context, url, error) => Container(
        width: 52, height: 52,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.cardSurfaceLight,
        ),
        child: const Icon(Icons.sports_soccer, color: AppColors.textSecondary),
      ),
    );
  }
}
