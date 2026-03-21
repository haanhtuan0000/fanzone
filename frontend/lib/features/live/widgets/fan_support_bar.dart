import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class FanSupportBar extends StatelessWidget {
  final int homePercent;
  const FanSupportBar({super.key, this.homePercent = 50});

  @override
  Widget build(BuildContext context) {
    final awayPercent = 100 - homePercent;
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('$homePercent%', style: const TextStyle(color: AppColors.blue, fontWeight: FontWeight.w600)),
            const Text('Fan Support', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
            Text('$awayPercent%', style: const TextStyle(color: AppColors.red, fontWeight: FontWeight.w600)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: SizedBox(
            height: 8,
            child: Row(
              children: [
                Expanded(
                  flex: homePercent,
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [AppColors.blue, Color(0xFF6BB5FF)],
                      ),
                    ),
                  ),
                ),
                Expanded(
                  flex: awayPercent,
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFFFF6666), AppColors.red],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
