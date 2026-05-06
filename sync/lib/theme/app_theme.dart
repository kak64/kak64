import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  static const Color charcoal = Color(0xFF1A1A1B);
  static const Color charcoalElevated = Color(0xFF222224);
  static const Color orange = Color(0xFFFF5F1F);
  static const Color softGrey = Color(0xFFE1E1E1);
  static const Color mutedGrey = Color(0xFF8A8A8E);
  static const Color glass = Color(0x33FFFFFF);
  static const Color glassBorder = Color(0x1AFFFFFF);
}

class AppRadius {
  static const double sm = 16;
  static const double md = 24;
  static const double lg = 32;
  static const double pill = 999;
}

class AppShadows {
  static const List<BoxShadow> soft = [
    BoxShadow(
      color: Color(0x4D000000),
      blurRadius: 24,
      offset: Offset(0, 8),
    ),
  ];

  static const List<BoxShadow> orangeGlow = [
    BoxShadow(
      color: Color(0x66FF5F1F),
      blurRadius: 32,
      spreadRadius: 4,
      offset: Offset(0, 0),
    ),
    BoxShadow(
      color: Color(0x33000000),
      blurRadius: 16,
      offset: Offset(0, 6),
    ),
  ];
}

class AppTheme {
  static ThemeData dark() {
    final base = ThemeData.dark(useMaterial3: true);
    return base.copyWith(
      scaffoldBackgroundColor: AppColors.charcoal,
      colorScheme: const ColorScheme.dark(
        surface: AppColors.charcoal,
        primary: AppColors.orange,
        secondary: AppColors.orange,
        onSurface: AppColors.softGrey,
      ),
      textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
        bodyColor: AppColors.softGrey,
        displayColor: Colors.white,
      ),
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
    );
  }
}
