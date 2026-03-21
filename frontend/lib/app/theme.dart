import 'package:flutter/material.dart';
import 'constants.dart';

final fanZoneTheme = ThemeData(
  brightness: Brightness.dark,
  scaffoldBackgroundColor: AppColors.background,
  primaryColor: AppColors.neonGreen,
  colorScheme: const ColorScheme.dark(
    primary: AppColors.neonGreen,
    secondary: AppColors.amber,
    surface: AppColors.cardSurface,
    error: AppColors.red,
    onPrimary: AppColors.background,
    onSecondary: AppColors.background,
    onSurface: AppColors.textPrimary,
    onError: AppColors.textPrimary,
  ),
  fontFamily: AppFonts.barlowCondensed,
  textTheme: const TextTheme(
    displayLarge: TextStyle(
      fontFamily: AppFonts.bebasNeue,
      fontSize: 48,
      color: AppColors.textPrimary,
      letterSpacing: 2,
    ),
    displayMedium: TextStyle(
      fontFamily: AppFonts.bebasNeue,
      fontSize: 36,
      color: AppColors.textPrimary,
      letterSpacing: 1.5,
    ),
    headlineLarge: TextStyle(
      fontFamily: AppFonts.barlowCondensed,
      fontSize: 24,
      fontWeight: FontWeight.w700,
      color: AppColors.textPrimary,
    ),
    headlineMedium: TextStyle(
      fontFamily: AppFonts.barlowCondensed,
      fontSize: 20,
      fontWeight: FontWeight.w600,
      color: AppColors.textPrimary,
    ),
    bodyLarge: TextStyle(
      fontFamily: AppFonts.barlowCondensed,
      fontSize: 16,
      color: AppColors.textPrimary,
    ),
    bodyMedium: TextStyle(
      fontFamily: AppFonts.barlowCondensed,
      fontSize: 14,
      color: AppColors.textSecondary,
    ),
    labelLarge: TextStyle(
      fontFamily: AppFonts.barlowCondensed,
      fontSize: 14,
      fontWeight: FontWeight.w600,
      color: AppColors.neonGreen,
      letterSpacing: 1,
    ),
  ),
  cardTheme: CardTheme(
    color: AppColors.cardSurface,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(AppSizes.cardRadius),
    ),
    elevation: 0,
  ),
  elevatedButtonTheme: ElevatedButtonThemeData(
    style: ElevatedButton.styleFrom(
      backgroundColor: AppColors.neonGreen,
      foregroundColor: AppColors.background,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSizes.buttonRadius),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      textStyle: const TextStyle(
        fontFamily: AppFonts.barlowCondensed,
        fontSize: 16,
        fontWeight: FontWeight.w700,
        letterSpacing: 1,
      ),
    ),
  ),
  outlinedButtonTheme: OutlinedButtonThemeData(
    style: OutlinedButton.styleFrom(
      foregroundColor: AppColors.neonGreen,
      side: const BorderSide(color: AppColors.neonGreen),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSizes.buttonRadius),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
    ),
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: AppColors.cardSurface,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppSizes.buttonRadius),
      borderSide: BorderSide.none,
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppSizes.buttonRadius),
      borderSide: const BorderSide(color: AppColors.neonGreen),
    ),
    hintStyle: const TextStyle(color: AppColors.textSecondary),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
  ),
  bottomNavigationBarTheme: const BottomNavigationBarThemeData(
    backgroundColor: AppColors.cardSurface,
    selectedItemColor: AppColors.neonGreen,
    unselectedItemColor: AppColors.textSecondary,
    type: BottomNavigationBarType.fixed,
    elevation: 8,
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: AppColors.background,
    elevation: 0,
    centerTitle: true,
    titleTextStyle: TextStyle(
      fontFamily: AppFonts.bebasNeue,
      fontSize: 24,
      color: AppColors.textPrimary,
      letterSpacing: 2,
    ),
  ),
  dividerTheme: const DividerThemeData(
    color: AppColors.divider,
    thickness: 1,
  ),
);
