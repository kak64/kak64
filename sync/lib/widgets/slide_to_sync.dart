import 'package:flutter/material.dart';

import '../models/sync_marker.dart';
import '../theme/app_theme.dart';

class SlideToSyncSheet extends StatefulWidget {
  const SlideToSyncSheet({super.key, required this.marker});

  final SyncMarker marker;

  static Future<bool?> show(BuildContext context, SyncMarker m) {
    return showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => SlideToSyncSheet(marker: m),
    );
  }

  @override
  State<SlideToSyncSheet> createState() => _SlideToSyncSheetState();
}

class _SlideToSyncSheetState extends State<SlideToSyncSheet> {
  double _drag = 0;
  static const double _trackWidth = 280;
  static const double _knob = 56;

  Duration get _remaining =>
      widget.marker.expiresAt.difference(DateTime.now());

  @override
  Widget build(BuildContext context) {
    final r = _remaining;
    final mins = r.inMinutes.clamp(0, 30);
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.charcoalElevated,
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.lg)),
        boxShadow: AppShadows.soft,
      ),
      padding: const EdgeInsets.fromLTRB(28, 18, 28, 36),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 44,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.mutedGrey.withOpacity(0.5),
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
          ),
          const SizedBox(height: 28),
          Text(
            widget.marker.category.label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 26,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text('Expires in $mins min',
              style: const TextStyle(color: AppColors.mutedGrey, fontSize: 14)),
          const SizedBox(height: 32),
          _buildSlider(),
          const SizedBox(height: 16),
          const Text('Slide to Sync',
              style: TextStyle(color: AppColors.mutedGrey, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildSlider() {
    return SizedBox(
      width: _trackWidth,
      height: _knob,
      child: Stack(
        children: [
          Container(
            decoration: BoxDecoration(
              color: AppColors.charcoal,
              borderRadius: BorderRadius.circular(AppRadius.pill),
              boxShadow: AppShadows.soft,
            ),
            alignment: Alignment.center,
            child: const Text(
              'Sync now →',
              style: TextStyle(
                color: AppColors.softGrey,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.4,
              ),
            ),
          ),
          Positioned(
            left: _drag,
            top: 0,
            bottom: 0,
            child: GestureDetector(
              onHorizontalDragUpdate: (d) {
                setState(() {
                  _drag = (_drag + d.delta.dx)
                      .clamp(0.0, _trackWidth - _knob);
                });
              },
              onHorizontalDragEnd: (_) {
                if (_drag >= _trackWidth - _knob - 8) {
                  Navigator.of(context).pop(true);
                } else {
                  setState(() => _drag = 0);
                }
              },
              child: Container(
                width: _knob,
                height: _knob,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.orange,
                  boxShadow: AppShadows.orangeGlow,
                ),
                child: const Icon(Icons.arrow_forward_rounded,
                    color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
