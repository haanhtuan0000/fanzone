import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';

class MyPositionCard extends StatelessWidget {
  final int rank;
  final int coins;
  final int delta;

  const MyPositionCard({
    super.key,
    required this.rank,
    required this.coins,
    this.delta = 0,
  });

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.neonGreen.withOpacity(0.15),
            AppColors.neonGreen.withOpacity(0.05),
          ],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.neonGreen.withOpacity(0.5)),
      ),
      child: Row(
        children: [
          // Rank
          Text(
            '#$rank',
            style: const TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: 32,
              color: AppColors.neonGreen,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  s.yourPosition,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                ),
              ],
            ),
          ),
          // Coins
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Row(
                children: [
                  const Icon(Icons.monetization_on, color: AppColors.amber, size: 18),
                  const SizedBox(width: 4),
                  Text(
                    '$coins',
                    style: const TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      color: AppColors.amber,
                      fontSize: 20,
                    ),
                  ),
                ],
              ),
              if (delta != 0)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      delta > 0 ? Icons.arrow_upward : Icons.arrow_downward,
                      color: delta > 0 ? AppColors.neonGreen : AppColors.red,
                      size: 14,
                    ),
                    Text(
                      '${delta.abs()}',
                      style: TextStyle(
                        color: delta > 0 ? AppColors.neonGreen : AppColors.red,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}
