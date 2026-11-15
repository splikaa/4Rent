import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePropertyCode,
  getOrCreateDevicePropertyCode,
  normalizePropertyCode,
} from '../src/utils/propertyCode';
import { computeLandscapeFrameProjection } from '../src/utils/cameraGeometry';
import { getMeterMasterImage } from '../src/services/idbDatabase';
import {
  DEFAULT_SETTINGS,
  applyCloudSnapshotCleanly,
  clearPendingCloudApply,
  exportDatabaseSnapshot,
  loadBills,
  loadInquiries,
  loadReadingLogs,
  loadRooms,
  loadSettings,
  loadTenantHistory,
  resetWorkspaceForPropertyCode,
  saveBills,
  saveInquiries,
  saveReadingLogs,
  saveRooms,
  saveSettings,
  saveTenantHistory,
} from '../src/services/storageService';
import {
  mergeDatabaseSnapshots,
  pullSnapshotFromFirebase,
} from '../src/services/firebaseSync';
import { applyPropertyCodeAndSync } from '../src/services/propertySpaceSwitch';
import type {
  AppDatabaseSnapshot,
  AppSettings,
  BillRecord,
  Room,
  RoomInquiryBooking,
  SubMeterReadingLog,
  TenantHistoryEntry,
} from '../src/types/rental';

function installMockLocalStorage(options?: {
  initial?: Record<string, string>;
  throwQuotaOnKeyOnce?: string;
}): {
  store: Map<string, string>;
  restore: () => void;
} {
  const store = new Map<string, string>(
    Object.entries(options?.initial || {})
  );
  let throwOnceKey = options?.throwQuotaOnKeyOnce || '';
  const prevDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage'
  );

  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      if (throwOnceKey && key === throwOnceKey) {
        throwOnceKey = '';
        const err = new Error(
          `Failed to execute 'setItem' on 'Storage': Setting the value of '${key}' exceeded the quota.`
        );
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: mockStorage,
  });

  return {
    store,
    restore: () => {
      if (prevDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', prevDescriptor);
      } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
      }
    },
  };
}

test('Property Code: fresh installs get a unique random code and never default to 4RENT-MAIN', () => {
  const mock = installMockLocalStorage();
  try {
    const code1 = generatePropertyCode();
    const code2 = generatePropertyCode();
    assert.match(code1, /^4R-[A-Z0-9]{6}$/);
    assert.match(code2, /^4R-[A-Z0-9]{6}$/);
    assert.notEqual(code1, '4RENT-MAIN');

    const deviceCode = getOrCreateDevicePropertyCode();
    assert.match(deviceCode, /^4R-[A-Z0-9]{6}$/);
    assert.notEqual(deviceCode, '4RENT-MAIN');
    assert.equal(getOrCreateDevicePropertyCode(), deviceCode);

    const freshSettings = loadSettings();
    assert.equal(freshSettings.cloudSync.propertyCode, deviceCode);
    assert.notEqual(freshSettings.cloudSync.propertyCode, '4RENT-MAIN');

    // User-customized property code persists across saveSettings/loadSettings
    const customSettings = {
      ...freshSettings,
      cloudSync: {
        ...freshSettings.cloudSync,
        propertyCode: normalizePropertyCode('cebu-apt-07'),
      },
    };
    saveSettings(customSettings);
    assert.equal(loadSettings().cloudSync.propertyCode, 'CEBU-APT-07');
  } finally {
    mock.restore();
  }
});

