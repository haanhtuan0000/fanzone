import 'package:flutter/material.dart';

/// Design base width (standard phone). All sizes scale relative to this.
const double _designWidth = 375.0;

/// Get scale factor for current screen. Clamped to avoid extreme scaling.
double _scaleFactor(BuildContext context) {
  final width = MediaQuery.of(context).size.width;
  return (width / _designWidth).clamp(0.8, 1.6);
}

/// Scale a dimension value (padding, height, width, icon size).
double s(BuildContext context, double value) => value * _scaleFactor(context);

/// Scale a font size (slightly less aggressive scaling for readability).
double sf(BuildContext context, double value) =>
    value * (((_scaleFactor(context) - 1) * 0.6) + 1);

/// Scale-aware symmetric EdgeInsets.
EdgeInsets sp(BuildContext context, {double h = 0, double v = 0}) =>
    EdgeInsets.symmetric(
      horizontal: s(context, h),
      vertical: s(context, v),
    );

/// Scale-aware EdgeInsets.all
EdgeInsets sa(BuildContext context, double value) =>
    EdgeInsets.all(s(context, value));

/// Scale-aware EdgeInsets.fromLTRB
EdgeInsets sLTRB(BuildContext context, double l, double t, double r, double b) =>
    EdgeInsets.fromLTRB(s(context, l), s(context, t), s(context, r), s(context, b));
