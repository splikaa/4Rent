import {
  AppDatabaseSnapshot,
  AppSettings,
  BillRecord,
  Room,
  RoomInquiryBooking,
  TenantHistoryEntry,
} from '../types/rental';
import { generateSimulatedSubMeterDataUrl } from './ocrService';
import { getNextDueDateInOneToTenWindow } from '../utils/billingCalculator';
import { saveSnapshotToIndexedDb } from './idbDatabase';

/**
 * Stable, version-independent storage keys so app updates NEVER wipe existing data.
 */
const STORAGE_KEYS = {
  ROOMS: '4rent_db_rooms',
  BILLS: '4rent_db_bills',
  INQUIRIES: '4rent_db_inquiries',
  HISTORY: '4rent_db_tenant_history',
  SETTINGS: '4rent_db_settings',
};

/**
 * Developer-level pre-configured Cloud Sync credentials.
 * As the developer (splikaa), you can set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * in `.env` so the landlord's Desktop & Mobile apps sync out-of-the-box with zero setup.
 */
const viteEnv =
  (import.meta as unknown as { env?: Record<string, string> }).env || {};
const DEV_SUPABASE_URL = viteEnv.VITE_SUPABASE_URL || '';
const DEV_SUPABASE_ANON_KEY = viteEnv.VITE_SUPABASE_ANON_KEY || '';
const DEV_PROPERTY_CODE = viteEnv.VITE_PROPERTY_CODE || '4RENT-MAIN';

export const DEFAULT_SETTINGS: AppSettings = {
  apartmentName: '4Rent Apartments',
  landlordName: 'Property Administrator',
  landlordPhone: '0917-000-0000',
  landlordMessenger: '',
  paymentInstructions: '',
  defaultElectricRate: 15.0,
  defaultMonthlyRent: 4500.0,
  defaultSecurityDeposit: 4500.0,
  remindersPromptShown: false,
  remindersEnabled: false,
  receiptPrintFormat: 'standard',
  security: {
    isSetupComplete: false,
    lockEnabled: false,
    authMethod: 'none',
    pinCode: '1234',
  },
  cloudSync: {
    enabled: Boolean(DEV_SUPABASE_URL && DEV_SUPABASE_ANON_KEY),
    supabaseUrl: DEV_SUPABASE_URL,
    supabaseAnonKey: DEV_SUPABASE_ANON_KEY,
    propertyCode: DEV_PROPERTY_CODE,
  },
};

export function loadSettings(): AppSettings {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.SETTINGS) ||
      localStorage.getItem('4rent_settings_v2') ||
      localStorage.getItem('4rent_settings_v1');
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      security: {
        ...DEFAULT_SETTINGS.security,
        ...(parsed.security || {}),
        pinCode: parsed.security?.pinCode || '1234',
      },
      cloudSync: {
        ...DEFAULT_SETTINGS.cloudSync,
        ...(parsed.cloudSync || {}),
        supabaseUrl: parsed.cloudSync?.supabaseUrl || DEV_SUPABASE_URL,
        supabaseAnonKey:
          parsed.cloudSync?.supabaseAnonKey || DEV_SUPABASE_ANON_KEY,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  persistMasterIndexedDb();
}

export function loadRooms(): Room[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.ROOMS) ||
      localStorage.getItem('4rent_rooms_v2') ||
      localStorage.getItem('4rent_rooms_v1');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRooms(rooms: Room[]): void {
  localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
  persistMasterIndexedDb();
}

export function loadBills(): BillRecord[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.BILLS) ||
      localStorage.getItem('4rent_bills_v2') ||
      localStorage.getItem('4rent_bills_v1');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBills(bills: BillRecord[]): void {
  localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(bills));
  persistMasterIndexedDb();
}

export function loadInquiries(): RoomInquiryBooking[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.INQUIRIES) ||
      localStorage.getItem('4rent_inquiries_v2');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveInquiries(inquiries: RoomInquiryBooking[]): void {
  localStorage.setItem(STORAGE_KEYS.INQUIRIES, JSON.stringify(inquiries));
  persistMasterIndexedDb();
}

