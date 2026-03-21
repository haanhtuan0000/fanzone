import 'package:flutter/material.dart';
import '../../../app/constants.dart';

class StatTile extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  const StatTile({
    super.key,
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 18),
              const SizedBox(width: 6),
              Text(
                label,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontFamily: AppFonts.bebasNeue,
              fontSize: 28,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
