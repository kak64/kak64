import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/map_screen.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: AppColors.charcoal,
  ));
  await Firebase.initializeApp();
  runApp(const SyncApp());
}

class SyncApp extends StatelessWidget {
  const SyncApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sync',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark(),
      home: const _AuthGate(),
    );
  }
}

class _AuthGate extends StatefulWidget {
  const _AuthGate();
  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  Future<User>? _user;

  @override
  void initState() {
    super.initState();
    _user = _signInAnonymously();
  }

  Future<User> _signInAnonymously() async {
    final auth = FirebaseAuth.instance;
    final cred = auth.currentUser != null
        ? null
        : await auth.signInAnonymously();
    return cred?.user ?? auth.currentUser!;
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<User>(
      future: _user,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) {
          return const Scaffold(
            backgroundColor: AppColors.charcoal,
            body: Center(
              child: CircularProgressIndicator(color: AppColors.orange),
            ),
          );
        }
        if (snap.hasError || snap.data == null) {
          return Scaffold(
            backgroundColor: AppColors.charcoal,
            body: Center(
              child: Text('Sign-in failed: ${snap.error}',
                  style: const TextStyle(color: AppColors.softGrey)),
            ),
          );
        }
        return MapScreen(userId: snap.data!.uid);
      },
    );
  }
}