test('Storage Quota Protection: offloads bulky base64 photos to IndexedDB/memory keys and survives QuotaExceededError', async () => {
  const mock = installMockLocalStorage({
    throwQuotaOnKeyOnce: '4rent_db_rooms',
  });
  try {
    const bigPhoto = `data:image/jpeg;base64,${'A'.repeat(24000)}`;
    const bigCrop = `data:image/jpeg;base64,${'B'.repeat(18000)}`;

    const rooms: Room[] = [
      {
        id: 'room-1',
        name: 'Room 1',
        monthlyRent: 4500,
        lastMeterReading: 3020.7,
        lastMeterPhotoDataUrl: bigPhoto,
        lastMeterCropDataUrl: bigCrop,
        status: 'occupied',
        tenant: {
          id: 'ten-1',
          fullName: 'Yuri',
          phone: '0917-000-0001',
          moveInDate: '2026-10-01',
          dueDayOfMonth: 5,
        },
        unpaidBalance: 0,
        securityDeposit: 4500,
        securityDepositPaid: 2500,
        advanceRent: 0,
        advanceHistory: [],
        updatedAt: '2026-11-15T10:00:00.000Z',
      },
    ];

    assert.doesNotThrow(() => saveRooms(rooms));

    const storedRoomsRaw = mock.store.get('4rent_db_rooms') || '';
    assert.ok(storedRoomsRaw.length > 0 && storedRoomsRaw.length < 4000);
    assert.equal(storedRoomsRaw.includes(bigPhoto), false);
    assert.equal(storedRoomsRaw.includes(bigCrop), false);

    const reloadedRooms = loadRooms();
    assert.equal(reloadedRooms.length, 1);
    const photoKey = reloadedRooms[0].lastMeterPhotoDataUrl || '';
    const cropKey = reloadedRooms[0].lastMeterCropDataUrl || '';
    assert.ok(photoKey.startsWith('idb:meter:'));
    assert.ok(cropKey.startsWith('idb:meter:'));
    assert.equal(await getMeterMasterImage(photoKey), bigPhoto);
    assert.equal(await getMeterMasterImage(cropKey), bigCrop);

    const bills: BillRecord[] = [
      {
        id: 'bill-1',
        receiptNo: '4R-202611-1',
        roomId: 'room-1',
        roomName: 'Room 1',
        tenantName: 'Yuri',
        billingPeriod: 'Nov 2026',
        createdAt: '2026-11-15T10:00:00.000Z',
        dueDate: '2026-12-04T12:00:00.000Z',
        prevReading: 0,
        currReading: 3020.7,
        consumptionKwh: 3020.7,
        electricRate: 11.84,
        electricTotal: 35765.09,
        prevMeterPhotoDataUrl: bigPhoto,
        prevMeterCropDataUrl: bigCrop,
        meterPhotoDataUrl: bigPhoto,
        currMeterCropDataUrl: bigCrop,
        baseRent: 4500,
        securityDepositRequired: 4500,
        previousBalanceCarryOver: 0,
        depositApplied: 0,
        totalAmountDue: 40265.09,
        amountPaid: 0,
        overpaymentToAdvance: 0,
        remainingBalance: 40265.09,
        status: 'unpaid',
        paymentHistory: [],
        updatedAt: '2026-11-15T10:00:00.000Z',
      },
    ];

    assert.doesNotThrow(() => saveBills(bills));
    const storedBillsRaw = mock.store.get('4rent_db_bills') || '';
    assert.ok(storedBillsRaw.length > 0 && storedBillsRaw.length < 4000);
    const reloadedBills = loadBills();
    assert.ok(reloadedBills[0].meterPhotoDataUrl?.startsWith('idb:meter:'));
    assert.ok(reloadedBills[0].currMeterCropDataUrl?.startsWith('idb:meter:'));
  } finally {
    mock.restore();
  }
});

test('Landscape OCR Camera Geometry: crops portrait mobile feeds into center 16:9 landscape frame', () => {
  // Portrait camera stream (720x1280) should yield full-width centered 16:9 landscape crop
  const portrait = computeLandscapeFrameProjection(720, 1280);
  assert.ok(portrait.outWidth > portrait.outHeight, 'Output canvas must be landscape');
  assert.equal(portrait.sx, 0);
  assert.equal(portrait.sw, 720);
  assert.equal(portrait.sh, 405);
  assert.equal(portrait.sy, 438);
  assert.ok(Math.abs(portrait.outWidth / portrait.outHeight - 16 / 9) < 0.02);

  // Native 16:9 landscape stream (1920x1080) preserves full frame
  const landscape = computeLandscapeFrameProjection(1920, 1080);
  assert.equal(landscape.sx, 0);
  assert.equal(landscape.sy, 0);
  assert.equal(landscape.sw, 1920);
  assert.equal(landscape.sh, 1080);
  assert.ok(landscape.outWidth > landscape.outHeight);
});

