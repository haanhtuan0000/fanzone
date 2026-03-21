import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../app/constants.dart';

class LoadingShimmer extends StatelessWidget {
  final double height;
  final double width;
  final double borderRadius;

  const LoadingShimmer({
    super.key,
    this.height = 80,
    this.width = double.infinity,
    this.borderRadius = 12,
  });

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: AppColors.cardSurface,
      highlightColor: AppColors.cardSurfaceLight,
      child: Container(
        height: height,
        width: width,
        decoration: BoxDecoration(
          color: AppColors.cardSurface,
          borderRadius: BorderRadius.circular(borderRadius),
        ),
      ),
    );
  }
}
