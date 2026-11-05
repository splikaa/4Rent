import {
  AppDatabaseSnapshot,
  AppSettings,
  BillRecord,
  Room,
  TenantHistoryEntry,
} from '../types/rental';

const STORAGE_KEYS = {
  ROOMS: '4rent_rooms_v1',
  BILLS: '4rent_bills_v1',
  HISTORY: '4rent_tenant_history_v1',
  SETTINGS: '4rent_settings_v1',
};

export const DEFAULT_SETTINGS: AppSettings = {
  apartmentName: '4Rent Apartments',
  landlordName: 'Property Administrator',
  landlordPhone: '0917-000-0000',
  landlordMessenger: '',
  paymentInstructions:
    'GCash / Maya: 0917-000-0000 (4Rent Apartments)\nPlease send screenshot of payment receipt via Messenger.',
  defaultElectricRate: 15.0,
  defaultMonthlyRent: 4500.0,
  remindersPromptShown: false,
  remindersEnabled: false,
  receiptPrintFormat: 'standard',
  security: {
    isSetupComplete: false,
    lockEnabled: false,
    authMethod: 'none',
  },
  cloudSync: {
    enabled: false,
    supabaseUrl: '',
    supabaseAnonKey: '',
    propertyCode: '4RENT-MAIN',
  },
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      security: {
        ...DEFAULT_SETTINGS.security,
        ...(parsed.security || {}),
      },
      cloudSync: {
        ...DEFAULT_SETTINGS.cloudSync,
        ...(parsed.cloudSync || {}),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

export function loadRooms(): Room[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROOMS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRooms(rooms: Room[]): void {
  localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(rooms));
}

export function loadBills(): BillRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BILLS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBills(bills: BillRecord[]): void {
  localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(bills));
}

export function loadTenantHistory(): TenantHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTenantHistory(history: TenantHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
}

export function exportDatabaseSnapshot(): AppDatabaseSnapshot {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rooms: loadRooms(),
    bills: loadBills(),
    tenantHistory: loadTenantHistory(),
    settings: loadSettings(),
  };
}

export function importDatabaseSnapshot(snapshot: AppDatabaseSnapshot): void {
  if (Array.isArray(snapshot.rooms)) saveRooms(snapshot.rooms);
  if (Array.isArray(snapshot.bills)) saveBills(snapshot.bills);
  if (Array.isArray(snapshot.tenantHistory))
    saveTenantHistory(snapshot.tenantHistory);
  if (snapshot.settings) saveSettings(snapshot.settings);
}

/**
 * Generates sample apartment rooms and sub-meter bills so the user can immediately test
 * analytics, receipts, Messenger sharing, and OCR reading comparison.
 */
export function createSampleDemoData(): {
  rooms: Room[];
  bills: BillRecord[];
  history: TenantHistoryEntry[];
} {
  const now = new Date();
  const isoNow = now.toISOString();
  const dueSoon = new Date(now.getTime() + 5 * 86400000).toISOString();

  const rooms: Room[] = [
    {
      id: 'room-101',
      name: 'Room 101',
      floorOrUnit: '1st Floor • Studio w/ Sub-Meter',
      monthlyRent: 4500,
      electricRatePerKwh: 15.0,
      lastMeterReading: 1485.6,
      lastReadingDate: isoNow,
      status: 'occupied',
      unpaidBalance: 0,
      securityDeposit: 4500,
      advanceRent: 4500,
      updatedAt: isoNow,
      tenant: {
        id: 'ten-101',
        fullName: 'Juan Dela Cruz',
        phone: '0917-555-0101',
        messengerUsername: 'juandelacruz',
        moveInDate: '2026-06-01',
        dueDayOfMonth: 15,
        emergencyContact: 'Maria Dela Cruz (0918-555-0199)',
        notes: 'Pays via GCash every 15th',
      },
    },
    {
      id: 'room-102',
      name: 'Room 102',
      floorOrUnit: '1st Floor • 1-Bedroom Unit',
      monthlyRent: 5500,
      electricRatePerKwh: 15.0,
      lastMeterReading: 2340.2,
      lastReadingDate: isoNow,
      status: 'occupied',
      unpaidBalance: 1230,
      securityDeposit: 5500,
      advanceRent: 0,
      updatedAt: isoNow,
      tenant: {
        id: 'ten-102',
        fullName: 'Angela Santos',
        phone: '0918-777-0202',
        messengerUsername: 'angelasantos',
        moveInDate: '2026-08-10',
        dueDayOfMonth: 10,
        notes: 'Partial payment last cycle, balance carried over',
      },
    },
    {
      id: 'room-201',
      name: 'Room 201',
      floorOrUnit: '2nd Floor • Corner Unit',
      monthlyRent: 5000,
      electricRatePerKwh: 15.0,
      lastMeterReading: 890.0,
      status: 'vacant',
      unpaidBalance: 0,
      securityDeposit: 0,
      advanceRent: 0,
      updatedAt: isoNow,
    },
  ];

  const bills: BillRecord[] = [
    {
      id: 'bill-demo-1',
      receiptNo: '4R-202611-001',
      roomId: 'room-101',
      roomName: 'Room 101',
      tenantName: 'Juan Dela Cruz',
      tenantPhone: '0917-555-0101',
      tenantMessenger: 'juandelacruz',
      billingPeriod: 'Nov 2026',
      createdAt: isoNow,
      dueDate: dueSoon,
      prevReading: 1420.0,
      currReading: 1485.6,
      consumptionKwh: 65.6,
      electricRate: 15.0,
      electricTotal: 984.0,
      baseRent: 4500,
      previousBalanceCarryOver: 0,
      depositApplied: 0,
      totalAmountDue: 5484.0,
      amountPaid: 5484.0,
      remainingBalance: 0,
      status: 'paid',
      paymentMethod: 'GCash',
      paidAt: isoNow,
      paymentHistory: [
        {
          id: 'tx-demo-1',
          amount: 5484.0,
          method: 'GCash',
          paidAt: isoNow,
          referenceNo: 'GC-99481023',
          note: 'Full payment for Nov 2026',
        },
      ],
      updatedAt: isoNow,
    },
    {
      id: 'bill-demo-2',
      receiptNo: '4R-202611-002',
      roomId: 'room-102',
      roomName: 'Room 102',
      tenantName: 'Angela Santos',
      tenantPhone: '0918-777-0202',
      tenantMessenger: 'angelasantos',
      billingPeriod: 'Nov 2026',
      createdAt: isoNow,
      dueDate: dueSoon,
      prevReading: 2288.2,
      currReading: 2340.2,
      consumptionKwh: 52.0,
      electricRate: 15.0,
      electricTotal: 780.0,
      baseRent: 5500,
      previousBalanceCarryOver: 450,
      depositApplied: 0,
      totalAmountDue: 6730.0,
      amountPaid: 5500.0,
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
          note: 'Paid base rent first; electric + carry-over pending',
        },
      ],
      updatedAt: isoNow,
    },
  ];

  const history: TenantHistoryEntry[] = [
    {
      id: 'hist-1',
      roomId: 'room-201',
      roomName: 'Room 201',
      tenantName: 'Mark Villanueva',
      phone: '0919-222-3344',
      moveInDate: '2026-01-15',
      moveOutDate: '2026-10-15',
      finalMeterReading: 890.0,
      notes: 'Completed 9-month lease, deposit refunded in full.',
    },
  ];

  return { rooms, bills, history };
}

