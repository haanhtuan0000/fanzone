import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    await ref.read(authStateProvider.notifier).login(
      _emailController.text.trim(),
      _passwordController.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);

    ref.listen<AuthState>(authStateProvider, (prev, next) {
      if (next.isAuthenticated) {
        context.go(next.isOnboarded ? '/live' : '/onboarding');
      }
    });

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/welcome'),
        ),
        title: const Text('DANG NHAP'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 48),
                // FZ logo small
                const Center(
                  child: Text(
                    'FZ',
                    style: TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: 64,
                      color: AppColors.neonGreen,
                      letterSpacing: 4,
                    ),
                  ),
                ),
                const SizedBox(height: 48),
                TextFormField(
                  controller: _emailController,
                  decoration: const InputDecoration(
                    hintText: 'Email',
                    prefixIcon: Icon(Icons.email_outlined, color: AppColors.textSecondary),
                  ),
                  keyboardType: TextInputType.emailAddress,
                  style: const TextStyle(color: AppColors.textPrimary),
                  validator: (value) {
                    if (value == null || !value.contains('@')) return 'Email khong hop le';
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordController,
                  decoration: const InputDecoration(
                    hintText: 'Mat khau',
                    prefixIcon: Icon(Icons.lock_outline, color: AppColors.textSecondary),
                  ),
                  obscureText: true,
                  style: const TextStyle(color: AppColors.textPrimary),
                  validator: (value) {
                    if (value == null || value.isEmpty) return 'Nhap mat khau';
                    return null;
                  },
                ),
                const SizedBox(height: 24),
                if (authState.error != null) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.red.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.red.withOpacity(0.3)),
                    ),
                    child: Text(
                      authState.error!,
                      style: const TextStyle(color: AppColors.red, fontSize: 14),
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                SizedBox(
                  height: 52,
                  child: ElevatedButton(
                    onPressed: authState.isLoading ? null : _login,
                    child: authState.isLoading
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.background),
                          )
                        : const Text('DANG NHAP', style: TextStyle(letterSpacing: 2)),
                  ),
                ),
                const SizedBox(height: 24),
                TextButton(
                  onPressed: () => context.go('/register'),
                  child: RichText(
                    textAlign: TextAlign.center,
                    text: const TextSpan(
                      text: 'Chua co tai khoan? ',
                      style: TextStyle(color: AppColors.textSecondary),
                      children: [
                        TextSpan(
                          text: 'Dang ky ngay',
                          style: TextStyle(color: AppColors.neonGreen, fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
