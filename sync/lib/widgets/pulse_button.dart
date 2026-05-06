import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class PulseButton extends StatefulWidget {
  const PulseButton({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  State<PulseButton> createState() => _PulseButtonState();
}

class _PulseButtonState extends State<PulseButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 140,
      height: 140,
      child: Stack(
        alignment: Alignment.center,
        children: [
          AnimatedBuilder(
            animation: _ctrl,
            builder: (_, __) {
              final t = _ctrl.value;
              return Container(
                width: 80 + 60 * t,
                height: 80 + 60 * t,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: AppColors.orange.withOpacity((1 - t) * 0.25),
                ),
              );
            },
          ),
          GestureDetector(
            onTap: widget.onTap,
            behavior: HitTestBehavior.opaque,
            child: Container(
              width: 78,
              height: 78,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.orange,
                boxShadow: AppShadows.orangeGlow,
              ),
              child: const Icon(Icons.add_rounded,
                  color: Colors.white, size: 36),
            ),
          ),
        ],
      ),
    );
  }
}
