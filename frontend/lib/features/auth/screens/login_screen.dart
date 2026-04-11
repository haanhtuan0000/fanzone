import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/constants.dart';
import '../../../app/responsive.dart';
import '../../../core/l10n/app_strings.dart';
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
    final str = AppStrings.current;
    final authState = ref.watch(authStateProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () { ref.read(authStateProvider.notifier).clearError(); context.go('/welcome'); },
        ),
        title: Text(str.login),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: sa(context, 24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(height: s(context, 48)),
                // FZ logo small
                Center(
                  child: Text(
                    'FZ',
                    style: TextStyle(
                      fontFamily: AppFonts.bebasNeue,
                      fontSize: sf(context, 64),
                      color: AppColors.neonGreen,
                      letterSpacing: 4,
                    ),
                  ),
                ),
                SizedBox(height: s(context, 48)),
                TextFormField(
                  controller: _emailController,
                  decoration: InputDecoration(
                    hintText: str.email,
                    prefixIcon: const Icon(Icons.email_outlined, color: AppColors.textSecondary),
                  ),
                  keyboardType: TextInputType.emailAddress,
                  style: const TextStyle(color: AppColors.textPrimary),
                  validator: (value) {
                    if (value == null || !value.contains('@')) return str.emailInvalid;
                    return null;
                  },
                ),
                SizedBox(height: s(context, 16)),
                TextFormField(
                  controller: _passwordController,
                  decoration: InputDecoration(
                    hintText: str.password,
                    prefixIcon: const Icon(Icons.lock_outline, color: AppColors.textSecondary),
                  ),
                  obscureText: true,
                  style: const TextStyle(color: AppColors.textPrimary),
                  validator: (value) {
                    if (value == null || value.isEmpty) return str.enterPassword;
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
                    onPressed: authState.isLoading ? null : _login,
                    child: authState.isLoading
                        ? SizedBox(
                            width: s(context, 24),
                            height: s(context, 24),
                            child: const CircularProgressIndicator(strokeWidth: 2, color: AppColors.background),
                          )
                        : Text(str.login, style: const TextStyle(letterSpacing: 2)),
                  ),
                ),
                SizedBox(height: s(context, 24)),
                TextButton(
                  onPressed: () { ref.read(authStateProvider.notifier).clearError(); context.go('/register'); },
                  child: RichText(
                    textAlign: TextAlign.center,
                    text: TextSpan(
                      text: str.noAccount,
                      style: const TextStyle(color: AppColors.textSecondary),
                      children: [
                        TextSpan(
                          text: str.registerLink,
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
