import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/l10n/app_strings.dart';
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
    final str = AppStrings.current;
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () { ref.read(authStateProvider.notifier).clearError(); context.go('/welcome'); },
        ),
        title: Text(str.register),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: sa(context, 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(height: s(context, 32)),
                TextFormField(
                  controller: _nameController,
                  decoration: InputDecoration(
                    hintText: str.displayNameHint,
                    prefixIcon: const Icon(Icons.person_outline, color: AppColors.textSecondary),
                  ),
                  style: const TextStyle(color: AppColors.textPrimary),
                ),
                SizedBox(height: s(context, 16)),
                TextFormField(
                  controller: _emailController,
                  decoration: InputDecoration(
                    hintText: str.email,
                    prefixIcon: const Icon(Icons.email_outlined, color: AppColors.textSecondary),
                  ),
                  keyboardType: TextInputType.emailAddress,
                  style: const TextStyle(color: AppColors.textPrimary),
                  validator: (value) {
                    if (value == null || !value.contains('@')) {
                      return str.emailInvalid;
                    }
                    return null;
                  },
                ),
                SizedBox(height: s(context, 16)),
                TextFormField(
                  controller: _passwordController,
                  decoration: InputDecoration(
                    hintText: str.passwordHint,
                    prefixIcon: const Icon(Icons.lock_outline, color: AppColors.textSecondary),
                  ),
                  obscureText: true,
                  style: const TextStyle(color: AppColors.textPrimary),
                  validator: (value) {
                    if (value == null || value.length < 6) {
                      return str.passwordTooShort;
                    }
                    return null;
                  },
                ),
                SizedBox(height: s(context, 24)),
                if (authState.error != null) ...[
                  Container(
                    padding: sa(context, 12),
                    decoration: BoxDecoration(
                      color: AppColors.red.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.red.withOpacity(0.3)),
                    ),
                    child: Text(
                      authState.error!,
                      style: TextStyle(color: AppColors.red, fontSize: sf(context, 14)),
                    ),
                  ),
                  SizedBox(height: s(context, 16)),
                ],
                SizedBox(
                  height: s(context, 52),
                  child: ElevatedButton(
                    onPressed: authState.isLoading ? null : _register,
                    child: authState.isLoading
                        ? SizedBox(
                            width: s(context, 24),
                            height: s(context, 24),
                            child: const CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.background,
                            ),
                          )
                        : Text(str.createAccount, style: const TextStyle(letterSpacing: 2)),
                  ),
                ),
                SizedBox(height: s(context, 24)),
                TextButton(
                  onPressed: () { ref.read(authStateProvider.notifier).clearError(); context.go('/login'); },
                  child: RichText(
                    textAlign: TextAlign.center,
                    text: TextSpan(
                      text: str.alreadyHaveAccount,
                      style: const TextStyle(color: AppColors.textSecondary),
                      children: [
                        TextSpan(
                          text: str.loginLink,
                          style: const TextStyle(color: AppColors.neonGreen, fontWeight: FontWeight.w700),
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
