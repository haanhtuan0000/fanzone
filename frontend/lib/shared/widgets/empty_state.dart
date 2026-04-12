import 'package:flutter/material.dart';
import '../../app/constants.dart';
import '../../app/responsive.dart';

/// Shared empty state widget matching v3.0 design spec.
/// Usage: EmptyState(icon: '⚡', title: 'No questions', subtitle: 'Questions appear automatically...')
class EmptyState extends StatelessWidget {
  final String icon;
  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: sp(context, h: 20, v: 36),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(icon, style: TextStyle(fontSize: sf(context, 40), color: AppColors.textSecondary.withOpacity(0.35))),
          SizedBox(height: s(context, 10)),
          Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: AppFonts.barlowCondensed,
              fontSize: sf(context, 16),
              fontWeight: FontWeight.w700,
              color: AppColors.textSecondary,
              letterSpacing: 0.5,
            ),
          ),
          if (subtitle != null) ...[
            SizedBox(height: s(context, 6)),
            Text(
              subtitle!,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: sf(context, 12),
                color: AppColors.textSecondary.withOpacity(0.4),
                height: 1.6,
              ),
            ),
          ],
          if (actionLabel != null && onAction != null) ...[
            SizedBox(height: s(context, 12)),
            GestureDetector(
              onTap: onAction,
              child: Container(
                padding: sp(context, h: 18, v: 8),
                decoration: BoxDecoration(
                  color: AppColors.neonGreen.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppColors.neonGreen.withOpacity(0.25)),
                ),
                child: Text(
                  actionLabel!,
                  style: TextStyle(
                    fontFamily: AppFonts.barlowCondensed,
                    fontSize: sf(context, 11),
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                    color: AppColors.neonGreen,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