function installMockIndexedDb(initialMasterSnapshot?: AppDatabaseSnapshot): {
  snapshots: Map<string, AppDatabaseSnapshot>;
  restore: () => void;
} {
  const snapshots = new Map<string, AppDatabaseSnapshot>();
  if (initialMasterSnapshot) {
    snapshots.set('master_snapshot', initialMasterSnapshot);
  }
  const meterImages = new Map<string, string>();
  const prevDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'indexedDB'
  );

  const mockIndexedDb = {
    open: () => {
      const openReq: any = {
        result: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        const db: any = {
          objectStoreNames: {
            contains: () => true,
          },
          createObjectStore: () => ({}),
          close: () => {},
          transaction: (storeName: string) => {
            const tx: any = {
              oncomplete: null,
              onerror: null,
              objectStore: () => ({
                get: (key: string) => {
                  const req: any = { result: undefined, onsuccess: null, onerror: null };
                  queueMicrotask(() => {
                    req.result =
                      storeName === 'app_state'
                        ? snapshots.get(key)
                        : meterImages.get(key);
                    req.onsuccess?.();
                  });
                  return req;
                },
                put: (value: any, key: string) => {
                  const req: any = { onsuccess: null, onerror: null };
                  queueMicrotask(() => {
                    if (storeName === 'app_state') {
                      snapshots.set(key, value);
                    } else {
                      meterImages.set(key, value);
                    }
                    req.onsuccess?.();
                    tx.oncomplete?.();
                  });
                  return req;
                },
              }),
            };
            return tx;
          },
        };
        openReq.result = db;
        openReq.onsuccess?.();
      });
      return openReq;
    },
  };

  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: mockIndexedDb,
  });

  return {
    snapshots,
    restore: () => {
      if (prevDescriptor) {
        Object.defineProperty(globalThis, 'indexedDB', prevDescriptor);
      } else {
        delete (globalThis as { indexedDB?: unknown }).indexedDB;
      }
    },
  };
}

function makeRoom(id: string, name: string, tenantName = 'Yuri'): Room {
  return {
    id,
    name,
    monthlyRent: 4500,
    lastMeterReading: 120.5,
    status: 'occupied',
    tenant: {
      id: `ten-${id}`,
      fullName: tenantName,
      phone: '0917-111-2222',
      moveInDate: '2026-10-01',
      dueDayOfMonth: 5,
    },
    unpaidBalance: 1500,
    securityDeposit: 4500,
    securityDepositPaid: 4500,
    advanceRent: 2000,
    advanceHistory: [],
    updatedAt: '2026-11-15T10:00:00.000Z',
  };
}

function makeBill(id: string, roomId: string, roomName: string, tenantName = 'Yuri'): BillRecord {
  return {
    id,
    receiptNo: `4R-${id}`,
    roomId,
    roomName,
    tenantName,
    billingPeriod: 'Nov 2026',
    createdAt: '2026-11-15T10:00:00.000Z',
    dueDate: '2026-12-05T12:00:00.000Z',
    prevReading: 100,
    currReading: 120.5,
    consumptionKwh: 20.5,
    electricRate: 12,
    electricTotal: 246,
    baseRent: 4500,
    securityDepositRequired: 4500,
    previousBalanceCarryOver: 0,
    depositApplied: 0,
    totalAmountDue: 4746,
    amountPaid: 0,
    overpaymentToAdvance: 0,
    remainingBalance: 4746,
    status: 'unpaid',
    paymentHistory: [],
    updatedAt: '2026-11-15T10:00:00.000Z',
  };
}

function seedLocalWorkspace(propertyCode: string, apartmentName = 'Old Towers') {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    apartmentName,
    landlordName: 'Landlord A',
    defaultElectricRate: 14.5,
    monthlyElectricRates: { '2026-11': 14.5 },
    defaultMonthlyRent: 6000,
    security: {
      isSetupComplete: true,
      lockEnabled: true,
      authMethod: 'pin',
      pinCode: '9876',
    },
    cloudSync: {
      enabled: true,
      provider: 'firebase',
      firebaseDatabaseUrl: 'https://example-default-rtdb.firebaseio.com',
      propertyCode,
    },
  };
  const room = makeRoom('room-old-1', 'Old Room 1', 'Old Tenant');
  const bill = makeBill('bill-old-1', 'room-old-1', 'Old Room 1', 'Old Tenant');
  const inquiry: RoomInquiryBooking = {
    id: 'inq-1',
    roomId: 'room-old-1',
    roomName: 'Old Room 1',
    prospectName: 'Prospect A',
    phone: '0917-999-8888',
    targetMoveInDate: '2026-12-01',
    reservationFee: 1000,
    quotedMonthlyRent: 4500,
    requiredDeposit: 4500,
    status: 'inquiry',
    createdAt: '2026-11-10T08:00:00.000Z',
  };
  const history: TenantHistoryEntry = {
    id: 'hist-1',
    roomId: 'room-old-1',
    roomName: 'Old Room 1',
    tenantName: 'Past Tenant',
    phone: '0917-222-3333',
    moveInDate: '2026-01-01',
    moveOutDate: '2026-09-30',
    finalMeterReading: 100,
    depositHeld: 4500,
    unpaidBalanceAtMoveOut: 0,
  };
  const log: SubMeterReadingLog = {
    id: 'log-1',
    roomId: 'room-old-1',
    roomName: 'Old Room 1',
    readingDate: '2026-11-15T10:00:00.000Z',
    readingKwh: 120.5,
    consumptionDeltaKwh: 20.5,
    source: 'manual_entry',
  };
  saveSettings(settings);
  saveRooms([room]);
  saveBills([bill]);
  saveInquiries([inquiry]);
  saveTenantHistory([history]);
  saveReadingLogs([log]);
  return { settings, room, bill, inquiry, history, log };
}