export function loadTenantHistory(): TenantHistoryEntry[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.HISTORY) ||
      localStorage.getItem('4rent_tenant_history_v2') ||
      localStorage.getItem('4rent_tenant_history_v1');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTenantHistory(history: TenantHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  persistMasterIndexedDb();
}

export function exportDatabaseSnapshot(): AppDatabaseSnapshot {
  return {
    version: '1.2.0',
    exportedAt: new Date().toISOString(),
    rooms: loadRooms(),
    bills: loadBills(),
    inquiries: loadInquiries(),
    tenantHistory: loadTenantHistory(),
    settings: loadSettings(),
  };
}

function persistMasterIndexedDb(): void {
  const snap = exportDatabaseSnapshot();
  saveSnapshotToIndexedDb(snap);
}

export function importDatabaseSnapshot(snapshot: AppDatabaseSnapshot): void {
  if (Array.isArray(snapshot.rooms)) {
    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(snapshot.rooms));
  }
  if (Array.isArray(snapshot.bills)) {
    localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(snapshot.bills));
  }
  if (Array.isArray(snapshot.inquiries)) {
    localStorage.setItem(
      STORAGE_KEYS.INQUIRIES,
      JSON.stringify(snapshot.inquiries)
    );
  }
  if (Array.isArray(snapshot.tenantHistory)) {
    localStorage.setItem(
      STORAGE_KEYS.HISTORY,
      JSON.stringify(snapshot.tenantHistory)
    );
  }
  if (snapshot.settings) {
    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify(snapshot.settings)
    );
  }
  persistMasterIndexedDb();
}

