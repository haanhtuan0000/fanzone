import 'package:flutter/material.dart';
import '../../app/constants.dart';
import '../../core/l10n/app_strings.dart';

class TutorialStep {
  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final Alignment spotlightAlignment;

  const TutorialStep({
    required this.title,
    required this.description,
    required this.icon,
    required this.color,
    required this.spotlightAlignment,
  });
}

class TutorialOverlay extends StatefulWidget {
  final VoidCallback onComplete;

  const TutorialOverlay({super.key, required this.onComplete});

  @override
  State<TutorialOverlay> createState() => _TutorialOverlayState();
}

class _TutorialOverlayState extends State<TutorialOverlay> with SingleTickerProviderStateMixin {
  int _currentStep = 0;
  late AnimationController _animController;
  late Animation<double> _fadeAnimation;

  List<TutorialStep> get _steps {
    final s = AppStrings.current;
    return [
      TutorialStep(
        title: s.tutStep1,
        description: s.tutStep1Desc,
        icon: Icons.sports_soccer,
        color: AppColors.neonGreen,
        spotlightAlignment: Alignment.topCenter,
      ),
      TutorialStep(
        title: s.tutStep2,
        description: s.tutStep2Desc,
        icon: Icons.touch_app,
        color: AppColors.amber,
        spotlightAlignment: Alignment.center,
      ),
      TutorialStep(
        title: s.tutStep3,
        description: s.tutStep3Desc,
        icon: Icons.emoji_events,
        color: AppColors.blue,
        spotlightAlignment: Alignment.bottomCenter,
      ),
    ];
  }

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      vsync: this,
      duration: AppDurations.normal,
    );
    _fadeAnimation = CurvedAnimation(parent: _animController, curve: Curves.easeOut);
    _animController.forward();
  }

  @override
  void dispose() {
    _animController.dispose();
    super.dispose();
  }

  void _next() {
    if (_currentStep < _steps.length - 1) {
      _animController.reset();
      setState(() => _currentStep++);
      _animController.forward();
    } else {
      widget.onComplete();
    }
  }

  void _skip() {
    widget.onComplete();
  }

  @override
  Widget build(BuildContext context) {
    final step = _steps[_currentStep];
    final size = MediaQuery.of(context).size;
    final s = AppStrings.current;

    // Calculate spotlight position based on alignment
    double spotlightY;
    switch (step.spotlightAlignment.y.toInt()) {
      case -1:
        spotlightY = size.height * 0.2;
        break;
      case 1:
        spotlightY = size.height * 0.7;
        break;
      default:
        spotlightY = size.height * 0.45;
    }

    return Material(
      color: Colors.transparent,
      child: Stack(
        children: [
          // Semi-transparent background with spotlight
          Positioned.fill(
            child: CustomPaint(
              painter: _SpotlightPainter(
                spotlightCenter: Offset(size.width / 2, spotlightY),
                spotlightRadius: 80,
              ),
            ),
          ),
          // Tap to advance
          Positioned.fill(
            child: GestureDetector(
              onTap: _next,
              behavior: HitTestBehavior.opaque,
              child: const SizedBox.expand(),
            ),
          ),
          // Skip button
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            right: 16,
            child: TextButton(
              onPressed: _skip,
              child: Text(
                s.skip,
                style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
              ),
            ),
          ),
          // Tutorial card
          Positioned(
            left: 24,
            right: 24,
            bottom: size.height * 0.15,
            child: FadeTransition(
              opacity: _fadeAnimation,
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.cardSurface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: step.color.withOpacity(0.3)),
                  boxShadow: [
                    BoxShadow(
                      color: step.color.withOpacity(0.15),
                      blurRadius: 24,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        color: step.color.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(step.icon, color: step.color, size: 28),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      step.title,
                      style: TextStyle(
                        fontFamily: AppFonts.bebasNeue,
                        fontSize: 24,
                        color: step.color,
                        letterSpacing: 1.5,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      step.description,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 20),
                    // Progress dots
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(_steps.length, (i) {
                        return Container(
                          width: i == _currentStep ? 24 : 8,
                          height: 8,
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          decoration: BoxDecoration(
                            color: i == _currentStep ? step.color : AppColors.divider,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _next,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: step.color,
                          foregroundColor: AppColors.background,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(AppSizes.buttonRadius),
                          ),
                        ),
                        child: Text(
                          _currentStep < _steps.length - 1 ? s.next : s.gotIt,
                          style: const TextStyle(
                            fontFamily: AppFonts.bebasNeue,
                            fontSize: 16,
                            letterSpacing: 2,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // Step counter
          Positioned(
            left: 24,
            bottom: size.height * 0.15 - 32,
            child: Text(
              '${_currentStep + 1}/${_steps.length}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }
}

class _SpotlightPainter extends CustomPainter {
  final Offset spotlightCenter;
  final double spotlightRadius;

  _SpotlightPainter({required this.spotlightCenter, required this.spotlightRadius});

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height));

    final spotlightPath = Path()
      ..addOval(Rect.fromCircle(center: spotlightCenter, radius: spotlightRadius));

    final combinedPath = Path.combine(PathOperation.difference, path, spotlightPath);

    canvas.drawPath(
      combinedPath,
      Paint()..color = Colors.black.withOpacity(0.6),
    );
  }

  @override
  bool shouldRepaint(_SpotlightPainter oldDelegate) =>
      spotlightCenter != oldDelegate.spotlightCenter || spotlightRadius != oldDelegate.spotlightRadius;
}