test('pullSnapshotFromFirebase distinguishes missing space (notFound: true) from network/server errors', async () => {
  const prevFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => null,
      }) as Response) as typeof fetch;

    const missing = await pullSnapshotFromFirebase({
      enabled: true,
      firebaseDatabaseUrl: 'https://example-default-rtdb.firebaseio.com',
      propertyCode: 'NEW-UNIT-99',
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.notFound, true);

    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      }) as Response) as typeof fetch;

    const serverErr = await pullSnapshotFromFirebase({
      enabled: true,
      firebaseDatabaseUrl: 'https://example-default-rtdb.firebaseio.com',
      propertyCode: 'NEW-UNIT-99',
    });
    assert.equal(serverErr.ok, false);
    assert.notEqual(serverErr.notFound, true);

    globalThis.fetch = (async () => {
      throw new Error('Network offline');
    }) as typeof fetch;

    const netErr = await pullSnapshotFromFirebase({
      enabled: true,
      firebaseDatabaseUrl: 'https://example-default-rtdb.firebaseio.com',
      propertyCode: 'NEW-UNIT-99',
    });
    assert.equal(netErr.ok, false);
    assert.notEqual(netErr.notFound, true);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('resetWorkspaceForPropertyCode clears collections & workspace settings, preserves PIN, and overwrites IndexedDB master snapshot', async () => {
  const mockLs = installMockLocalStorage();
  const oldSnapshot: AppDatabaseSnapshot = {
    version: '1.0.0',
    exportedAt: '2026-11-15T10:00:00.000Z',
    rooms: [makeRoom('room-old-1', 'Old Room 1')],
    bills: [makeBill('bill-old-1', 'room-old-1', 'Old Room 1')],
    inquiries: [],
    tenantHistory: [],
    settings: DEFAULT_SETTINGS,
  };
  const mockIdb = installMockIndexedDb(oldSnapshot);
  try {
    seedLocalWorkspace('CODE-OLD-01', 'Custom Old Building');

    await resetWorkspaceForPropertyCode({
      enabled: true,
      provider: 'firebase',
      firebaseDatabaseUrl: 'https://example-default-rtdb.firebaseio.com',
      propertyCode: 'CODE-BRAND-NEW',
    });

    assert.deepEqual(loadRooms(), []);
    assert.deepEqual(loadBills(), []);
    assert.deepEqual(loadInquiries(), []);
    assert.deepEqual(loadTenantHistory(), []);
    assert.deepEqual(loadReadingLogs(), []);

    const nextSettings = loadSettings();
    assert.equal(nextSettings.cloudSync.propertyCode, 'CODE-BRAND-NEW');
    assert.notEqual(nextSettings.apartmentName, 'Custom Old Building');
    assert.equal(nextSettings.security.pinCode, '9876');
    assert.equal(nextSettings.security.lockEnabled, true);
    assert.equal(nextSettings.security.authMethod, 'pin');

    // IndexedDB must hold empty collections so page reload never resurrects CODE-OLD-01 data
    const idbAfter = mockIdb.snapshots.get('master_snapshot');
    assert.ok(idbAfter);
    assert.deepEqual(idbAfter.rooms, []);
    assert.deepEqual(idbAfter.bills, []);
    assert.equal(idbAfter.settings.cloudSync.propertyCode, 'CODE-BRAND-NEW');
  } finally {
    mockIdb.restore();
    mockLs.restore();
  }
});

