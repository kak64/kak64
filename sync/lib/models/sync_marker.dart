import 'package:cloud_firestore/cloud_firestore.dart';

enum SyncCategory { move, play, talk, help }

extension SyncCategoryX on SyncCategory {
  String get id => switch (this) {
        SyncCategory.move => 'move',
        SyncCategory.play => 'play',
        SyncCategory.talk => 'talk',
        SyncCategory.help => 'help',
      };

  String get label => switch (this) {
        SyncCategory.move => 'Move',
        SyncCategory.play => 'Play',
        SyncCategory.talk => 'Talk',
        SyncCategory.help => 'Help',
      };

  static SyncCategory fromId(String id) =>
      SyncCategory.values.firstWhere((c) => c.id == id, orElse: () => SyncCategory.talk);
}

class SyncMarker {
  final String id;
  final String userId;
  final SyncCategory category;
  final double latitude;
  final double longitude;
  final DateTime createdAt;
  final DateTime expiresAt;

  const SyncMarker({
    required this.id,
    required this.userId,
    required this.category,
    required this.latitude,
    required this.longitude,
    required this.createdAt,
    required this.expiresAt,
  });

  factory SyncMarker.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data()!;
    final geo = d['location'] as GeoPoint;
    return SyncMarker(
      id: doc.id,
      userId: d['userId'] as String,
      category: SyncCategoryX.fromId(d['category'] as String),
      latitude: geo.latitude,
      longitude: geo.longitude,
      createdAt: (d['createdAt'] as Timestamp).toDate(),
      expiresAt: (d['expiresAt'] as Timestamp).toDate(),
    );
  }

  bool get isLive => DateTime.now().isBefore(expiresAt);
}
