import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../models/sync_marker.dart';
import '../services/firestore_service.dart';
import '../services/location_service.dart';
import '../theme/app_theme.dart';
import '../utils/marker_factory.dart';
import '../widgets/pulse_button.dart';
import '../widgets/slide_to_sync.dart';
import '../widgets/sync_bottom_sheet.dart';
import '../widgets/trust_badge.dart';
import 'chat_overlay.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key, required this.userId});
  final String userId;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  final _location = LocationService();
  final _firestore = FirestoreService(FirebaseFirestore.instance);

  GoogleMapController? _mapController;
  String? _mapStyle;
  BitmapDescriptor? _glowIcon;

  LatLng _camera = const LatLng(40.7580, -73.9855); // Times Square fallback
  String _city = 'Locating…';
  final int _trustScore = 87;

  StreamSubscription<List<SyncMarker>>? _markerSub;
  Set<Marker> _markers = {};

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    _mapStyle = await rootBundle.loadString('assets/map_style_dark.json');
    _glowIcon = await GlowMarkerFactory.build();
    await _initLocation();
    _subscribeMarkers();
    if (mounted) setState(() {});
  }

  Future<void> _initLocation() async {
    try {
      final pos = await _location.currentPosition();
      _camera = LatLng(pos.latitude, pos.longitude);
      _city = await _location.cityFor(pos.latitude, pos.longitude);
      _mapController?.animateCamera(CameraUpdate.newLatLngZoom(_camera, 15));
    } catch (_) {
      _city = 'Location off';
    }
  }

  void _subscribeMarkers() {
    _markerSub?.cancel();
    _markerSub = _firestore.liveMarkers().listen((list) {
      final markers = <Marker>{
        for (final m in list)
          Marker(
            markerId: MarkerId(m.id),
            position: LatLng(m.latitude, m.longitude),
            icon: _glowIcon ?? BitmapDescriptor.defaultMarker,
            anchor: const Offset(0.5, 0.5),
            onTap: () => _onMarkerTap(m),
          ),
      };
      if (mounted) setState(() => _markers = markers);
    });
  }

  Future<void> _onPulse() async {
    final category = await SyncCategorySheet.show(context);
    if (category == null) return;
    try {
      final pos = await _location.currentPosition();
      await _firestore.createSync(
        userId: widget.userId,
        category: category,
        latitude: pos.latitude,
        longitude: pos.longitude,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.charcoalElevated,
          content: Text('${category.label} sync live for 30 min',
              style: const TextStyle(color: AppColors.softGrey)),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not create sync: $e')),
      );
    }
  }

  Future<void> _onMarkerTap(SyncMarker m) async {
    final synced = await SlideToSyncSheet.show(context, m);
    if (synced != true || !mounted) return;
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ChatOverlay(
        marker: m,
        userId: widget.userId,
        firestore: _firestore,
      ),
    ));
  }

  @override
  void dispose() {
    _markerSub?.cancel();
    _mapController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.charcoal,
      body: Stack(
        children: [
          GoogleMap(
            initialCameraPosition: CameraPosition(target: _camera, zoom: 14),
            onMapCreated: (c) {
              _mapController = c;
              c.animateCamera(CameraUpdate.newLatLng(_camera));
            },
            style: _mapStyle,
            markers: _markers,
            myLocationEnabled: true,
            myLocationButtonEnabled: false,
            zoomControlsEnabled: false,
            compassEnabled: false,
            mapToolbarEnabled: false,
          ),
          Align(
            alignment: Alignment.topCenter,
            child: TopBar(city: _city, trustScore: _trustScore),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 36),
              child: PulseButton(onTap: _onPulse),
            ),
          ),
        ],
      ),
    );
  }
}
