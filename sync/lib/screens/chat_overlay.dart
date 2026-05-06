import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../models/sync_marker.dart';
import '../services/firestore_service.dart';
import '../theme/app_theme.dart';
import '../widgets/glass_container.dart';

class ChatOverlay extends StatefulWidget {
  const ChatOverlay({
    super.key,
    required this.marker,
    required this.userId,
    required this.firestore,
  });

  final SyncMarker marker;
  final String userId;
  final FirestoreService firestore;

  @override
  State<ChatOverlay> createState() => _ChatOverlayState();
}

class _ChatOverlayState extends State<ChatOverlay> {
  final _input = TextEditingController();

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.charcoal,
      body: SafeArea(
        child: Column(
          children: [
            _Header(marker: widget.marker),
            Expanded(
              child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
                stream: widget.firestore.messages(widget.marker.id),
                builder: (context, snap) {
                  final docs = snap.data?.docs ?? const [];
                  return ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.all(20),
                    itemCount: docs.length,
                    itemBuilder: (_, i) {
                      final m = docs[docs.length - 1 - i].data();
                      final mine = m['userId'] == widget.userId;
                      return _Bubble(
                        text: m['text'] as String? ?? '',
                        mine: mine,
                      );
                    },
                  );
                },
              ),
            ),
            _Composer(
              controller: _input,
              onSend: () async {
                final text = _input.text.trim();
                if (text.isEmpty) return;
                _input.clear();
                await widget.firestore.sendMessage(
                  syncId: widget.marker.id,
                  userId: widget.userId,
                  text: text,
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.marker});
  final SyncMarker marker;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: GlassContainer(
        child: Row(
          children: [
            IconButton(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
            ),
            const SizedBox(width: 4),
            Text(
              marker.category.label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            const Icon(Icons.timer_rounded,
                color: AppColors.orange, size: 18),
            const SizedBox(width: 6),
            Text(
              '${marker.expiresAt.difference(DateTime.now()).inMinutes.clamp(0, 30)}m',
              style: const TextStyle(
                color: AppColors.softGrey,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.text, required this.mine});
  final String text;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.72,
        ),
        decoration: BoxDecoration(
          color: mine ? AppColors.orange : AppColors.charcoalElevated,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(AppRadius.md),
            topRight: const Radius.circular(AppRadius.md),
            bottomLeft: Radius.circular(mine ? AppRadius.md : 6),
            bottomRight: Radius.circular(mine ? 6 : AppRadius.md),
          ),
          boxShadow: AppShadows.soft,
        ),
        child: Text(
          text,
          style: TextStyle(
            color: mine ? Colors.white : AppColors.softGrey,
            fontSize: 15,
          ),
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.onSend});

  final TextEditingController controller;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        8,
        16,
        16 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 18),
              decoration: BoxDecoration(
                color: AppColors.charcoalElevated,
                borderRadius: BorderRadius.circular(AppRadius.pill),
                boxShadow: AppShadows.soft,
              ),
              child: TextField(
                controller: controller,
                style: const TextStyle(color: Colors.white),
                cursorColor: AppColors.orange,
                decoration: const InputDecoration(
                  hintText: 'Say hi…',
                  hintStyle: TextStyle(color: AppColors.mutedGrey),
                  border: InputBorder.none,
                ),
                onSubmitted: (_) => onSend(),
              ),
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: onSend,
            child: Container(
              width: 52,
              height: 52,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.orange,
                boxShadow: AppShadows.orangeGlow,
              ),
              child: const Icon(Icons.send_rounded, color: Colors.white),
            ),
          ),
        ],
      ),
    );
  }
}
