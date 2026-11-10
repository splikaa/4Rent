/**
 * Harness Self-Verification Test Suite
 *
 * Verifies all foundational E2E test harness capabilities:
 * 1. browser_env.ts: Storage, FakeIndexedDB, BroadcastChannel, and DOM elements
 * 2. test_utils.ts: Assertions, mock entity factories, and database seeding
 * 3. fixtures: Sample meter PNGs, PNG magic headers, and manifest.json specifications
 */

import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MemoryStorage,
  fakeIndexedDB,
  FakeBroadcastChannel,
  resetBrowserEnv,
} from './browser_env';
import {
  assertCloseTo,
  assertDeepEqual,
  assertFalse,
  assertRejects,
  assertStrictEqual,
  assertThrows,
  assertTrue,
  createMockBill,
  createMockInquiry,
  createMockRoom,
  createMockSnapshot,
  createMockTenant,
  createMockTenantHistory,
  readLocalStorageSnapshot,
  seedLocalStorage,
} from './test_utils';
import {
  saveSnapshotToIndexedDb,
  loadSnapshotFromIndexedDb,
  clearSnapshotFromIndexedDb,
} from '../../../src/services/idbDatabase';
import {
  loadSettings,
  saveSettings,
  loadRooms,
  saveRooms,
  subscribeToLocalCrossWindowSync,
} from '../../../src/services/storageService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('Harness Foundation: In-Memory Browser Environment', () => {
  it('Storage: implements full Web Storage API with string coercion', () => {
    const storage = new MemoryStorage();
    assertStrictEqual(storage.length, 0);

    storage.setItem('alpha', 'hello');
    storage.setItem('numeric', 12345);
    storage.setItem('bool', true);

    assertStrictEqual(storage.length, 3);
    assertStrictEqual(storage.getItem('alpha'), 'hello');
    assertStrictEqual(storage.getItem('numeric'), '12345');
    assertStrictEqual(storage.getItem('bool'), 'true');
    assertStrictEqual(storage.getItem('nonexistent'), null);

    storage.removeItem('alpha');
    assertStrictEqual(storage.length, 2);
    assertStrictEqual(storage.getItem('alpha'), null);

    storage.clear();
    assertStrictEqual(storage.length, 0);
  });

  it('Storage: simulates quota exceeded DOMException correctly', () => {
    const storage = new MemoryStorage();
    storage.setQuotaExceeded(true);

    assertThrows(
      () => storage.setItem('overflow', 'test payload'),
      /QuotaExceededError/
    );

    storage.setQuotaExceeded(false);
    storage.setItem('overflow', 'test payload');
    assertStrictEqual(storage.getItem('overflow'), 'test payload');
  });

  it('IndexedDB: supports database open, schema upgrade, and round-trip transactions', async () => {
    const db = await new Promise<any>((resolve, reject) => {
      const req = fakeIndexedDB.open('TestDatabase', 1);
      req.onupgradeneeded = () => {
        const idb = req.result;
        idb.createObjectStore('test_store');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    assertTrue(db.objectStoreNames.contains('test_store'));

    // Write record
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('test_store', 'readwrite');
      const store = tx.objectStore('test_store');
      store.put({ id: 101, title: 'Test Record' }, 'rec_101');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Read record
    const retrieved = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction('test_store', 'readonly');
      const store = tx.objectStore('test_store');
      const req = store.get('rec_101');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    assertStrictEqual(retrieved?.id, 101);
    assertStrictEqual(retrieved?.title, 'Test Record');
    db.close();
  });

  it('IndexedDB: persists data across db.close() and matches FourRentPersistentDatabase contract', async () => {
    await clearSnapshotFromIndexedDb();

    const snapshot = createMockSnapshot({
      rooms: [createMockRoom({ name: 'Persistent Room 202' })],
    });

    await saveSnapshotToIndexedDb(snapshot);
    const loaded = await loadSnapshotFromIndexedDb();

    assertTrue(loaded !== null, 'Loaded snapshot should not be null');
    assertStrictEqual(loaded?.rooms[0]?.name, 'Persistent Room 202');
  });

  it('BroadcastChannel: communicates across independent channel instances', async () => {
    const ch1 = new FakeBroadcastChannel('test_sync_bus');
    const ch2 = new FakeBroadcastChannel('test_sync_bus');

    let receivedData: any = null;
    ch2.onmessage = (ev) => {
      receivedData = ev.data;
    };

    ch1.postMessage({ action: 'ping', count: 42 });
    assertStrictEqual(receivedData?.action, 'ping');
    assertStrictEqual(receivedData?.count, 42);

    ch1.close();
    ch2.close();
  });

  it('Cross-Instance Sync: integrates with storageService subscribeToLocalCrossWindowSync', async () => {
    let syncTriggered = false;
    const unsubscribe = subscribeToLocalCrossWindowSync(() => {
      syncTriggered = true;
    });

    // Simulate another tab broadcasting a sync change
    const peerChannel = new FakeBroadcastChannel('4rent_realtime_sync_channel');
    peerChannel.postMessage({
      senderId: 'remote_tab_999',
      key: '4rent_db_rooms',
      updatedAt: Date.now(),
    });

    assertTrue(syncTriggered, 'Cross-tab subscriber should be notified of remote update');
    unsubscribe();
    peerChannel.close();
  });

  it('DOM Globals: canvas and 2D context handle pixel extraction and data URLs', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    assertTrue(ctx !== null, 'Context2D must be non-null');

    const imgData = ctx!.getImageData(0, 0, 10, 10);
    assertStrictEqual(imgData.width, 10);
    assertStrictEqual(imgData.height, 10);
    assertStrictEqual(imgData.data.length, 10 * 10 * 4);

    const dataUrl = canvas.toDataURL('image/png');
    assertTrue(dataUrl.startsWith('data:image/png;base64,'), 'toDataURL must return base64 data URL');
  });
});

