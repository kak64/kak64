import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/sync_marker.dart';

class FirestoreService {
  FirestoreService(this._db);
  final FirebaseFirestore _db;

  static const Duration ttl = Duration(minutes: 30);

  CollectionReference<Map<String, dynamic>> get _syncs => _db.collection('syncs');

  Future<String> createSync({
    required String userId,
    required SyncCategory category,
    required double latitude,
    required double longitude,
  }) async {
    final now = DateTime.now();
    final doc = await _syncs.add({
      'userId': userId,
      'category': category.id,
      'location': GeoPoint(latitude, longitude),
      // Coarse geohash bucket for cheap proximity filtering on the client.
      'geoBucket': _bucket(latitude, longitude),
      'createdAt': Timestamp.fromDate(now),
      'expiresAt': Timestamp.fromDate(now.add(ttl)),
      'active': true,
    });
    return doc.id;
  }

  /// Live markers — only those created in the last 30 minutes.
  /// The Cloud Function deletes expired docs, but we filter client-side too
  /// so a stale snapshot can never leak an expired marker.
  Stream<List<SyncMarker>> liveMarkers() {
    final cutoff = DateTime.now().subtract(ttl);
    return _syncs
        .where('createdAt', isGreaterThan: Timestamp.fromDate(cutoff))
        .where('active', isEqualTo: true)
        .snapshots()
        .map((snap) => snap.docs
            .map((d) => SyncMarker.fromDoc(d))
            .where((m) => m.isLive)
            .toList());
  }

  Future<void> sendMessage({
    required String syncId,
    required String userId,
    required String text,
  }) {
    return _syncs.doc(syncId).collection('messages').add({
      'userId': userId,
      'text': text,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Stream<QuerySnapshot<Map<String, dynamic>>> messages(String syncId) {
    return _syncs
        .doc(syncId)
        .collection('messages')
        .orderBy('createdAt')
        .snapshots();
  }

  // Rough 0.01° (~1.1km) bucket; good enough for an MVP regional filter.
  String _bucket(double lat, double lng) =>
      '${(lat * 100).floor()}_${(lng * 100).floor()}';
}
