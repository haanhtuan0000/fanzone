import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/l10n/app_strings.dart';
import '../providers/auth_provider.dart';

class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final str = AppStrings.current;
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: sp(context, h: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(flex: 2),
              // Logo
              Container(
                width: s(context, 120),
                height: s(context, 120),
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
                child: Center(
                  child: Text(
                    'FZ',
                    style: TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: sf(context, 48),
                      color: AppColors.neonGreen,
                      letterSpacing: 4,
                    ),
                  ),
                ),
              ),
              SizedBox(height: s(context, 32)),
              // Title
              Text(
                'FANZONE',
                style: TextStyle(
                  fontFamily: AppFonts.bebasNeue,
                  fontSize: sf(context, 48),
                  color: AppColors.textPrimary,
                  letterSpacing: 6,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                str.tagline,
                style: TextStyle(
                  fontFamily: AppFonts.barlowCondensed,
                  fontSize: sf(context, 18),
                  color: AppColors.textSecondary,
                  letterSpacing: 1,
                ),
              ),
              const Spacer(flex: 3),
              // Google Sign-In button
              SizedBox(
                width: double.infinity,
                height: s(context, 52),
                child: OutlinedButton.icon(
                  onPressed: authState.isLoading
                      ? null
                      : () => ref.read(authStateProvider.notifier).loginWithGoogle(),
                  icon: authState.isLoading
                      ? SizedBox(
                          width: s(context, 20),
                          height: s(context, 20),
                          child: const CircularProgressIndicator(strokeWidth: 2, color: AppColors.textSecondary),
                        )
                      : Image.network(
                          'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg',
                          width: s(context, 20),
                          height: s(context, 20),
                          errorBuilder: (_, __, ___) => Icon(Icons.g_mobiledata, size: s(context, 24)),
                        ),
                  label: Text(
                    authState.isLoading ? 'LOADING...' : str.loginWithGoogle,
                    style: TextStyle(letterSpacing: 1, fontSize: sf(context, 14)),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.textPrimary,
                    side: const BorderSide(color: AppColors.divider),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              SizedBox(height: s(context, 12)),
              // Email register button
              SizedBox(
                width: double.infinity,
                height: s(context, 52),
                child: ElevatedButton(
                  onPressed: authState.isLoading
                      ? null
                      : () { ref.read(authStateProvider.notifier).clearError(); context.go('/register'); },
                  child: Text(
                    str.registerWithEmail,
                    style: TextStyle(fontSize: sf(context, 14), letterSpacing: 2),
                  ),
                ),
              ),
              SizedBox(height: s(context, 16)),
              // Error message
              if (authState.error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(
                    authState.error!,
                    style: TextStyle(color: AppColors.red, fontSize: sf(context, 13)),
                    textAlign: TextAlign.center,
                  ),
                ),
              // Login link
              TextButton(
                onPressed: () { ref.read(authStateProvider.notifier).clearError(); context.go('/login'); },
                child: RichText(
                  text: TextSpan(
                    text: str.alreadyHaveAccount,
                    style: TextStyle(color: AppColors.textSecondary, fontSize: sf(context, 16)),
                    children: [
                      TextSpan(
                        text: str.loginLink,
                        style: const TextStyle(color: AppColors.neonGreen, fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                ),
              ),
              SizedBox(height: s(context, 48)),
            ],
          ),
        ),
      ),
    );
  }
}
