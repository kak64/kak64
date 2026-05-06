import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../theme/app_theme.dart';

/// Renders a glowing pulse-of-light bitmap to use as a custom marker.
/// Replaces the default Google pin entirely.
class GlowMarkerFactory {
  static Future<BitmapDescriptor> build({
    Color color = AppColors.orange,
    double size = 96,
  }) async {
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    final center = Offset(size / 2, size / 2);

    // Outer halo
    final halo = Paint()
      ..shader = ui.Gradient.radial(
        center,
        size / 2,
        [color.withOpacity(0.45), color.withOpacity(0.0)],
        [0.0, 1.0],
      );
    canvas.drawCircle(center, size / 2, halo);

    // Mid glow
    final glow = Paint()
      ..color = color.withOpacity(0.55)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);
    canvas.drawCircle(center, size * 0.18, glow);

    // Hot core
    final core = Paint()..color = color;
    canvas.drawCircle(center, size * 0.10, core);

    // White hot center
    final hot = Paint()..color = Colors.white.withOpacity(0.9);
    canvas.drawCircle(center, size * 0.04, hot);

    final pic = recorder.endRecording();
    final img = await pic.toImage(size.toInt(), size.toInt());
    final bytes = await img.toByteData(format: ui.ImageByteFormat.png);
    return BitmapDescriptor.fromBytes(
      Uint8List.view(bytes!.buffer),
    );
  }
}
