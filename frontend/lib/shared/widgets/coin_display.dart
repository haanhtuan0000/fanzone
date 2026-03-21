import 'package:flutter/material.dart';
import '../../app/constants.dart';

class CoinDisplay extends StatelessWidget {
  final int coins;
  final double fontSize;

  const CoinDisplay({super.key, required this.coins, this.fontSize = 16});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.monetization_on, color: AppColors.amber, size: fontSize + 4),
        const SizedBox(width: 4),
        Text(
          '$coins',
          style: TextStyle(
            fontFamily: AppFonts.bebasNeue,
            fontSize: fontSize,
            color: AppColors.amber,
            letterSpacing: 1,
          ),
        ),
      ],
    );
  }
}
