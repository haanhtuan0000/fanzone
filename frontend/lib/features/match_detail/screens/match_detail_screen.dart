import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/match.dart';
import '../providers/match_detail_provider.dart';

class MatchDetailScreen extends ConsumerWidget {
  final int fixtureId;
  final MatchData? match;

  const MatchDetailScreen({super.key, required this.fixtureId, this.match});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final str = AppStrings.current;
    final detailAsync = ref.watch(matchDetailProvider(fixtureId));

    return Scaffold(
      appBar: AppBar(
        title: Text(str.matchResult),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Container(
              padding: sp(context, h: 10, v: 4),
              decoration: BoxDecoration(
                color: AppColors.cardSurfaceLight,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppColors.divider),
              ),
              child: Text('FT',
                style: TextStyle(
                  fontFamily: AppFonts.barlowCondensed,
                  fontSize: sf(context, 10),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                  color: AppColors.textSecondary.withOpacity(0.5),
                )),
            ),
          ),
        ],
      ),
      body: CustomScrollView(
        slivers: [
          // Static scoreboard
          if (match != null)
            SliverToBoxAdapter(child: _staticScoreboard(context, str)),

          // Content from API
          ...detailAsync.when(
            loading: () => [
              const SliverFillRemaining(
                child: Center(child: CircularProgressIndicator()),
              ),
            ],
            error: (e, _) => [
              SliverFillRemaining(
                child: Center(child: Text('Error: $e', style: const TextStyle(color: AppColors.textSecondary))),
              ),
            ],
            data: (detail) => [
              // Stats card
              if (detail.stats.isNotEmpty)
                SliverToBoxAdapter(child: _statsCard(context, str, detail.stats)),

              // Timeline card
              if (detail.events.isNotEmpty)
                SliverToBoxAdapter(child: _timelineCard(context, str, detail.events)),

              // My predictions card
              if (detail.predictions.isNotEmpty)
                SliverToBoxAdapter(child: _predictionsCard(context, str, detail.predictions)),

              // Empty predictions
              if (detail.predictions.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: sp(context, h: 14, v: 8),
                    child: Text(str.noPredictions,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 13))),
                  ),
                ),

              // Next match banner
              SliverToBoxAdapter(
                child: _nextMatchBanner(context, str),
              ),

              SliverToBoxAdapter(child: SizedBox(height: s(context, 24))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _nextMatchBanner(BuildContext context, dynamic str) {
    // Simple "come back for more" banner since we don't have next-match API
    return Padding(
      padding: sLTRB(context, 14, 6, 14, 0),
      child: GestureDetector(
        onTap: () => context.go('/live'),
        child: Container(
          padding: sa(context, 12),
          decoration: BoxDecoration(
            color: AppColors.blue.withOpacity(0.08),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.blue.withOpacity(0.2)),
          ),
          child: Row(
            children: [
              Text('⚽', style: TextStyle(fontSize: sf(context, 20))),
              SizedBox(width: s(context, 10)),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('More matches today',
                      style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 12),
                        fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
                    Text('Go back to live matches to predict more!',
                      style: TextStyle(fontSize: sf(context, 10),
                        color: AppColors.textSecondary.withOpacity(0.5))),
                  ],
                ),
              ),
              Text('\u2192', style: TextStyle(fontSize: sf(context, 16), color: AppColors.blue)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _staticScoreboard(BuildContext context, dynamic str) {
    final m = match!;
    return Container(
      margin: sLTRB(context, 14, 8, 14, 12),
      padding: sa(context, 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment(-1, -0.5),
          end: Alignment(1, 1),
          colors: [Color(0xFF0f0f22), Color(0xFF0a0a18)],
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider.withOpacity(0.5)),
      ),
      child: Column(
        children: [
          // Teams + score
          Row(
            children: [
              Expanded(child: _ftTeamColumn(context, m.homeLogoUrl, m.homeTeam)),
              Column(
                children: [
                  Text(
                    '${m.homeScore}–${m.awayScore}',
                    style: TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: sf(context, 52),
                      letterSpacing: 4,
                      color: AppColors.textPrimary.withOpacity(0.48),
                    ),
                  ),
                  Text(str.fullTimeLabel,
                    style: TextStyle(
                      fontFamily: AppFonts.barlowCondensed,
                      fontSize: sf(context, 10),
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2,
                      color: AppColors.textSecondary.withOpacity(0.4),
                    )),
                ],
              ),
              Expanded(child: _ftTeamColumn(context, m.awayLogoUrl, m.awayTeam)),
            ],
          ),
          // Meta chips
          SizedBox(height: s(context, 9)),
          Wrap(
            spacing: 5,
            runSpacing: 5,
            alignment: WrapAlignment.center,
            children: [
              if (m.league != null) _chip(context, m.league!),
              if (m.leagueRound != null) _chip(context, m.leagueRound!),
            ],
          ),
        ],
      ),
    );
  }

  Widget _ftTeamColumn(BuildContext context, String? logoUrl, String name) {
    return Column(
      children: [
        if (logoUrl != null)
          CachedNetworkImage(imageUrl: logoUrl, width: s(context, 40), height: s(context, 40),
            errorWidget: (_, __, ___) => Text('⚽', style: TextStyle(fontSize: sf(context, 28))))
        else
          Text('⚽', style: TextStyle(fontSize: sf(context, 28))),
        const SizedBox(height: 5),
        Text(name,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontFamily: AppFonts.barlowCondensed,
            fontSize: sf(context, 12),
            fontWeight: FontWeight.w700,
            color: AppColors.textSecondary.withOpacity(0.7),
          )),
      ],
    );
  }

  Widget _chip(BuildContext context, String text) {
    return Container(
      padding: sp(context, h: 9, v: 3),
      decoration: BoxDecoration(
        color: AppColors.cardSurfaceLight.withOpacity(0.3),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.divider),
      ),
      child: Text(text,
        style: TextStyle(
          fontFamily: AppFonts.barlowCondensed,
          fontSize: sf(context, 10),
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
          color: AppColors.textSecondary.withOpacity(0.5),
        )),
    );
  }

  Widget _statsCard(BuildContext context, dynamic str, Map<String, dynamic> stats) {
    return Container(
      margin: sLTRB(context, 14, 0, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: sp(context, h: 15, v: 11),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.divider)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('📊 ${str.matchStats}',
                  style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 11),
                    fontWeight: FontWeight.w700, letterSpacing: 2, color: AppColors.textSecondary)),
                _chip(context, str.fullTimeLabel),
              ],
            ),
          ),
          // Stat rows
          Padding(
            padding: sa(context, 14),
            child: Column(
              children: [
                _fstRow(context, stats['possession'], str.statPossession, true, 0),
                _fstRow(context, stats['shots'], str.statShots, false, 1),
                _fstRow(context, stats['shotsOnTarget'], str.statOnTarget, false, 2),
                _fstRow(context, stats['corners'], str.statCorners, false, 3),
                _fstRow(context, stats['yellowCards'], str.statCards, false, 4),
                _fstRow(context, stats['offsides'], str.statOffsides, false, 5),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _fstRow(BuildContext context, Map<String, dynamic>? stat, String label, bool isPossession, int index) {
    String homeVal = '-';
    String awayVal = '-';
    if (stat != null) {
      if (isPossession) {
        homeVal = '${stat['home']}'.replaceAll('%', '') + '%';
        awayVal = '${stat['away']}'.replaceAll('%', '') + '%';
      } else {
        homeVal = '${stat['home'] ?? 0}';
        awayVal = '${stat['away'] ?? 0}';
      }
    }

    return Container(
      padding: sp(context, h: 9, v: 6),
      margin: const EdgeInsets.only(bottom: 3),
      decoration: BoxDecoration(
        color: index.isOdd ? Colors.transparent : AppColors.cardSurfaceLight.withOpacity(0.3),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(homeVal,
              textAlign: TextAlign.right,
              style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 13),
                fontWeight: FontWeight.w700, color: AppColors.blue)),
          ),
          SizedBox(
            width: s(context, 100),
            child: Text(label,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: sf(context, 9), letterSpacing: 0.5,
                fontFamily: AppFonts.barlowCondensed,
                color: AppColors.textSecondary.withOpacity(0.4))),
          ),
          Expanded(
            child: Text(awayVal,
              textAlign: TextAlign.left,
              style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 13),
                fontWeight: FontWeight.w700, color: AppColors.amber)),
          ),
        ],
      ),
    );
  }

  Widget _timelineCard(BuildContext context, dynamic str, List<MatchEvent> events) {
    return Container(
      margin: sLTRB(context, 14, 0, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          Container(
            padding: sp(context, h: 15, v: 11),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.divider)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('📋 ${str.matchTimeline}',
                  style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 11),
                    fontWeight: FontWeight.w700, letterSpacing: 2, color: AppColors.textSecondary)),
                _chip(context, '90\''),
              ],
            ),
          ),
          Padding(
            padding: sa(context, 14),
            child: Column(
              children: events.map((e) => _timelineItem(context, e)).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _timelineItem(BuildContext context, MatchEvent event) {
    Color bgColor;
    Color borderColor;
    switch (event.colorType) {
      case 'goal':
        bgColor = AppColors.neonGreen.withOpacity(0.04);
        borderColor = AppColors.neonGreen.withOpacity(0.1);
        break;
      case 'card':
        bgColor = AppColors.amber.withOpacity(0.04);
        borderColor = AppColors.amber.withOpacity(0.1);
        break;
      case 'sub':
        bgColor = AppColors.blue.withOpacity(0.04);
        borderColor = AppColors.blue.withOpacity(0.1);
        break;
      case 'var':
        bgColor = AppColors.red.withOpacity(0.04);
        borderColor = AppColors.red.withOpacity(0.1);
        break;
      default:
        bgColor = Colors.transparent;
        borderColor = Colors.transparent;
    }

    final minuteStr = event.extraMinute != null
        ? "${event.minute}+${event.extraMinute}'"
        : "${event.minute}'";

    return Container(
      margin: const EdgeInsets.only(bottom: 5),
      padding: sa(context, 10),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: s(context, 32),
            child: Text(minuteStr,
              textAlign: TextAlign.right,
              style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: sf(context, 15), color: AppColors.textSecondary)),
          ),
          SizedBox(width: s(context, 9)),
          Text(event.icon, style: TextStyle(fontSize: sf(context, 15))),
          SizedBox(width: s(context, 9)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${event.playerName ?? ''} ${event.teamName != null ? '(${event.teamName})' : ''}',
                  style: TextStyle(fontSize: sf(context, 13), fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                ),
                if (event.detail != null || event.assistName != null)
                  Text(
                    event.assistName != null ? 'Assist: ${event.assistName}' : event.detail ?? '',
                    style: TextStyle(fontSize: sf(context, 10), color: AppColors.textSecondary.withOpacity(0.4)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _predictionsCard(BuildContext context, dynamic str, List<MatchPrediction> predictions) {
    final correct = predictions.where((p) => p.status == 'correct').length;
    final wrong = predictions.where((p) => p.status == 'wrong').length;
    final totalCoins = predictions.fold<int>(0, (sum, p) => sum + (p.coinsResult ?? 0));
    final accuracy = predictions.isNotEmpty ? (correct / predictions.length * 100).round() : 0;

    return Container(
      margin: sLTRB(context, 14, 0, 14, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: AppColors.neonGreen.withOpacity(0.18)),
        color: AppColors.neonGreen.withOpacity(0.04),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: sp(context, h: 13, v: 9),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.neonGreen.withOpacity(0.1))),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('🎯 ${str.myPredictionsTitle}',
                  style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 10),
                    fontWeight: FontWeight.w700, letterSpacing: 2, color: AppColors.neonGreen)),
                Container(
                  padding: sp(context, h: 9, v: 3),
                  decoration: BoxDecoration(
                    color: AppColors.neonGreen.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.neonGreen.withOpacity(0.22)),
                  ),
                  child: Text('${totalCoins >= 0 ? '+' : ''}$totalCoins🪙',
                    style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 9),
                      fontWeight: FontWeight.w700, color: AppColors.neonGreen)),
                ),
              ],
            ),
          ),

          // Summary row
          Row(
            children: [
              _summaryItem(context, '$correct', str.correctStatus, AppColors.neonGreen),
              _summaryItem(context, '$wrong', str.wrongStatus, AppColors.red),
              _summaryItem(context, '${totalCoins >= 0 ? '+' : ''}$totalCoins', '🪙', AppColors.amber),
              _summaryItem(context, '$accuracy%', str.accuracy, AppColors.purple),
            ],
          ),

          // Prediction list
          Padding(
            padding: sLTRB(context, 9, 7, 9, 9),
            child: Column(
              children: predictions.map((p) => _predictionRow(context, p)).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _summaryItem(BuildContext context, String value, String label, Color color) {
    return Expanded(
      child: Container(
        padding: sp(context, v: 10, h: 7),
        decoration: const BoxDecoration(
          border: Border(right: BorderSide(color: AppColors.divider)),
        ),
        child: Column(
          children: [
            Text(value,
              style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: sf(context, 23), color: color)),
            Text(label,
              style: TextStyle(fontSize: sf(context, 9), letterSpacing: 0.5,
                color: AppColors.textSecondary.withOpacity(0.4))),
          ],
        ),
      ),
    );
  }

  Widget _predictionRow(BuildContext context, MatchPrediction pred) {
    final isCorrect = pred.status == 'correct';
    final bgColor = isCorrect
        ? AppColors.neonGreen.withOpacity(0.06)
        : AppColors.red.withOpacity(0.08);
    final icon = isCorrect ? '✅' : '❌';
    final coinsColor = isCorrect ? AppColors.neonGreen : AppColors.red;
    final coinsStr = pred.coinsResult != null
        ? (pred.coinsResult! >= 0 ? '+${pred.coinsResult}' : '${pred.coinsResult}')
        : '';

    // Localize question text
    final parts = pred.questionText.split('|');
    final qText = parts.length == 2
        ? (identical(AppStrings.current, AppStrings.en) ? parts[0].trim() : parts[1].trim())
        : pred.questionText;

    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: sp(context, h: 9, v: 6),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Text(icon, style: TextStyle(fontSize: sf(context, 13))),
          SizedBox(width: s(context, 7)),
          Expanded(
            child: Text(qText,
              style: TextStyle(fontSize: sf(context, 11), color: AppColors.textSecondary.withOpacity(0.7)),
              maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          Text(coinsStr,
            style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: sf(context, 12),
              fontWeight: FontWeight.w700, color: coinsColor)),
        ],
      ),
    );
  }
}
