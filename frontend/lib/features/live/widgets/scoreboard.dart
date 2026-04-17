import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/models/match.dart';
import '../../../core/l10n/app_strings.dart';

/// Integrated hero card: scoreboard + stats row + fan support bar + expandable stats.
class Scoreboard extends StatefulWidget {
  final MatchData match;
  const Scoreboard({super.key, required this.match});

  @override
  State<Scoreboard> createState() => _ScoreboardState();
}

class _ScoreboardState extends State<Scoreboard> {
  bool _isExpanded = false;

  MatchData get match => widget.match;

  @override
  Widget build(BuildContext context) {
    final loc = AppStrings.current;
    return GestureDetector(
      onTap: () => setState(() => _isExpanded = !_isExpanded),
      child: Container(
        padding: sLTRB(context, 16, 14, 16, 12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment(-1, -0.5),
            end: Alignment(1, 1),
            colors: [Color(0xFF081e0e), Color(0xFF060a1a)],
          ),
          borderRadius: BorderRadius.circular(16),
          border: match.isLive
              ? Border.all(color: AppColors.neonGreen.withOpacity(0.3), width: 1)
              : Border.all(color: AppColors.divider),
        ),
        child: Column(
          children: [
            // Hint
            Text(
              _isExpanded ? '' : loc.tapToExpand,
              style: TextStyle(
                fontSize: sf(context, 9),
                color: AppColors.textSecondary.withOpacity(0.4),
                letterSpacing: 1,
                fontFamily: AppFonts.barlowCondensed,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (!_isExpanded) const SizedBox(height: 8),

            // League name + round
            _leagueHeader(),
            SizedBox(height: s(context, 14)),

            // Teams + Score
            Row(
              children: [
                Expanded(child: _teamColumn(match.homeLogoUrl, match.homeTeam, match.homeForm)),
                _scoreColumn(),
                Expanded(child: _teamColumn(match.awayLogoUrl, match.awayTeam, match.awayForm)),
              ],
            ),
            SizedBox(height: s(context, 14)),

            // Fan support bar
            _fanBar(loc),

            // Expandable stats panel
            AnimatedSize(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOut,
              child: _isExpanded ? _expandPanel(loc) : const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _expandPanel(dynamic loc) {
    final stats = match.statistics;
    final possession = stats?['possession'];
    final shots = stats?['shots'];
    final shotsOnTarget = stats?['shotsOnTarget'];
    final corners = stats?['corners'];
    final yellowCards = stats?['yellowCards'];

    final hasAnyStats = possession != null || shots != null || corners != null;

    return Column(
      children: [
        SizedBox(height: s(context, 12)),
        Container(height: 1, color: AppColors.divider),
        if (!hasAnyStats)
          Padding(
            padding: sp(context, v: 16),
            child: Text(loc.noStatsAvailable,
              style: TextStyle(color: AppColors.textSecondary.withOpacity(0.5), fontSize: sf(context, 12))),
          ),
        if (hasAnyStats) ...[
          SizedBox(height: s(context, 12)),
          _statRow(
            _possVal(possession, 'home'),
            loc.statPossession,
            _possVal(possession, 'away'),
            _possPercent(possession, 'home'),
          ),
          _statRow(
            _intVal(shots, 'home'),
            loc.statShots,
            _intVal(shots, 'away'),
            _intPercent(shots),
          ),
          _statRow(
            _intVal(shotsOnTarget, 'home'),
            loc.statOnTarget,
            _intVal(shotsOnTarget, 'away'),
            _intPercent(shotsOnTarget),
          ),
          _statRow(
            _intVal(corners, 'home'),
            loc.statCorners,
            _intVal(corners, 'away'),
            _intPercent(corners),
          ),
          _statRow(
            _intVal(yellowCards, 'home'),
            loc.statCards,
            _intVal(yellowCards, 'away'),
            _intPercent(yellowCards),
          ),
        ],
      ],
    );
  }

  String _possVal(Map<String, dynamic>? stat, String side) {
    if (stat == null) return '-';
    return '${stat[side]}'.replaceAll('%', '') + '%';
  }

  double _possPercent(Map<String, dynamic>? stat, String side) {
    if (stat == null) return 0.5;
    final v = int.tryParse('${stat[side]}'.replaceAll('%', '')) ?? 50;
    return v / 100;
  }

  String _intVal(Map<String, dynamic>? stat, String side) {
    if (stat == null) return '-';
    return '${stat[side] ?? 0}';
  }

  double _intPercent(Map<String, dynamic>? stat) {
    if (stat == null) return 0.5;
    final h = (stat['home'] is int ? stat['home'] : int.tryParse('${stat['home']}') ?? 0) as int;
    final a = (stat['away'] is int ? stat['away'] : int.tryParse('${stat['away']}') ?? 0) as int;
    if (h + a == 0) return 0.5;
    return h / (h + a);
  }

  Widget _statRow(String homeVal, String label, String awayVal, double homeRatio) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(homeVal,
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    fontFamily: AppFonts.barlowCondensed,
                    fontSize: sf(context, 13),
                    fontWeight: FontWeight.w700,
                    color: AppColors.blue,
                  )),
              ),
              SizedBox(
                width: s(context, 100),
                child: Text(label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: sf(context, 9),
                    color: AppColors.textSecondary.withOpacity(0.4),
                    letterSpacing: 0.5,
                    fontFamily: AppFonts.barlowCondensed,
                    fontWeight: FontWeight.w600,
                  )),
              ),
              Expanded(
                child: Text(awayVal,
                  textAlign: TextAlign.left,
                  style: TextStyle(
                    fontFamily: AppFonts.barlowCondensed,
                    fontSize: sf(context, 13),
                    fontWeight: FontWeight.w700,
                    color: AppColors.amber,
                  )),
              ),
            ],
          ),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: SizedBox(
              height: 3,
              child: Row(
                children: [
                  Expanded(
                    flex: (homeRatio * 100).round().clamp(1, 99),
                    child: Container(color: AppColors.blue),
                  ),
                  Expanded(
                    flex: ((1 - homeRatio) * 100).round().clamp(1, 99),
                    child: Container(color: AppColors.amber),
                  ),
                ],
              ),
            ),
          ),
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
              errorWidget: (_, __, ___) => Text('🏆', style: TextStyle(fontSize: sf(context, 14))),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: Text('🏆', style: TextStyle(fontSize: sf(context, 14))),
          ),
        Flexible(
          child: Text(
            leagueText.toString(),
            style: TextStyle(
              fontFamily: AppFonts.bebasNeue,
              color: AppColors.textSecondary,
              fontSize: sf(context, 11),
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
          style: TextStyle(
            fontSize: sf(context, 13),
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
            style: TextStyle(
              fontSize: sf(context, 10),
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
      padding: sp(context, h: 8),
      child: Column(
        children: [
          // Score — bold and prominent per design v4.0
          Text(
            '${match.homeScore}–${match.awayScore}',
            style: TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: sf(context, AppSizes.scoreFontSize + 8),
              fontWeight: FontWeight.w700,
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
                    fontSize: sf(context, AppSizes.clockFontSize),
                    color: match.isLive ? AppColors.neonGreen : AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          // HT score line removed per issue 1604 #1
        ],
      ),
    );
  }

  Widget _fanBar(dynamic loc) {
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
              decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.blue),
            ),
            const SizedBox(width: 4),
            Text(
              '$homePercent% ${loc.fanLabel}',
              style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 11)),
            ),
            const Spacer(),
            Text(
              '$awayPercent%',
              style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 11)),
            ),
            const SizedBox(width: 4),
            Container(
              width: 8, height: 8,
              decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.amber),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: SizedBox(
            height: 3,
            child: Row(
              children: [
                Expanded(
                  flex: homePercent,
                  child: Container(color: AppColors.blue),
                ),
                Expanded(
                  flex: awayPercent,
                  child: Container(color: AppColors.amber),
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
        width: s(context, 40),
        height: s(context, 40),
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.cardSurfaceLight,
        ),
        child: const Icon(Icons.sports_soccer, color: AppColors.textSecondary),
      );
    }
    return CachedNetworkImage(
      imageUrl: url,
      width: s(context, 40),
      height: s(context, 40),
      placeholder: (ctx, url) => SizedBox(
        width: s(context, 40), height: s(context, 40),
        child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      errorWidget: (ctx, url, error) => Container(
        width: s(context, 40), height: s(context, 40),
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.cardSurfaceLight,
        ),
        child: const Icon(Icons.sports_soccer, color: AppColors.textSecondary),
      ),
    );
  }
}
