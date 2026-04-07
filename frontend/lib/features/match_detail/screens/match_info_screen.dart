import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/match.dart';

class MatchInfoScreen extends StatelessWidget {
  final int fixtureId;
  final MatchData? match;

  const MatchInfoScreen({super.key, required this.fixtureId, this.match});

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    final m = match;

    return Scaffold(
      appBar: AppBar(
        title: Text(s.matchInfo),
        actions: [
          if (m?.kickoffTime != null)
            Padding(
              padding: const EdgeInsets.only(right: 16),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.amber.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: AppColors.amber.withOpacity(0.22)),
                ),
                child: Text(
                  _formatTime(m!.kickoffTime!),
                  style: const TextStyle(
                    fontFamily: AppFonts.barlowCondensed,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: AppColors.amber,
                  ),
                ),
              ),
            ),
        ],
      ),
      body: m == null
          ? const Center(child: Text('No match data', style: TextStyle(color: AppColors.textSecondary)))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  // Teams card
                  _teamsCard(m, s),
                  const SizedBox(height: 12),

                  // Reminder button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text('🔔 ${s.reminderSet}'),
                            backgroundColor: AppColors.amber.withOpacity(0.9),
                            duration: const Duration(seconds: 2),
                          ),
                        );
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.amber,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(11)),
                        textStyle: const TextStyle(
                          fontFamily: AppFonts.barlowCondensed,
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1,
                        ),
                      ),
                      child: Text('🔔 ${s.setReminder}'),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // H2H row
                  _h2hRow(m, s),
                ],
              ),
            ),
    );
  }

  Widget _teamsCard(MatchData m, dynamic s) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment(-1, -0.5),
          end: Alignment(1, 1),
          colors: [Color(0xFF0a1220), Color(0xFF08081a)],
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.divider),
      ),
      child: Column(
        children: [
          // Teams
          Row(
            children: [
              Expanded(child: _teamCol(m.homeLogoUrl, m.homeTeam)),
              const Text('VS',
                style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 36,
                  letterSpacing: 3, color: AppColors.textSecondary)),
              Expanded(child: _teamCol(m.awayLogoUrl, m.awayTeam)),
            ],
          ),
          const SizedBox(height: 14),

          // Kickoff
          if (m.kickoffTime != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(9),
              decoration: BoxDecoration(
                color: AppColors.amber.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.amber.withOpacity(0.2)),
              ),
              child: Column(
                children: [
                  Text(s.kickoffLabel,
                    style: const TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: 9,
                      fontWeight: FontWeight.w700, letterSpacing: 2, color: AppColors.amber)),
                  const SizedBox(height: 3),
                  Text(_formatTime(m.kickoffTime!),
                    style: const TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 36,
                      letterSpacing: 3, color: AppColors.amber)),
                ],
              ),
            ),

          const SizedBox(height: 10),
          // League info
          Text(
            [m.league, m.leagueRound].where((e) => e != null).join(' · '),
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 10, letterSpacing: 0.5,
              color: AppColors.textSecondary.withOpacity(0.4),
              fontFamily: AppFonts.barlowCondensed),
          ),
        ],
      ),
    );
  }

  Widget _teamCol(String? logoUrl, String name) {
    return Column(
      children: [
        if (logoUrl != null)
          CachedNetworkImage(imageUrl: logoUrl, width: 48, height: 48,
            errorWidget: (_, __, ___) => const Text('⚽', style: TextStyle(fontSize: 32)))
        else
          const Text('⚽', style: TextStyle(fontSize: 32)),
        const SizedBox(height: 5),
        Text(name,
          textAlign: TextAlign.center,
          style: const TextStyle(fontFamily: AppFonts.barlowCondensed, fontSize: 14,
            fontWeight: FontWeight.w700, color: AppColors.textPrimary)),
      ],
    );
  }

  Widget _h2hRow(MatchData m, dynamic s) {
    return Row(
      children: [
        _h2hItem(s.wins(m.homeTeam.length > 8 ? m.homeTeam.substring(0, 8) : m.homeTeam),
            '-', AppColors.neonGreen),
        const SizedBox(width: 7),
        _h2hItem(s.draws, '-', AppColors.textSecondary),
        const SizedBox(width: 7),
        _h2hItem(s.wins(m.awayTeam.length > 8 ? m.awayTeam.substring(0, 8) : m.awayTeam),
            '-', AppColors.amber),
      ],
    );
  }

  Widget _h2hItem(String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
        decoration: BoxDecoration(
          color: AppColors.cardSurfaceLight.withOpacity(0.3),
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: AppColors.divider),
        ),
        child: Column(
          children: [
            Text(value,
              style: TextStyle(fontFamily: AppFonts.bebasNeue, fontSize: 20, color: color)),
            Text(label,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 9, letterSpacing: 0.4,
                color: AppColors.textSecondary.withOpacity(0.4))),
          ],
        ),
      ),
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}
