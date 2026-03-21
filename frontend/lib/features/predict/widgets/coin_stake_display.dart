import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class CoinStakeDisplay extends StatelessWidget {
  final int coinsBet;
  final double multiplier;

  const CoinStakeDisplay({
    super.key,
    required this.coinsBet,
    required this.multiplier,
  });

  @override
  Widget build(BuildContext context) {
    final potential = (coinsBet * multiplier).round();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.monetization_on, color: AppColors.amber, size: 20),
          const SizedBox(width: 6),
          Text(
            'Cuoc $coinsBet',
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          Text(
            '  x  ${multiplier.toStringAsFixed(1)}  =  ',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 16),
          ),
          Text(
            '$potential coins',
            style: const TextStyle(
              fontFamily: AppFonts.bebasNeue,
              color: AppColors.neonGreen,
              fontSize: 20,
            ),
          ),
        ],
      ),
    );
  }
}
