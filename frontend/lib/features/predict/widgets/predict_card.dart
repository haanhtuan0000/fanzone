import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../core/models/question.dart';

String _localized(String text) {
  final parts = text.split('|');
  if (parts.length == 2) {
    return identical(AppStrings.current, AppStrings.en) ? parts[0].trim() : parts[1].trim();
  }
  return text;
}

class PredictCard extends StatelessWidget {
  final Question question;
  const PredictCard({super.key, required this.question});

  Color get _categoryColor {
    switch (question.category) {
      case 'GOAL': return AppColors.neonGreen;
      case 'CARD': return AppColors.amber;
      case 'CORNER': return AppColors.textPrimary;
      case 'VAR': return AppColors.blue;
      case 'HALFTIME': return AppColors.purple;
      case 'SUBSTITUTION': return AppColors.amber;
      default: return AppColors.textSecondary;
    }
  }

  String get _categorySvgPath {
    switch (question.category) {
      case 'GOAL': return 'assets/svg/questions/goal.svg';
      case 'CARD': return 'assets/svg/questions/card.svg';
      case 'CORNER': return 'assets/svg/questions/corner.svg';
      case 'VAR': return 'assets/svg/questions/var.svg';
      case 'SUB':
      case 'SUBSTITUTION': return 'assets/svg/questions/substitution.svg';
      case 'TIME':
      case 'HALFTIME': return 'assets/svg/questions/time.svg';
      case 'MOMENTUM': return 'assets/svg/questions/goal.svg';
      case 'STAT': return 'assets/svg/questions/goal.svg';
      default: return 'assets/svg/questions/goal.svg';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: sa(context, 20),
      decoration: BoxDecoration(
        color: AppColors.cardSurface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          // Category tag + reward
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: sp(context, h: 10, v: 4),
                decoration: BoxDecoration(
                  color: _categoryColor.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SvgPicture.asset(_categorySvgPath, width: 16, height: 16,
                      colorFilter: ColorFilter.mode(_categoryColor, BlendMode.srcIn)),
                    const SizedBox(width: 4),
                    Text(
                      question.category,
                      style: TextStyle(
                        color: _categoryColor,
                        fontSize: sf(context, 12),
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
              ),
              Row(
                children: [
                  Icon(Icons.monetization_on, color: AppColors.amber, size: s(context, 18)),
                  const SizedBox(width: 4),
                  Text(
                    '${question.rewardCoins}',
                    style: TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      color: AppColors.amber,
                      fontSize: sf(context, 18),
                    ),
                  ),
                ],
              ),
            ],
          ),
          SizedBox(height: s(context, 16)),
          // Question text
          Text(
            _localized(question.text),
            style: TextStyle(
              fontFamily: AppFonts.barlowCondensed,
              fontSize: sf(context, 16),
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
              height: 1.3,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
