import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/models/match.dart';

class StatsGrid extends StatelessWidget {
  final MatchData match;
  const StatsGrid({super.key, required this.match});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _StatBox(
          icon: Icons.pie_chart,
          label: 'Kiem soat',
          value: '50%',
          color: AppColors.blue,
        ),
        const SizedBox(width: 8),
        _StatBox(
          icon: Icons.sports_soccer,
          label: 'Sut',
          value: '0',
          color: AppColors.neonGreen,
        ),
        const SizedBox(width: 8),
        _StatBox(
          icon: Icons.square,
          label: 'The vang',
          value: '0',
          color: AppColors.amber,
        ),
        const SizedBox(width: 8),
        _StatBox(
          icon: Icons.flag,
          label: 'Phat goc',
          value: '0',
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
