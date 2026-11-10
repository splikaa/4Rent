import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ============================================================================
/// 4Rent Management System v1.0.0 — Native Mobile App (Flutter: Android & iOS)
/// Real-Time Bidirectional Sync with 4Rent Desktop via Firebase Realtime Database
/// ============================================================================

const String kDefaultFirebaseDatabaseUrl =
    'https://rent-41279-default-rtdb.asia-southeast1.firebasedatabase.app';
const String kDefaultPropertyCode = '4RENT-MAIN';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const FourRentMobileApp());
}

class FourRentMobileApp extends StatelessWidget {
  const FourRentMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '4Rent Management System',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B0E14),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFF59E0B),
          secondary: Color(0xFF10B981),
          surface: Color(0xFF121824),
        ),
        useMaterial3: true,
      ),
      home: const FourRentMobileHomeScreen(),
    );
  }
}

/// Accurate Sub-Meter Digit Extractor for Mobile OCR (Google MLKit / Camera)
/// Filters out faceplate serial numbers (No. 2018-18120672, S.No. 470946,
/// 18853562, No. KW2151075721, No: 22501329), scale headers (10000 1000 100 10 1 0.1),
/// and electrical ratings (1600imp/kWh, 3200imp/kWh, 240V, 60Hz, SY-168, MT-60i).
class SubMeterOcrParser {
  static double? extractAccurateKwhReading(String rawOcrText) {
    if (rawOcrText.trim().isEmpty) return null;

    final lines = rawOcrText
        .split(RegExp(r'\r?\n'))
        .map((l) => l.trim())
        .where((line) {
          if (line.isEmpty) return false;
          final lower = line.toLowerCase();
          if (RegExp(
            r'\b(s\.?\s*no|no\.?|serial|year|september|india|japan|technology|barcode|multifunction|approved|erc)\b',
          ).hasMatch(lower)) {
            return false;
          }
          if (RegExp(r'10000|1000\s+100|1/10').hasMatch(lower)) {
            return false;
          }
          if (RegExp(
            r'\b(1600|3200|imp|220|240v|480\s*v|120-|50hz|60hz|10\s*\(\s*60\s*\)|5-30\s*a|sy-?168|mt-?60i|cl-?60|cl\s*20|kv2c|type-?sp1)\b',
          ).hasMatch(lower)) {
            return false;
          }
          return true;
        })
        .toList();

    if (lines.isEmpty) return null;
    final cleaned = lines.join(' ').replaceAll(',', '.');

    // 1. Explicit decimal reading (e.g. 00003.4 or 00000.1)
    final decMatch = RegExp(r'\b\d{1,5}\.\d{1,2}\b').firstMatch(cleaned);
    if (decMatch != null) {
      final v = double.tryParse(decMatch.group(0)!);
      if (v != null && v >= 0 && v < 100000) {
        return (v * 10).roundToDouble() / 10;
      }
    }

    // 2. 6-Drum Cyclometer (5 Black Integer Drums + 1 Red Tenths Drum: e.g. 000034 -> 3.4, 000001 -> 0.1)
    final sixDrum = RegExp(r'\b(0\d{5})\b').firstMatch(cleaned);
    if (sixDrum != null) {
      final d = sixDrum.group(1)!;
      final intPart = int.parse(d.substring(0, 5));
      final tenthsPart = int.parse(d.substring(5, 6));
      return intPart + (tenthsPart / 10.0);
    }

    return null;
  }

  static String generateAntiTamperSeal(
    String receiptNo,
    String roomName,
    double totalAmount,
  ) {
    final seed = '$receiptNo|$roomName|${totalAmount.toStringAsFixed(2)}';
    int hash = 0x811c9dc5;
    for (int i = 0; i < seed.length; i++) {
      hash ^= seed.codeUnitAt(i);
      hash = (hash * 0x01000193) & 0xFFFFFFFF;
    }
    final hex = hash.toRadixString(16).toUpperCase().padLeft(8, '0');
    return '4R-SEAL-${hex.substring(0, 6)}';
  }
}

class FourRentMobileHomeScreen extends StatefulWidget {
  const FourRentMobileHomeScreen({super.key});

  @override
  State<FourRentMobileHomeScreen> createState() =>
      _FourRentMobileHomeScreenState();
}

