import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';

class MyPositionCard extends StatelessWidget {
  final int rank;
  final int coins;
  final int delta;
  final String? scopeLabel;

  const MyPositionCard({
    super.key,
    required this.rank,
    required this.coins,
    this.delta = 0,
    this.scopeLabel,
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
          // Rank + delta text
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    '#$rank',
                    style: const TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 32,
                      color: AppColors.neonGreen,
                    ),
                  ),
                  if (scopeLabel != null) ...[
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.neonGreen.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        scopeLabel!,
                        style: const TextStyle(
                          color: AppColors.neonGreen,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              Text(
                s.yourPosition,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
              if (delta > 0)
                Text(
                  s.rosePositions(delta),
                  style: const TextStyle(color: AppColors.neonGreen, fontSize: 12),
                ),
            ],
          ),
          const Spacer(),
          // Coins + today delta
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Row(
                children: [
                  Text(
                    '$coins',
                    style: const TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      color: AppColors.amber,
                      fontSize: 20,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Text('🪙', style: TextStyle(fontSize: 14)),
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
                      '${delta > 0 ? "+" : ""}$delta',
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
