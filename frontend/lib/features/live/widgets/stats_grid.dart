import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/models/match.dart';

class StatsGrid extends StatelessWidget {
  final MatchData match;
  const StatsGrid({super.key, required this.match});

  @override
  Widget build(BuildContext context) {
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

    return Row(
      children: [
        _StatBox(
          icon: Icons.pie_chart,
          label: 'Kiem soat',
          value: possessionStr == '-' ? '-' : '$possessionStr%',
          color: AppColors.blue,
        ),
        const SizedBox(width: 8),
        _StatBox(
          icon: Icons.sports_soccer,
          label: 'Sut',
          value: shotsTotal,
          color: AppColors.neonGreen,
        ),
        const SizedBox(width: 8),
        _StatBox(
          icon: Icons.square,
          label: 'The vang',
          value: cardsTotal,
          color: AppColors.amber,
        ),
        const SizedBox(width: 8),
        _StatBox(
          icon: Icons.flag,
          label: 'Phat goc',
          value: cornersTotal,
          color: AppColors.textPrimary,
        ),
      ],
    );
  }
}

class _StatBox extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _StatBox({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.cardSurface,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(height: 4),
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
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