test('applyPropertyCodeAndSync loads existing remote space cleanly without leaking old rooms or bills', async () => {
  const mockLs = installMockLocalStorage();
  const mockIdb = installMockIndexedDb();
  try {
    const seeded = seedLocalWorkspace('CODE-OLD-A', 'Building A');

    const remoteSnapB: AppDatabaseSnapshot = {
      version: '1.0.0',
      exportedAt: '2026-11-15T12:00:00.000Z',
      rooms: [makeRoom('room-b-1', 'Tower B Unit 1', 'Tenant B')],
      bills: [makeBill('bill-b-1', 'room-b-1', 'Tower B Unit 1', 'Tenant B')],
      inquiries: [],
      tenantHistory: [],
      meterLogs: [],
      settings: {
        ...DEFAULT_SETTINGS,
        apartmentName: 'Building B Cloud',
        cloudSync: {
          enabled: true,
          provider: 'firebase',
          firebaseDatabaseUrl: 'https://example-default-rtdb.firebaseio.com',
          propertyCode: 'CODE-EXIST-B',
        },
      },
    };

    let pushCalled = false;
    const result = await applyPropertyCodeAndSync({
      previousCode: seeded.settings.cloudSync.propertyCode,
      targetCloudSync: {
        ...seeded.settings.cloudSync,
        propertyCode: 'code-exist-b',
      },
      isOnline: true,
      networkLabel: 'Wi-Fi',
      deps: {
        pull: async () => ({
          ok: true,
          message: 'Pulled',
          snapshot: remoteSnapB,
          updatedAt: '2026-11-15T12:05:00.000Z',
        }),
        push: async () => {
          pushCalled = true;
          return { ok: true, message: 'Pushed', syncedAt: '2026-11-15T12:06:00.000Z' };
        },
        exportSnapshot: exportDatabaseSnapshot,
        importSnapshot: () => {},
        mergeSnapshots: mergeDatabaseSnapshots,
        applyClean: applyCloudSnapshotCleanly,
        resetWorkspace: resetWorkspaceForPropertyCode,
        clearPending: clearPendingCloudApply,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'switched-existing');
    assert.equal(result.requiresReload, true);
    assert.equal(result.dataChanged, true);
    assert.equal(pushCalled, false, 'Loading an existing cloud space must not push stale local data over it');

    const loadedRooms = loadRooms();
    const loadedBills = loadBills();
    assert.equal(loadedRooms.length, 1);
    assert.equal(loadedRooms[0].id, 'room-b-1');
    assert.equal(loadedBills.length, 1);
    assert.equal(loadedBills[0].id, 'bill-b-1');
    assert.equal(loadSettings().apartmentName, 'Building B Cloud');
    assert.equal(loadSettings().cloudSync.propertyCode, 'CODE-EXIST-B');
    assert.equal(loadSettings().security.pinCode, '9876');
  } finally {
    mockIdb.restore();
    mockLs.restore();
  }
});

test('applyPropertyCodeAndSync resets dashboard & workspace when new code does not exist yet and pushes fresh snapshot', async () => {
  const mockLs = installMockLocalStorage();
  const mockIdb = installMockIndexedDb();
  try {
    const seeded = seedLocalWorkspace('CODE-OLD-A', 'Building A');

    let pushedCode = '';
    let pushedSnap = null as AppDatabaseSnapshot | null;

    const result = await applyPropertyCodeAndSync({
      previousCode: seeded.settings.cloudSync.propertyCode,
      targetCloudSync: {
        ...seeded.settings.cloudSync,
        propertyCode: 'code-fresh-new',
      },
      isOnline: true,
      networkLabel: 'Wi-Fi',
      deps: {
        pull: async () => ({
          ok: false,
          notFound: true,
          message: 'No cloud snapshot found',
        }),
        push: async (config, snap) => {
          pushedCode = config.propertyCode;
          pushedSnap = snap;
          return {
            ok: true,
            message: 'Pushed',
            syncedAt: '2026-11-15T12:10:00.000Z',
          };
        },
        exportSnapshot: exportDatabaseSnapshot,
        importSnapshot: () => {},
        mergeSnapshots: mergeDatabaseSnapshots,
        applyClean: applyCloudSnapshotCleanly,
        resetWorkspace: resetWorkspaceForPropertyCode,
        clearPending: clearPendingCloudApply,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'switched-new');
    assert.equal(result.requiresReload, true);
    assert.equal(result.dataChanged, true);
    assert.equal(pushedCode, 'CODE-FRESH-NEW');
    assert.ok(pushedSnap);
    assert.deepEqual(pushedSnap!.rooms, []);
    assert.deepEqual(pushedSnap!.bills, []);
    assert.equal(loadRooms().length, 0);
    assert.equal(loadBills().length, 0);
    assert.equal(loadSettings().cloudSync.propertyCode, 'CODE-FRESH-NEW');
    assert.equal(loadSettings().cloudSync.lastSyncedAt, '2026-11-15T12:10:00.000Z');
    assert.equal(loadSettings().security.pinCode, '9876');
  } finally {
    mockIdb.restore();
    mockLs.restore();
  }
});

test('applyPropertyCodeAndSync aborts and preserves local data if verifying the new code fails with a network/HTTP error', async () => {
  const mockLs = installMockLocalStorage();
  const mockIdb = installMockIndexedDb();
  try {
    const seeded = seedLocalWorkspace('CODE-OLD-A', 'Building A');
    let pushCalled = false;

    const result = await applyPropertyCodeAndSync({
      previousCode: seeded.settings.cloudSync.propertyCode,
      targetCloudSync: {
        ...seeded.settings.cloudSync,
        propertyCode: 'CODE-UNREACHABLE',
      },
      isOnline: true,
      networkLabel: 'Wi-Fi',
      deps: {
        pull: async () => ({
          ok: false,
          notFound: false,
          message: 'Firebase Error (503): Service Unavailable',
        }),
        push: async () => {
          pushCalled = true;
          return { ok: true, message: 'Pushed', syncedAt: '2026-11-15T12:10:00.000Z' };
        },
        exportSnapshot: exportDatabaseSnapshot,
        importSnapshot: () => {},
        mergeSnapshots: mergeDatabaseSnapshots,
        applyClean: applyCloudSnapshotCleanly,
        resetWorkspace: resetWorkspaceForPropertyCode,
        clearPending: clearPendingCloudApply,
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.mode, 'blocked');
    assert.equal(result.requiresReload, false);
    assert.equal(pushCalled, false);
    assert.equal(loadRooms().length, 1);
    assert.equal(loadRooms()[0].id, 'room-old-1');
    assert.equal(loadSettings().cloudSync.propertyCode, 'CODE-OLD-A');
  } finally {
    mockIdb.restore();
    mockLs.restore();
  }
});

test('applyPropertyCodeAndSync merges bidirectional updates when staying on the same Property Space Code', async () => {
  const mockLs = installMockLocalStorage();
  const mockIdb = installMockIndexedDb();
  try {
    const seeded = seedLocalWorkspace('CODE-SAME-1', 'Same Building');
    const remoteExtraRoom = makeRoom('room-remote-2', 'Remote Unit 2', 'Remote Tenant');
    const remoteSnap: AppDatabaseSnapshot = {
      version: '1.0.0',
      exportedAt: '2026-11-15T12:20:00.000Z',
      rooms: [remoteExtraRoom],
      bills: [],
      inquiries: [],
      tenantHistory: [],
      settings: seeded.settings,
    };

    let pushedSnap = null as AppDatabaseSnapshot | null;
    let importedSnap = null as AppDatabaseSnapshot | null;

    const result = await applyPropertyCodeAndSync({
      previousCode: 'CODE-SAME-1',
      targetCloudSync: seeded.settings.cloudSync,
      isOnline: true,
      networkLabel: 'Wi-Fi',
      deps: {
        pull: async () => ({
          ok: true,
          message: 'Pulled',
          snapshot: remoteSnap,
          updatedAt: '2026-11-15T12:20:00.000Z',
        }),
        push: async (_config, snap) => {
          pushedSnap = snap;
          return {
            ok: true,
            message: 'Pushed',
            syncedAt: '2026-11-15T12:21:00.000Z',
          };
        },
        exportSnapshot: exportDatabaseSnapshot,
        importSnapshot: (snap) => {
          importedSnap = snap;
        },
        mergeSnapshots: mergeDatabaseSnapshots,
        applyClean: applyCloudSnapshotCleanly,
        resetWorkspace: resetWorkspaceForPropertyCode,
        clearPending: clearPendingCloudApply,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.mode, 'merged-same-code');
    assert.ok(importedSnap);
    assert.ok(pushedSnap);
    assert.equal(pushedSnap!.rooms.length, 2);
    assert.ok(pushedSnap!.rooms.some((r) => r.id === 'room-old-1'));
    assert.ok(pushedSnap!.rooms.some((r) => r.id === 'room-remote-2'));
  } finally {
    mockIdb.restore();
    mockLs.restore();
  }
});
