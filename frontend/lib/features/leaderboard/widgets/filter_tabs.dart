import 'package:flutter/material.dart';
import '../../../app/constants.dart';
import '../../../core/l10n/app_strings.dart';
import '../../../shared/utils/country_utils.dart';

class FilterTabs extends StatelessWidget {
  final String selectedScope;
  final ValueChanged<String> onScopeChanged;
  final String? countryCode;

  const FilterTabs({
    super.key,
    required this.selectedScope,
    required this.onScopeChanged,
    this.countryCode,
  });

  @override
  Widget build(BuildContext context) {
    final s = AppStrings.current;
    final countryLabel = countryCode != null
        ? '${countryFlag(countryCode)} $countryCode'
        : '🌍';
    final tabs = [
      ('match', s.tabMatch),
      ('week', s.tabWeek),
      ('global', s.tabGlobal),
      ('country', countryLabel),
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: tabs.map((tab) {
          final isSelected = tab.$1 == selectedScope;
          return Expanded(
            child: GestureDetector(
              onTap: () => onScopeChanged(tab.$1),
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 4),
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: isSelected ? AppColors.neonGreen : AppColors.cardSurface,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  tab.$2,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: isSelected ? AppColors.background : AppColors.textSecondary,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.normal,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