describe('Harness Foundation: Test Utilities & Fixtures', () => {
  it('Assertions: verify all assertion helpers operate correctly', async () => {
    assertStrictEqual(10, 10);
    assertDeepEqual({ a: [1, 2] }, { a: [1, 2] });
    assertCloseTo(3.40001, 3.4, 0.001);
    assertTrue(true);
    assertFalse(false);
    assertThrows(() => {
      throw new Error('Expected failure');
    });
    await assertRejects(async () => {
      throw new Error('Async rejection');
    });
  });

  it('Mock Factories: generate valid, typed business entities with defaults and overrides', () => {
    const tenant = createMockTenant({ fullName: 'Maria Clara' });
    assertStrictEqual(tenant.fullName, 'Maria Clara');
    assertTrue(tenant.validIdVerified);

    const room = createMockRoom({ name: 'Room 303', monthlyRent: 5000 });
    assertStrictEqual(room.name, 'Room 303');
    assertStrictEqual(room.monthlyRent, 5000);
    assertStrictEqual(room.status, 'occupied');

    const bill = createMockBill({
      prevReading: 100,
      currReading: 150,
      electricRate: 15,
      baseRent: 4500,
    });
    assertStrictEqual(bill.consumptionKwh, 50);
    assertStrictEqual(bill.electricTotal, 750);
    assertStrictEqual(bill.totalAmountDue, 5250);

    const inquiry = createMockInquiry({ reservationFee: 1500 });
    assertStrictEqual(inquiry.reservationFee, 1500);

    const hist = createMockTenantHistory({ finalMeterReading: 800.5 });
    assertStrictEqual(hist.finalMeterReading, 800.5);
  });

  it('LocalStorage Seeding: seeds database state and reads back via readLocalStorageSnapshot', () => {
    const seedRoom = createMockRoom({ name: 'Seed Room 501' });
    seedLocalStorage({ rooms: [seedRoom] });

    const snap = readLocalStorageSnapshot();
    assertStrictEqual(snap.rooms.length, 1);
    assertStrictEqual(snap.rooms[0].name, 'Seed Room 501');

    const loadedRooms = loadRooms();
    assertStrictEqual(loadedRooms.length, 1);
    assertStrictEqual(loadedRooms[0].name, 'Seed Room 501');
  });
});

describe('Harness Foundation: Meter Photo Fixtures & Manifest', () => {
  const fixturesDir = path.join(projectRoot, 'tests', 'fixtures', 'sample-meters');
  const manifestPath = path.join(fixturesDir, 'manifest.json');

  it('Manifest: manifest.json exists, is valid JSON, and catalogs all 6 calibrated profiles', () => {
    assertTrue(fs.existsSync(manifestPath), 'manifest.json must exist');
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);

    assertStrictEqual(manifest.fixtures.length, 6, 'Must contain 6 calibrated fixtures');

    const expectedProfiles = [
      'safari_sy168_0_1',
      'static_sp1_3_4',
      'ge_kv2c_blank',
      'safari_sy168_0_3',
      'cirtech_mt60i_blank',
      'user_round_cyclometer_sample',
    ];

    const actualProfiles = manifest.fixtures.map((f: any) => f.profileId);
    assertDeepEqual(actualProfiles, expectedProfiles);
  });

  it('PNG Fixtures: all 6 PNG files exist and contain genuine PNG magic headers', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    for (const fixture of manifest.fixtures) {
      const filePath = path.join(fixturesDir, fixture.fileName);
      assertTrue(fs.existsSync(filePath), `Fixture file must exist: ${fixture.fileName}`);

      const buf = fs.readFileSync(filePath);
      assertTrue(buf.length > 100, `Fixture must be non-empty image (>100B): ${fixture.fileName}`);

      const header = buf.subarray(0, 8);
      assertTrue(
        header.equals(pngMagic),
        `Fixture ${fixture.fileName} must begin with PNG magic header`
      );
    }
  });

  it('Fixture Specifications: manifest maps accurate hardware specs and readings', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const safari01 = manifest.fixtures.find((f: any) => f.profileId === 'safari_sy168_0_1');
    assertStrictEqual(safari01.expectedReadingKwh, 0.1);
    assertStrictEqual(safari01.expectedConfidence, 99);
    assertStrictEqual(safari01.inspection.brandModel, 'Safari SY-168 Electronic kWh Meter');

    const static34 = manifest.fixtures.find((f: any) => f.profileId === 'static_sp1_3_4');
    assertStrictEqual(static34.expectedReadingKwh, 3.4);
    assertStrictEqual(static34.expectedConfidence, 99);
    assertStrictEqual(static34.inspection.brandModel, 'Static Watthour Meter TYPE-SP1');

    const digitalBlank = manifest.fixtures.find((f: any) => f.profileId === 'ge_kv2c_blank');
    assertStrictEqual(digitalBlank.expectedReadingKwh, 0.0);
    assertTrue(digitalBlank.inspection.isBlankUnpoweredLcd);
  });
});
