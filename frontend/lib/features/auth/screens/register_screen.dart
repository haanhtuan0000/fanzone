import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../providers/auth_provider.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    await ref.read(authStateProvider.notifier).register(
      _emailController.text.trim(),
      _passwordController.text,
      displayName: _nameController.text.trim().isEmpty ? null : _nameController.text.trim(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authStateProvider);

    ref.listen<AuthState>(authStateProvider, (prev, next) {
      if (next.isAuthenticated && !next.isOnboarded) {
        context.go('/onboarding');
      }
    });

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/welcome'),
        ),
        title: const Text('DANG KY'),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 32),
                TextFormField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    hintText: 'Ten hien thi (tuy chon)',
                    prefixIcon: Icon(Icons.person_outline, color: AppColors.textSecondary),
                  ),
                  style: const TextStyle(color: AppColors.textPrimary),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _emailController,
                  decoration: const InputDecoration(
                    hintText: 'Email',
                    prefixIcon: Icon(Icons.email_outlined, color: AppColors.textSecondary),
                  ),
                  keyboardType: TextInputType.emailAddress,
                  style: const TextStyle(color: AppColors.textPrimary),
                  validator: (value) {
                    if (value == null || !value.contains('@')) {
                      return 'Email khong hop le';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passwordController,
                  decoration: const InputDecoration(
                    hintText: 'Mat khau (6+ ky tu)',
                    prefixIcon: Icon(Icons.lock_outline, color: AppColors.textSecondary),
                  ),
                  obscureText: true,
                  style: const TextStyle(color: AppColors.textPrimary),
                  validator: (value) {
                    if (value == null || value.length < 6) {
                      return 'Mat khau phai co it nhat 6 ky tu';
                    }
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
                    onPressed: authState.isLoading ? null : _register,
                    child: authState.isLoading
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.background,
                            ),
                          )
                        : const Text('TAO TAI KHOAN', style: TextStyle(letterSpacing: 2)),
                  ),
                ),
                const SizedBox(height: 24),
                TextButton(
                  onPressed: () => context.go('/login'),
                  child: RichText(
                    textAlign: TextAlign.center,
                    text: const TextSpan(
                      text: 'Da co tai khoan? ',
                      style: TextStyle(color: AppColors.textSecondary),
                      children: [
                        TextSpan(
                          text: 'Dang nhap',
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
