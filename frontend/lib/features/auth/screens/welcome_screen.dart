import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(flex: 2),
              // Logo
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.neonGreen, width: 3),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.neonGreen.withOpacity(0.3),
                      blurRadius: 30,
                      spreadRadius: 5,
                    ),
                  ],
                ),
                child: const Center(
                  child: Text(
                    'FZ',
                    style: TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 48,
                      color: AppColors.neonGreen,
                      letterSpacing: 4,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 32),
              // Title
              const Text(
                'FANZONE',
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: 48,
                  color: AppColors.textPrimary,
                  letterSpacing: 6,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Du doan. Canh tranh. Thong tri.',
                style: TextStyle(
                  fontFamily: AppFonts.barlowCondensed,
                  fontSize: 18,
                  color: AppColors.textSecondary,
                  letterSpacing: 1,
                ),
              ),
              const Spacer(flex: 3),
              // Start button
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: () => context.go('/register'),
                  child: const Text(
                    'BAT DAU',
                    style: TextStyle(fontSize: 18, letterSpacing: 2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              // Login link
              TextButton(
                onPressed: () => context.go('/login'),
                child: RichText(
                  text: const TextSpan(
                    text: 'Da co tai khoan? ',
                    style: TextStyle(color: AppColors.textSecondary, fontSize: 16),
                    children: [
                      TextSpan(
                        text: 'Dang nhap',
                        style: TextStyle(color: AppColors.neonGreen, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 48),
            ],
          ),
        ),
      ),
    );
  }
}
