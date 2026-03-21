import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';

class PredictBanner extends StatelessWidget {
  const PredictBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.go('/predict'),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              AppColors.neonGreen.withOpacity(0.2),
              AppColors.neonGreen.withOpacity(0.05),
            ],
          ),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.neonGreen.withOpacity(0.5)),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppColors.neonGreen.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.bolt, color: AppColors.neonGreen, size: 24),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'DU DOAN NGAY!',
                    style: TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 18,
                      color: AppColors.neonGreen,
                      letterSpacing: 1,
                    ),
                  ),
                  Text(
                    'Cau hoi moi dang cho ban',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios, color: AppColors.neonGreen, size: 16),
          ],
        ),
      ),
    );
  }
}
