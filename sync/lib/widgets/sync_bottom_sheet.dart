import 'package:flutter/material.dart';

import '../models/sync_marker.dart';
import '../theme/app_theme.dart';

class SyncCategorySheet extends StatelessWidget {
  const SyncCategorySheet({super.key});

  static Future<SyncCategory?> show(BuildContext context) {
    return showModalBottomSheet<SyncCategory>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => const SyncCategorySheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
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
          const SizedBox(height: 24),
          const Text(
            'Create a Sync',
            style: TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Pick a vibe — live for 30 minutes',
            style: TextStyle(color: AppColors.mutedGrey, fontSize: 14),
          ),
          const SizedBox(height: 28),
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _Tile(
                icon: Icons.directions_run_rounded,
                label: 'Move',
                category: SyncCategory.move,
              ),
              _Tile(
                icon: Icons.sports_esports_rounded,
                label: 'Play',
                category: SyncCategory.play,
              ),
              _Tile(
                icon: Icons.chat_bubble_rounded,
                label: 'Talk',
                category: SyncCategory.talk,
              ),
              _Tile(
                icon: Icons.favorite_rounded,
                label: 'Help',
                category: SyncCategory.help,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    required this.icon,
    required this.label,
    required this.category,
  });

  final IconData icon;
  final String label;
  final SyncCategory category;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(category),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.charcoal,
              borderRadius: BorderRadius.circular(AppRadius.md),
              boxShadow: AppShadows.soft,
            ),
            child: Icon(icon, color: AppColors.orange, size: 28),
          ),
          const SizedBox(height: 10),
          Text(label,
              style: const TextStyle(
                color: AppColors.softGrey,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              )),
        ],
      ),
    );
  }
}
