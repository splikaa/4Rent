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
  loadBills,
  loadRooms,
  loadSettings,
  saveBills,
  saveRooms,
  saveSettings,
} from '../src/services/storageService';
import type { BillRecord, Room } from '../src/types/rental';

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
