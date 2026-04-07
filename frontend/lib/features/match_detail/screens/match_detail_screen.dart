import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/match.dart';
import '../providers/match_detail_provider.dart';

class MatchDetailScreen extends ConsumerWidget {
  final int fixtureId;
  final MatchData? match;

  const MatchDetailScreen({super.key, required this.fixtureId, this.match});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = AppStrings.current;
    final detailAsync = ref.watch(matchDetailProvider(fixtureId));

    return Scaffold(
      appBar: AppBar(
        title: Text(s.matchResult),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.cardSurfaceLight,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppColors.divider),
              ),
              child: Text('FT',
                style: TextStyle(
                  fontFamily: AppFonts.barlowCondensed,
                  fontSize: 10,
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
            SliverToBoxAdapter(child: _staticScoreboard(s)),

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
                SliverToBoxAdapter(child: _statsCard(s, detail.stats)),

              // Timeline card
              if (detail.events.isNotEmpty)
                SliverToBoxAdapter(child: _timelineCard(s, detail.events)),

              // My predictions card
              if (detail.predictions.isNotEmpty)
                SliverToBoxAdapter(child: _predictionsCard(s, detail.predictions)),

              // Empty predictions
              if (detail.predictions.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    child: Text(s.noPredictions,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  ),
                ),

              const SliverToBoxAdapter(child: SizedBox(height: 24)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _staticScoreboard(dynamic s) {
    final m = match!;
    return Container(
      margin: const EdgeInsets.fromLTRB(14, 8, 14, 12),
      padding: const EdgeInsets.all(16),
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
              Expanded(child: _ftTeamColumn(m.homeLogoUrl, m.homeTeam)),
              Column(
                children: [
                  Text(
                    '${m.homeScore}–${m.awayScore}',
                    style: TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 52,
                      letterSpacing: 4,
                      color: AppColors.textPrimary.withOpacity(0.48),
                    ),
                  ),
                  Text(s.fullTimeLabel,
                    style: TextStyle(
                      fontFamily: AppFonts.barlowCondensed,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2,
                      color: AppColors.textSecondary.withOpacity(0.4),
                    )),
                ],
              ),
              Expanded(child: _ftTeamColumn(m.awayLogoUrl, m.awayTeam)),
            ],
          ),
          // Meta chips
          const SizedBox(height: 9),
          Wrap(
            spacing: 5,
            runSpacing: 5,
            alignment: WrapAlignment.center,
            children: [
              if (m.league != null) _chip(m.league!),
              if (m.leagueRound != null) _chip(m.leagueRound!),
            ],
          ),
        ],
      ),
    );
  }

  Widget _ftTeamColumn(String? logoUrl, String name) {
    return Column(
      children: [
        if (logoUrl != null)
          CachedNetworkImage(imageUrl: logoUrl, width: 40, height: 40,
            errorWidget: (_, __, ___) => const Text('⚽', style: TextStyle(fontSize: 28)))
        else
          const Text('⚽', style: TextStyle(fontSize: 28)),
        const SizedBox(height: 5),
        Text(name,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontFamily: AppFonts.barlowCondensed,
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: AppColors.textSecondary.withOpacity(0.7),
          )),
      ],
    );
  }

  Widget _chip(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.cardSurfaceLight.withOpacity(0.3),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.divider),
      ),
      child: Text(text,
        style: TextStyle(
          fontFamily: AppFonts.barlowCondensed,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
          color: AppColors.textSecondary.withOpacity(0.5),
        )),
    );
  }

  Widget _statsCard(dynamic s, Map<String, dynamic> stats) {
    return Container(
      margin: const EdgeInsets.fromLTRB(14, 0, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.divider)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('📊 ${s.matchStats}',
                  style: const TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: 11,
                    fontWeight: FontWeight.w700, letterSpacing: 2, color: AppColors.textSecondary)),
                _chip(s.fullTimeLabel),
              ],
            ),
          ),
          // Stat rows
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                _fstRow(stats['possession'], s.statPossession, true, 0),
                _fstRow(stats['shots'], s.statShots, false, 1),
                _fstRow(stats['shotsOnTarget'], s.statOnTarget, false, 2),
                _fstRow(stats['corners'], s.statCorners, false, 3),
                _fstRow(stats['yellowCards'], s.statCards, false, 4),
                _fstRow(stats['offsides'], s.statOffsides, false, 5),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _fstRow(Map<String, dynamic>? stat, String label, bool isPossession, int index) {
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
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
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
              style: const TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: 13,
                fontWeight: FontWeight.w700, color: AppColors.blue)),
          ),
          SizedBox(
            width: 100,
            child: Text(label,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 9, letterSpacing: 0.5,
                fontFamily: AppFonts.barlowCondensed,
                color: AppColors.textSecondary.withOpacity(0.4))),
          ),
          Expanded(
            child: Text(awayVal,
              textAlign: TextAlign.left,
              style: const TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: 13,
                fontWeight: FontWeight.w700, color: AppColors.amber)),
          ),
        ],
      ),
    );
  }

  Widget _timelineCard(dynamic s, List<MatchEvent> events) {
    return Container(
      margin: const EdgeInsets.fromLTRB(14, 0, 14, 12),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 11),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.divider)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('📋 ${s.matchTimeline}',
                  style: const TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: 11,
                    fontWeight: FontWeight.w700, letterSpacing: 2, color: AppColors.textSecondary)),
                _chip('90\''),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: events.map((e) => _timelineItem(e)).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _timelineItem(MatchEvent event) {
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
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(9),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 32,
            child: Text(minuteStr,
              textAlign: TextAlign.right,
              style: const TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 15, color: AppColors.textSecondary)),
          ),
          const SizedBox(width: 9),
          Text(event.icon, style: const TextStyle(fontSize: 15)),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${event.playerName ?? ''} ${event.teamName != null ? '(${event.teamName})' : ''}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                ),
                if (event.detail != null || event.assistName != null)
                  Text(
                    event.assistName != null ? 'Assist: ${event.assistName}' : event.detail ?? '',
                    style: TextStyle(fontSize: 10, color: AppColors.textSecondary.withOpacity(0.4)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _predictionsCard(dynamic s, List<MatchPrediction> predictions) {
    final correct = predictions.where((p) => p.status == 'correct').length;
    final wrong = predictions.where((p) => p.status == 'wrong').length;
    final totalCoins = predictions.fold<int>(0, (sum, p) => sum + (p.coinsResult ?? 0));
    final accuracy = predictions.isNotEmpty ? (correct / predictions.length * 100).round() : 0;

    return Container(
      margin: const EdgeInsets.fromLTRB(14, 0, 14, 12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: AppColors.neonGreen.withOpacity(0.18)),
        color: AppColors.neonGreen.withOpacity(0.04),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.neonGreen.withOpacity(0.1))),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('🎯 ${s.myPredictionsTitle}',
                  style: const TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: 10,
                    fontWeight: FontWeight.w700, letterSpacing: 2, color: AppColors.neonGreen)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.neonGreen.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppColors.neonGreen.withOpacity(0.22)),
                  ),
                  child: Text('${totalCoins >= 0 ? '+' : ''}$totalCoins🪙',
                    style: const TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: 9,
                      fontWeight: FontWeight.w700, color: AppColors.neonGreen)),
                ),
              ],
            ),
          ),

          // Summary row
          Row(
            children: [
              _summaryItem('$correct', s.correctStatus, AppColors.neonGreen),
              _summaryItem('$wrong', s.wrongStatus, AppColors.red),
              _summaryItem('${totalCoins >= 0 ? '+' : ''}$totalCoins', '🪙', AppColors.amber),
              _summaryItem('$accuracy%', s.accuracy, AppColors.purple),
            ],
          ),

          // Prediction list
          Padding(
            padding: const EdgeInsets.fromLTRB(9, 7, 9, 9),
            child: Column(
              children: predictions.map((p) => _predictionRow(p)).toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _summaryItem(String value, String label, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 7),
        decoration: const BoxDecoration(
          border: Border(right: BorderSide(color: AppColors.divider)),
        ),
        child: Column(
          children: [
            Text(value,
              style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 23, color: color)),
            Text(label,
              style: TextStyle(fontSize: 9, letterSpacing: 0.5,
                color: AppColors.textSecondary.withOpacity(0.4))),
          ],
        ),
      ),
    );
  }

  Widget _predictionRow(MatchPrediction pred) {
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
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Text(icon, style: const TextStyle(fontSize: 13)),
          const SizedBox(width: 7),
          Expanded(
            child: Text(qText,
              style: TextStyle(fontSize: 11, color: AppColors.textSecondary.withOpacity(0.7)),
              maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
          Text(coinsStr,
            style: TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: 12,
              fontWeight: FontWeight.w700, color: coinsColor)),
        ],
      ),
    );
  }
}