export function createSampleDemoData(globalElectricRate = 15.0): {
  rooms: Room[];
  bills: BillRecord[];
  inquiries: RoomInquiryBooking[];
  history: TenantHistoryEntry[];
} {
  const now = new Date();
  const isoNow = now.toISOString();
  const dueWindow5 = getNextDueDateInOneToTenWindow(5);
  const dueWindow8 = getNextDueDateInOneToTenWindow(8);

  const prevPhoto101 = generateSimulatedSubMeterDataUrl(1420.0);
  const currPhoto101 = generateSimulatedSubMeterDataUrl(1485.6);
  const prevPhoto102 = generateSimulatedSubMeterDataUrl(2288.2);
  const currPhoto102 = generateSimulatedSubMeterDataUrl(2340.2);

  const rooms: Room[] = [
    {
      id: 'room-101',
      name: 'Room 101',
      monthlyRent: 4500,
      lastMeterReading: 1485.6,
      lastMeterPhotoDataUrl: currPhoto101,
      lastReadingDate: isoNow,
      status: 'occupied',
      unpaidBalance: 0,
      securityDeposit: 4500,
      advanceRent: 516,
      advanceHistory: [
        {
          id: 'adv-1',
          type: 'overpayment_credit',
          amount: 516,
          createdAt: isoNow,
          note: 'Excess ₱516.00 credited to Advance Payment Balance',
        },
      ],
      activeReceiptId: 'bill-demo-1',
      updatedAt: isoNow,
      tenant: {
        id: 'ten-101',
        fullName: 'Juan Dela Cruz',
        phone: '0917-555-0101',
        messengerUsername: 'juandelacruz',
        moveInDate: '2026-06-01',
        dueDayOfMonth: 5,
      },
    },
    {
      id: 'room-102',
      name: 'Room 102',
      monthlyRent: 5500,
      lastMeterReading: 2340.2,
      lastMeterPhotoDataUrl: currPhoto102,
      lastReadingDate: isoNow,
      status: 'occupied',
      unpaidBalance: 1230,
      securityDeposit: 5500,
      advanceRent: 0,
      activeReceiptId: 'bill-demo-2',
      updatedAt: isoNow,
      tenant: {
        id: 'ten-102',
        fullName: 'Angela Santos',
        phone: '0918-777-0202',
        messengerUsername: 'angelasantos',
        moveInDate: '2026-08-08',
        dueDayOfMonth: 8,
      },
    },
    {
      id: 'room-201',
      name: 'Room 201',
      monthlyRent: 5000,
      lastMeterReading: 890.0,
      status: 'vacant',
      unpaidBalance: 0,
      securityDeposit: 5000,
      advanceRent: 0,
      updatedAt: isoNow,
    },
  ];

  const bills: BillRecord[] = [
    {
      id: 'bill-demo-1',
      receiptNo: '4R-202611-101',
      roomId: 'room-101',
      roomName: 'Room 101',
      tenantName: 'Juan Dela Cruz',
      tenantPhone: '0917-555-0101',
      tenantMessenger: 'juandelacruz',
      billingPeriod: 'Nov 2026',
      createdAt: isoNow,
      dueDate: dueWindow5,
      paymentWindowLabel: 'Every 1st - 10th of the Month (Day 5)',
      prevReading: 1420.0,
      currReading: 1485.6,
      consumptionKwh: 65.6,
      electricRate: globalElectricRate,
      electricTotal: Math.round(65.6 * globalElectricRate * 100) / 100,
      prevMeterPhotoDataUrl: prevPhoto101,
      meterPhotoDataUrl: currPhoto101,
      baseRent: 4500,
      securityDepositRequired: 4500,
      previousBalanceCarryOver: 0,
      depositApplied: 0,
      totalAmountDue: 4500 + Math.round(65.6 * globalElectricRate * 100) / 100,
      amountPaid: 6000.0,
      overpaymentToAdvance: 516.0,
      remainingBalance: 0,
      status: 'paid',
      paymentMethod: 'GCash',
      paidAt: isoNow,
      paymentHistory: [
        {
          id: 'tx-demo-1',
          amount: 6000.0,
          overpaymentCredited: 516.0,
          method: 'GCash',
          paidAt: isoNow,
          referenceNo: 'GC-99481023',
        },
      ],
      updatedAt: isoNow,
    },
    {
      id: 'bill-demo-2',
      receiptNo: '4R-202611-102',
      roomId: 'room-102',
      roomName: 'Room 102',
      tenantName: 'Angela Santos',
      tenantPhone: '0918-777-0202',
      tenantMessenger: 'angelasantos',
      billingPeriod: 'Nov 2026',
      createdAt: isoNow,
      dueDate: dueWindow8,
      paymentWindowLabel: 'Every 1st - 10th of the Month (Day 8)',
      prevReading: 2288.2,
      currReading: 2340.2,
      consumptionKwh: 52.0,
      electricRate: globalElectricRate,
      electricTotal: Math.round(52.0 * globalElectricRate * 100) / 100,
      prevMeterPhotoDataUrl: prevPhoto102,
      meterPhotoDataUrl: currPhoto102,
      baseRent: 5500,
      securityDepositRequired: 5500,
      previousBalanceCarryOver: 450,
      depositApplied: 0,
      totalAmountDue:
        5500 + 450 + Math.round(52.0 * globalElectricRate * 100) / 100,
      amountPaid: 5500.0,
      overpaymentToAdvance: 0,
      remainingBalance: 1230.0,
      status: 'partial',
      paymentMethod: 'Cash',
      paidAt: isoNow,
      paymentHistory: [
        {
          id: 'tx-demo-2',
          amount: 5500.0,
          method: 'Cash',
          paidAt: isoNow,
        },
      ],
      updatedAt: isoNow,
    },
  ];

  const inquiries: RoomInquiryBooking[] = [
    {
      id: 'inq-demo-1',
      prospectName: 'Kevin Mendoza',
      phone: '0917-888-9090',
      messengerUsername: 'kevinmendoza',
      roomId: 'room-201',
      roomName: 'Room 201',
      targetMoveInDate: dueWindow5,
      reservationFee: 1500,
      quotedMonthlyRent: 5000,
      requiredDeposit: 5000,
      status: 'booked',
      createdAt: isoNow,
    },
  ];

  const history: TenantHistoryEntry[] = [
    {
      id: 'hist-1',
      roomId: 'room-201',
      roomName: 'Room 201',
      tenantName: 'Mark Villanueva',
      phone: '0919-222-3344',
      moveInDate: '2026-01-05',
      moveOutDate: '2026-10-05',
      reason: 'Completed Lease (Moved Out)',
      finalMeterReading: 890.0,
      depositHeld: 5000,
      unpaidBalanceAtMoveOut: 0,
      lastReceiptNo: '4R-202610-201',
    },
  ];

  return { rooms, bills, inquiries, history };
}