class _FourRentMobileHomeScreenState extends State<FourRentMobileHomeScreen> {
  int _selectedIndex = 0;
  bool _privacyShieldEnabled = false;
  bool _isSyncing = false;
  String _propertyCode = kDefaultPropertyCode;
  String _syncStatus = 'Connected to Firebase Realtime Database';
  Timer? _syncTimer;

  List<Map<String, dynamic>> _rooms = [];
  List<Map<String, dynamic>> _bills = [];
  Map<String, dynamic> _settings = {
    'apartmentName': '4Rent Management System',
    'defaultElectricRate': 15.0,
    'defaultMonthlyRent': 4500.0,
  };

  @override
  void initState() {
    super.initState();
    _initializeAndSubscribeRealtime();
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    super.dispose();
  }

  Future<void> _initializeAndSubscribeRealtime() async {
    final prefs = await SharedPreferences.getInstance();
    final cachedJson = prefs.getString('4rent_mobile_snapshot');
    if (cachedJson != null) {
      _applySnapshotMap(jsonDecode(cachedJson) as Map<String, dynamic>);
    }

    await _pullFromDesktopCloud();

    _syncTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      _pullFromDesktopCloud();
    });
  }

  Future<void> _applySnapshotMap(Map<String, dynamic> snap) async {
    setState(() {
      if (snap['rooms'] is List) {
        _rooms = List<Map<String, dynamic>>.from(
          (snap['rooms'] as List).map((e) => Map<String, dynamic>.from(e)),
        );
      }
      if (snap['bills'] is List) {
        _bills = List<Map<String, dynamic>>.from(
          (snap['bills'] as List).map((e) => Map<String, dynamic>.from(e)),
        );
      }
      if (snap['settings'] is Map) {
        _settings = Map<String, dynamic>.from(snap['settings'] as Map);
        _privacyShieldEnabled = _settings['privacyMaskEnabled'] == true;
      }
    });

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('4rent_mobile_snapshot', jsonEncode(snap));
  }

  Future<void> _pullFromDesktopCloud() async {
    setState(() => _isSyncing = true);
    try {
      final client = HttpClient();
      final uri = Uri.parse(
        '$kDefaultFirebaseDatabaseUrl/properties/$_propertyCode.json',
      );
      final request = await client.getUrl(uri);
      final response = await request.close();
      if (response.statusCode == 200) {
        final body = await response.transform(utf8.decoder).join();
        final data = jsonDecode(body) as Map<String, dynamic>?;
        if (data != null && data['snapshot'] is Map<String, dynamic>) {
          await _applySnapshotMap(
            Map<String, dynamic>.from(data['snapshot'] as Map),
          );
          setState(() {
            _syncStatus = 'Synced with Firebase ($_propertyCode)';
          });
        }
      }
    } catch (e) {
      setState(() {
        _syncStatus = 'Offline Mode — Using Local Persistent Cache';
      });
    } finally {
      setState(() => _isSyncing = false);
    }
  }

  Future<void> _pushToDesktopCloud() async {
    setState(() => _isSyncing = true);
    final nowIso = DateTime.now().toUtc().toIso8601String();
    final snapshot = {
      'version': '1.0.0',
      'exportedAt': nowIso,
      'rooms': _rooms,
      'bills': _bills,
      'settings': _settings,
    };

    try {
      final client = HttpClient();
      final uri = Uri.parse(
        '$kDefaultFirebaseDatabaseUrl/properties/$_propertyCode.json',
      );
      final request = await client.putUrl(uri);
      request.headers.set('content-type', 'application/json');
      request.write(
        jsonEncode({
          'propertyCode': _propertyCode,
          'snapshot': snapshot,
          'updatedAt': nowIso,
        }),
      );
      final response = await request.close();
      if (response.statusCode >= 200 && response.statusCode < 300) {
        setState(() {
          _syncStatus = 'Pushed live to Firebase ($_propertyCode)';
        });
      }
    } catch (e) {
      setState(() {
        _syncStatus = 'Saved locally (Will sync when online)';
      });
    } finally {
      setState(() => _isSyncing = false);
    }
  }

  String _formatPeso(num amount) {
    if (_privacyShieldEnabled) return '₱••,•••.••';
    return '₱${amount.toStringAsFixed(2)}';
  }

  String _formatPhone(String? raw) {
    if (raw == null || raw.isEmpty) return 'No mobile';
    if (!_privacyShieldEnabled) return raw;
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 6) return '••••-•••-••••';
    return '${digits.substring(0, 4)}-•••-••${digits.substring(digits.length - 2)}';
  }

  @override
  Widget build(BuildContext context) {
    final activeRooms =
        _rooms.where((r) => r['isArchived'] != true).toList();
    final occupiedCount =
        activeRooms.where((r) => r['status'] == 'occupied').length;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF101520),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '4Rent Management System',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            Text(
              _syncStatus,
              style: const TextStyle(fontSize: 11, color: Color(0xFF10B981)),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Toggle Public Screen Privacy Shield',
            onPressed: () {
              setState(() => _privacyShieldEnabled = !_privacyShieldEnabled);
            },
            icon: Icon(
              _privacyShieldEnabled ? Icons.visibility_off : Icons.visibility,
              color: _privacyShieldEnabled
                  ? const Color(0xFF10B981)
                  : Colors.white70,
            ),
          ),
          IconButton(
            tooltip: 'Real-Time Sync with Desktop',
            onPressed: _isSyncing ? null : _pullFromDesktopCloud,
            icon: const Icon(Icons.sync, color: Color(0xFFF59E0B)),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: _selectedIndex == 0
            ? _buildDashboard(activeRooms, occupiedCount)
            : _selectedIndex == 1
            ? _buildRoomsList(activeRooms)
            : _buildSyncAndSettings(),
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF101520),
        selectedIndex: _selectedIndex,
        onDestinationSelected: (idx) => setState(() => _selectedIndex = idx),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.meeting_room_outlined),
            selectedIcon: Icon(Icons.meeting_room),
            label: 'Rooms & OCR',
          ),
          NavigationDestination(
            icon: Icon(Icons.cloud_sync_outlined),
            selectedIcon: Icon(Icons.cloud_sync),
            label: 'Desktop Sync',
          ),
        ],
      ),
    );
  }

  Widget _buildDashboard(
    List<Map<String, dynamic>> activeRooms,
    int occupiedCount,
  ) {
    final totalCollected = _bills.fold<double>(
      0,
      (sum, b) => sum + ((b['amountPaid'] as num?)?.toDouble() ?? 0),
    );

    return ListView(
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: const Color(0xFF141B29),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFF243047)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'TOTAL COLLECTED REVENUE',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: Colors.white60,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _formatPeso(totalCollected),
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  color: Color(0xFF10B981),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Occupied Rooms: $occupiedCount / ${activeRooms.length} • Global Rate: ₱${_settings['defaultElectricRate'] ?? 15}/kWh',
                style: const TextStyle(fontSize: 12, color: Colors.white70),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildRoomsList(List<Map<String, dynamic>> activeRooms) {
    if (activeRooms.isEmpty) {
      return const Center(
        child: Text(
          'No rooms yet. Add rooms on Desktop or tap Sync.',
          style: TextStyle(color: Colors.white60),
        ),
      );
    }
    return ListView.separated(
      itemCount: activeRooms.length,
      separatorBuilder: (_, __) => const SizedBox(height: 14),
      itemBuilder: (context, index) {
        final room = activeRooms[index];
        final tenant = room['tenant'] as Map<String, dynamic>?;
        final lastMeter =
            (room['lastMeterReading'] as num?)?.toDouble() ?? 0.0;

        return Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: const Color(0xFF141B29),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0xFF243047)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    room['name']?.toString() ?? 'Room',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    '${lastMeter.toStringAsFixed(1)} kWh',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFFF59E0B),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                tenant != null
                    ? '${tenant['fullName']} • ${_formatPhone(tenant['phone']?.toString())}'
                    : 'Vacant • Available for Inquiry',
                style: const TextStyle(fontSize: 13, color: Colors.white70),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildSyncAndSettings() {
    return ListView(
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: const Color(0xFF141B29),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFF243047)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Real-Time Desktop ↔ Mobile Synchronization',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                'Property Sync Code: $_propertyCode',
                style: const TextStyle(
                  fontSize: 13,
                  color: Color(0xFFF59E0B),
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _isSyncing ? null : _pushToDesktopCloud,
                      icon: const Icon(Icons.cloud_upload),
                      label: const Text('Sync Push to Desktop'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _isSyncing ? null : _pullFromDesktopCloud,
                      icon: const Icon(Icons.cloud_download),
                      label: const Text('Sync Pull from Desktop'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}
