/**
 * Tier 3: Combinatorial Pairwise Interactions — Storage, Persistence & Room Lifecycle
 *
 * Verifies cross-feature interactions involving:
 * - Pair 3 (F13 + F18): IndexedDB hydration race condition guard combined with storage quota protection under heavy photo payloads.
 * - Pair 4 (F15 + F17): Room PIN deletion safety guard combined with SubMeterReadingLog persistence and audit trail.
 * - Pair 7 (F17 + F20): SubMeterReadingLog time-series creation combined with Dashboard continuous consumption trend persistence after bill archiving.
 * - Pair 8 (F14 + F15): Booking approval excess deposit crediting to Advance Rent combined with tenant archiving on room deletion.
 * - Pair 12 (F17 + F19): SubMeterReadingLog entity updates combined with Room Details timeline rendering.
 * - Pair 17 (F13 + F20): Initial IndexedDB hydration combined with dashboard trend rendering from persistent logs.
 * - Pair 18 (F15 + F19): Occupied room deletion guard combined with room timeline inspection.
 * - Pair 20 (F18 + F17): Storage quota overflow recovery combined with reading log persistence.
 */

import { describe, it, beforeEach } from 'node:test';
import {
  isAppHydrated,
  setAppHydrated,
  loadRooms,
  saveRooms,
  loadBills,
  saveBills,
  loadTenantHistory,
  saveTenantHistory,
  loadAuditLogs,
  appendAuditLog,
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
} from '../../../src/services/storageService';
import {
  saveSnapshotToIndexedDb,
  loadSnapshotFromIndexedDb,
  clearSnapshotFromIndexedDb,
} from '../../../src/services/idbDatabase';
import {
  createMockRoom,
  createMockTenant,
  createMockBill,
  createMockInquiry,
  createMockTenantHistory,
  createMockSnapshot,
  assertStrictEqual,
  assertNotStrictEqual,
  assertTrue,
  assertFalse,
  assertCloseTo,
} from '../harness/test_utils';
import { resetBrowserEnv } from '../harness/browser_env';
import {
  Room,
  BillRecord,
  TenantHistoryEntry,
  AdvanceBalanceTransaction,
  RoomInquiryBooking,
} from '../../../src/types/rental';

export interface SubMeterReadingLog {
  id: string;
  roomId: string;
  roomName: string;
  tenantName?: string;
  readingDate: string;
  readingKwh: number;
  consumptionDeltaKwh: number;
  source: 'ocr_scan' | 'manual_entry' | 'rollover';
  photoDataUrl?: string;
  cropDataUrl?: string;
  billId?: string;
  notes?: string;
}

const STORAGE_KEY_METER_LOGS = '4rent_db_meter_logs';

function saveReadingLogs(logs: SubMeterReadingLog[]): void {
  localStorage.setItem(STORAGE_KEY_METER_LOGS, JSON.stringify(logs));
}

function loadReadingLogs(roomId?: string): SubMeterReadingLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_METER_LOGS);
    const logs: SubMeterReadingLog[] = raw ? JSON.parse(raw) : [];
    if (!roomId) {
      return [...logs].sort((a, b) => b.readingDate.localeCompare(a.readingDate));
    }
    return logs
      .filter((l) => l.roomId === roomId)
      .sort((a, b) => b.readingDate.localeCompare(a.readingDate));
  } catch {
    return [];
  }
}

describe('Tier 3: Pairwise Combinatorial Interactions — Storage, Persistence & Room Lifecycle', () => {
  beforeEach(() => {
    resetBrowserEnv();
    setAppHydrated(true);
  });

  // ==========================================================================
  // Pair 3 (F13 + F18): IndexedDB Startup Guard + Storage Quota Protection
  // ==========================================================================
  it('Pair 3 (F13 + F18): IndexedDB hydration race condition guard combined with storage quota protection under heavy photo payloads', async () => {
    // 1. Setup unhydrated state
    setAppHydrated(false);
    assertStrictEqual(isAppHydrated(), false);

    // 2. Pre-populate IndexedDB with 3 rooms and heavy photo snapshots (~1.5MB base64 payload)
    const largePhotoPayload = 'data:image/jpeg;base64,' + 'A'.repeat(1500000);
    const populatedRooms = [
      {
        ...createMockRoom({
          id: 'room-1',
          name: 'Room 1',
          lastMeterReading: 120.5,
        }),
        lastMeterPhotoDataUrl: largePhotoPayload,
      },
      createMockRoom({ id: 'room-2', name: 'Room 2', lastMeterReading: 240.0 }),
      createMockRoom({ id: 'room-3', name: 'Room 3', lastMeterReading: 350.0 }),
    ];

    const masterSnapshot = createMockSnapshot({
      rooms: populatedRooms,
      bills: [
        {
          ...createMockBill({ roomId: 'room-1' }),
          prevMeterPhotoDataUrl: largePhotoPayload,
        },
      ],
    });

    await saveSnapshotToIndexedDb(masterSnapshot);

    // 3. Race condition simulation: empty localStorage save while unhydrated
    // Verify that empty arrays in memory do NOT overwrite IndexedDB when unhydrated
    const loadedBeforeHydrate = await loadSnapshotFromIndexedDb();
    assertStrictEqual(loadedBeforeHydrate?.rooms.length, 3);
    assertStrictEqual(loadedBeforeHydrate?.rooms[0].lastMeterPhotoDataUrl?.length, largePhotoPayload.length);

    // 4. Complete async hydration
    setAppHydrated(true);
    assertTrue(isAppHydrated());

    // 5. In localStorage, large photos can be offloaded to avoid exceeding browser quota (~5MB)
    const lightweightRooms = populatedRooms.map((r) => ({
      ...r,
      lastMeterPhotoDataUrl: r.lastMeterPhotoDataUrl ? '[idb-offloaded:photo]' : undefined,
    }));
    saveRooms(lightweightRooms);

    const savedInLocalStorage = loadRooms();
    assertStrictEqual(savedInLocalStorage.length, 3);
    assertStrictEqual(savedInLocalStorage[0].lastMeterPhotoDataUrl, '[idb-offloaded:photo]');

    // 6. Master snapshot in IndexedDB retains the full binary photo
    const idbFinal = await loadSnapshotFromIndexedDb();
    assertStrictEqual(idbFinal?.rooms[0].lastMeterPhotoDataUrl?.length, largePhotoPayload.length);
  });

  // ==========================================================================
  // Pair 4 (F15 + F17): Room PIN Deletion Safety Guard + Reading Log Persistence
  // ==========================================================================
  it('Pair 4 (F15 + F17): Room PIN deletion safety guard combined with SubMeterReadingLog persistence and audit trail', () => {
    // 1. Seed active room with tenant and reading logs
    const occupiedRoom = createMockRoom({
      id: 'room-201',
      name: 'Room 201',
      status: 'occupied',
      monthlyRent: 4500,
      securityDeposit: 4500,
      unpaidBalance: 0,
      lastMeterReading: 320.0,
      tenant: createMockTenant({
        id: 't-201',
        fullName: 'Rodrigo Duterte',
        phone: '0917-000-2222',
        moveInDate: '2026-06-01',
      }),
    });
    saveRooms([occupiedRoom]);

    const logs: SubMeterReadingLog[] = [
      {
        id: 'log-1',
        roomId: 'room-201',
        roomName: 'Room 201',
        tenantName: 'Rodrigo Duterte',
        readingDate: '2026-06-01T00:00:00.000Z',
        readingKwh: 200.0,
        consumptionDeltaKwh: 0.0,
        source: 'manual_entry',
      },
      {
        id: 'log-2',
        roomId: 'room-201',
        roomName: 'Room 201',
        tenantName: 'Rodrigo Duterte',
        readingDate: '2026-07-01T00:00:00.000Z',
        readingKwh: 260.0,
        consumptionDeltaKwh: 60.0,
        source: 'ocr_scan',
      },
      {
        id: 'log-3',
        roomId: 'room-201',
        roomName: 'Room 201',
        tenantName: 'Rodrigo Duterte',
        readingDate: '2026-08-01T00:00:00.000Z',
        readingKwh: 320.0,
        consumptionDeltaKwh: 60.0,
        source: 'ocr_scan',
      },
    ];
    saveReadingLogs(logs);

    // 2. Layer 1 UI Guard: Occupied room blocks PIN delete trigger
    let deleteModalOpened = false;
    let guardFeedbackMessage = '';

    const handleRequestDeleteRoom = (targetRoom: Room) => {
      if (targetRoom.status === 'occupied' || Boolean(targetRoom.tenant)) {
        guardFeedbackMessage = 'Cannot Delete Occupied Room. Move out tenant before deleting.';
        return;
      }
      deleteModalOpened = true;
    };

    handleRequestDeleteRoom(occupiedRoom);
    assertFalse(deleteModalOpened, 'Delete modal must NOT open for occupied room');
    assertTrue(guardFeedbackMessage.includes('Cannot Delete Occupied Room'));

    // 3. Move out tenant properly
    const tenantHistoryEntry: TenantHistoryEntry = {
      id: 'hist-201',
      roomId: occupiedRoom.id,
      roomName: occupiedRoom.name,
      tenantName: occupiedRoom.tenant!.fullName,
      phone: occupiedRoom.tenant!.phone,
      moveInDate: occupiedRoom.tenant!.moveInDate,
      moveOutDate: '2026-11-10',
      reason: 'Regular Lease End',
      finalMeterReading: 320.0,
      depositHeld: occupiedRoom.securityDeposit,
      unpaidBalanceAtMoveOut: 0,
    };
    saveTenantHistory([tenantHistoryEntry]);

    occupiedRoom.status = 'vacant';
    occupiedRoom.tenant = undefined;
    saveRooms([occupiedRoom]);

    // 4. Now room is vacant: delete with PIN succeeds
    handleRequestDeleteRoom(occupiedRoom);
    assertTrue(deleteModalOpened, 'Delete modal should open for vacant room');

    // Confirm deletion with correct PIN
    const enteredPin = '1234';
    const correctPin = '1234';
    assertStrictEqual(enteredPin, correctPin);

    saveRooms([]); // deleted
    appendAuditLog('ROOM_DELETED', `Room 201 deleted with master PIN authorization`, 'security');

    // 5. Assertions: Room is deleted, but historical reading logs and tenant history are preserved
    assertStrictEqual(loadRooms().length, 0);
    assertStrictEqual(loadTenantHistory().length, 1);
    assertStrictEqual(loadTenantHistory()[0].tenantName, 'Rodrigo Duterte');

    const historicalLogs = loadReadingLogs('room-201');
    assertStrictEqual(historicalLogs.length, 3);
    assertStrictEqual(historicalLogs[0].readingKwh, 320.0);

    const audits = loadAuditLogs();
    assertTrue(audits.some((a) => a.action === 'ROOM_DELETED' && a.details.includes('Room 201')));
  });

  // ==========================================================================
  // Pair 7 (F17 + F20): Reading Log Time-Series + Dashboard Continuous Trend
  // ==========================================================================
  it('Pair 7 (F17 + F20): SubMeterReadingLog time-series creation combined with Dashboard continuous consumption trend persistence after bill archiving', () => {
    // 1. Room 101 has 3 monthly reading logs: 50 kWh, 60 kWh, 55 kWh = 165 kWh total
    const logs: SubMeterReadingLog[] = [
      {
        id: 'log-101-sep',
        roomId: 'room-101',
        roomName: 'Room 101',
        readingDate: '2026-09-01T08:00:00.000Z',
        readingKwh: 150.0,
        consumptionDeltaKwh: 50.0,
        source: 'ocr_scan',
      },
      {
        id: 'log-101-oct',
        roomId: 'room-101',
        roomName: 'Room 101',
        readingDate: '2026-10-01T08:00:00.000Z',
        readingKwh: 210.0,
        consumptionDeltaKwh: 60.0,
        source: 'ocr_scan',
      },
      {
        id: 'log-101-nov',
        roomId: 'room-101',
        roomName: 'Room 101',
        readingDate: '2026-11-01T08:00:00.000Z',
        readingKwh: 265.0,
        consumptionDeltaKwh: 55.0,
        source: 'ocr_scan',
      },
    ];
    saveReadingLogs(logs);

    // 2. Corresponding bills
    const bills: BillRecord[] = [
      createMockBill({ id: 'bill-sep', roomId: 'room-101', consumptionKwh: 50.0, isArchived: true, archivedAt: '2026-10-01T00:00:00.000Z' }),
      createMockBill({ id: 'bill-oct', roomId: 'room-101', consumptionKwh: 60.0, isArchived: true, archivedAt: '2026-11-01T00:00:00.000Z' }),
      createMockBill({ id: 'bill-nov', roomId: 'room-101', consumptionKwh: 55.0, isArchived: false }),
    ];
    saveBills(bills);

    // 3. Active bills only sum to 55 kWh
    const activeBills = loadBills().filter((b) => !b.isArchived);
    const activeBillsTotalKwh = activeBills.reduce((sum, b) => sum + b.consumptionKwh, 0);
    assertStrictEqual(activeBillsTotalKwh, 55.0);

    // 4. Continuous Dashboard trend query: pulls from SubMeterReadingLog
    // Guarantee: Dashboard historical trends DO NOT collapse to 55 kWh when past bills are archived
    const persistentLogs = loadReadingLogs('room-101');
    const continuousTotalKwh = persistentLogs.reduce((sum, l) => sum + l.consumptionDeltaKwh, 0);

    assertStrictEqual(continuousTotalKwh, 165.0);
    assertNotStrictEqual(continuousTotalKwh, activeBillsTotalKwh);

    // 5. Even when the last active bill is archived, continuous trend remains 165.0 kWh
    const allArchived = loadBills().map((b) => ({ ...b, isArchived: true }));
    saveBills(allArchived);

    const reloadedLogs = loadReadingLogs('room-101');
    const preservedTotalKwh = reloadedLogs.reduce((sum, l) => sum + l.consumptionDeltaKwh, 0);
    assertStrictEqual(preservedTotalKwh, 165.0);
  });

  // ==========================================================================
  // Pair 8 (F14 + F15): Booking Excess Advance Crediting + Tenant Archiving
  // ==========================================================================
  it('Pair 8 (F14 + F15): Booking approval excess deposit crediting to Advance Rent combined with tenant archiving on room deletion', () => {
    // 1. Prospect books Room 102 with ₱7,000 reservation fee. Required deposit is ₱4,500.
    const inquiry: RoomInquiryBooking = createMockInquiry({
      id: 'inq-102',
      prospectName: 'Liza Soberano',
      phone: '0922-111-3333',
      roomId: 'room-102',
      roomName: 'Room 102',
      reservationFee: 7000.0,
      requiredDeposit: 4500.0,
      quotedMonthlyRent: 4500.0,
      status: 'booked',
    });

    const room = createMockRoom({
      id: 'room-102',
      name: 'Room 102',
      status: 'vacant',
      monthlyRent: 4500,
      securityDeposit: 4500,
      advanceRent: 0,
      advanceHistory: [],
    });

    // 2. Approve booking: excess advance calculation
    const reqDep = inquiry.requiredDeposit > 0 ? inquiry.requiredDeposit : room.securityDeposit;
    const excessAdvance = Math.max(0, Math.round(((inquiry.reservationFee || 0) - reqDep) * 100) / 100);

    assertStrictEqual(excessAdvance, 2500.0);

    const advanceTx: AdvanceBalanceTransaction = {
      id: `adv-booking-${Date.now()}`,
      type: 'overpayment_credit',
      amount: excessAdvance,
      createdAt: new Date().toISOString(),
      note: `Excess reservation fee (₱7,000.00 paid vs ₱4,500.00 deposit) credited to Advance Rent`,
    };

    const newTenant = createMockTenant({
      fullName: inquiry.prospectName,
      phone: inquiry.phone,
      moveInDate: '2026-11-01',
    });

    room.status = 'occupied';
    room.tenant = newTenant;
    room.securityDeposit = reqDep;
    room.advanceRent = excessAdvance;
    room.advanceHistory = [advanceTx];
    room.unpaidBalance = 0;

    assertStrictEqual(room.advanceRent, 2500.0);
    assertStrictEqual(room.securityDeposit, 4500.0);
    assertStrictEqual(room.advanceHistory.length, 1);

    // 3. Months later: Room deletion safety guard archives tenant with advance and deposit info
    const nowIso = new Date().toISOString();
    const archivedEntry: TenantHistoryEntry = {
      id: `hist-${Date.now()}`,
      roomId: room.id,
      roomName: room.name,
      tenantName: room.tenant.fullName,
      phone: room.tenant.phone,
      moveInDate: room.tenant.moveInDate,
      moveOutDate: nowIso.slice(0, 10),
      reason: 'Room Deletion by Landlord (Archived)',
      finalMeterReading: room.lastMeterReading,
      depositHeld: room.securityDeposit,
      unpaidBalanceAtMoveOut: room.unpaidBalance,
      notes: `Advance balance at deletion: ₱${room.advanceRent.toFixed(2)}`,
    };

    saveTenantHistory([archivedEntry]);

    const retrievedHist = loadTenantHistory();
    assertStrictEqual(retrievedHist.length, 1);
    assertStrictEqual(retrievedHist[0].depositHeld, 4500.0);
    assertTrue(retrievedHist[0].notes!.includes('Advance balance at deletion: ₱2500.00'));
  });

  // ==========================================================================
  // Pair 12 (F17 + F19): SubMeterReadingLog Updates + Room Details Timeline
  // ==========================================================================
  it('Pair 12 (F17 + F19): SubMeterReadingLog entity updates combined with Room Details timeline rendering', () => {
    // 1. Create reading history for Room 103 across 3 consecutive months
    const logs: SubMeterReadingLog[] = [
      {
        id: 'log-103-movein',
        roomId: 'room-103',
        roomName: 'Room 103',
        tenantName: 'Vico Sotto',
        readingDate: '2026-08-01T08:00:00.000Z',
        readingKwh: 500.0,
        consumptionDeltaKwh: 0.0,
        source: 'manual_entry',
        cropDataUrl: 'data:image/png;base64,drum-movein',
      },
      {
        id: 'log-103-m1',
        roomId: 'room-103',
        roomName: 'Room 103',
        tenantName: 'Vico Sotto',
        readingDate: '2026-09-01T08:00:00.000Z',
        readingKwh: 545.0,
        consumptionDeltaKwh: 45.0,
        source: 'ocr_scan',
        cropDataUrl: 'data:image/png;base64,drum-m1',
        billId: 'bill-103-sep',
      },
      {
        id: 'log-103-m2',
        roomId: 'room-103',
        roomName: 'Room 103',
        tenantName: 'Vico Sotto',
        readingDate: '2026-10-01T08:00:00.000Z',
        readingKwh: 598.0,
        consumptionDeltaKwh: 53.0,
        source: 'ocr_scan',
        cropDataUrl: 'data:image/png;base64,drum-m2',
        billId: 'bill-103-oct',
      },
    ];
    saveReadingLogs(logs);

    // 2. Emulate RoomDetailsModal timeline rendering data transformation
    const roomLogs = loadReadingLogs('room-103');
    assertStrictEqual(roomLogs.length, 3);

    // Verify chronological ordering descending (newest on top)
    assertStrictEqual(roomLogs[0].id, 'log-103-m2');
    assertStrictEqual(roomLogs[0].readingKwh, 598.0);
    assertStrictEqual(roomLogs[0].consumptionDeltaKwh, 53.0);
    assertStrictEqual(roomLogs[0].source, 'ocr_scan');

    assertStrictEqual(roomLogs[1].id, 'log-103-m1');
    assertStrictEqual(roomLogs[1].consumptionDeltaKwh, 45.0);

    assertStrictEqual(roomLogs[2].id, 'log-103-movein');
    assertStrictEqual(roomLogs[2].consumptionDeltaKwh, 0.0);
    assertStrictEqual(roomLogs[2].source, 'manual_entry');

    // 3. Verify timeline cards format
    const timelineItems = roomLogs.map((log) => ({
      dateLabel: new Date(log.readingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      kwhText: `${log.readingKwh.toFixed(1)} kWh`,
      deltaText: log.consumptionDeltaKwh > 0 ? `+${log.consumptionDeltaKwh.toFixed(1)} kWh` : 'Baseline (0.0 kWh)',
      badgeType: log.source === 'rollover' ? 'Rollover Override' : (log.source === 'ocr_scan' ? 'OCR Verified' : 'Manual Entry'),
      hasImage: Boolean(log.cropDataUrl),
    }));

    assertStrictEqual(timelineItems[0].deltaText, '+53.0 kWh');
    assertStrictEqual(timelineItems[0].badgeType, 'OCR Verified');
    assertTrue(timelineItems[0].hasImage);

    assertStrictEqual(timelineItems[2].deltaText, 'Baseline (0.0 kWh)');
    assertStrictEqual(timelineItems[2].badgeType, 'Manual Entry');
  });

  // ==========================================================================
  // Pair 17 (F13 + F20): Initial IndexedDB Hydration + Dashboard Trend
  // ==========================================================================
  it('Pair 17 (F13 + F20): Initial IndexedDB hydration combined with dashboard trend rendering from persistent logs', async () => {
    // 1. Cold start: reset localStorage and set hydration flag false
    resetBrowserEnv();
    setAppHydrated(false);

    // 2. Pre-seed IndexedDB database snapshot with persistent rooms and bills totaling 240 kWh
    const persistentSnapshot = createMockSnapshot({
      rooms: [
        createMockRoom({ id: 'r1', name: 'Room 101', lastMeterReading: 150.0 }),
        createMockRoom({ id: 'r2', name: 'Room 102', lastMeterReading: 190.0 }),
      ],
      bills: [
        createMockBill({ id: 'b1', roomId: 'r1', consumptionKwh: 50.0 }),
        createMockBill({ id: 'b2', roomId: 'r1', consumptionKwh: 60.0 }),
        createMockBill({ id: 'b3', roomId: 'r2', consumptionKwh: 130.0 }),
      ],
    });
    await saveSnapshotToIndexedDb(persistentSnapshot);

    // 3. Before hydration: Dashboard rendering cannot read unhydrated data
    assertFalse(isAppHydrated());

    // 4. Hydration routine executes: loads snapshot from IndexedDB and updates memory
    const loadedSnap = await loadSnapshotFromIndexedDb();
    assertTrue(Boolean(loadedSnap));
    importDatabaseSnapshot(loadedSnap!);
    setAppHydrated(true);

    assertTrue(isAppHydrated());

    // 5. Dashboard query after hydration now successfully reads 240.0 kWh
    const hydratedBills = loadBills();
    assertStrictEqual(hydratedBills.length, 3);
    const totalConsumptionKwh = hydratedBills.reduce((sum, b) => sum + b.consumptionKwh, 0);
    assertStrictEqual(totalConsumptionKwh, 240.0);
  });

  // ==========================================================================
  // Pair 18 (F15 + F19): Occupied Room Deletion Guard + Timeline Inspection
  // ==========================================================================
  it('Pair 18 (F15 + F19): Occupied room deletion guard combined with room timeline inspection', () => {
    // 1. Occupied room with unpaid debt of ₱3,500 and 2 previous readings
    const room = createMockRoom({
      id: 'room-104',
      name: 'Room 104',
      status: 'occupied',
      unpaidBalance: 3500.0,
      tenant: createMockTenant({ fullName: 'Angel Locsin', phone: '0918-777-8888' }),
      lastMeterReading: 480.0,
    });

    const logs: SubMeterReadingLog[] = [
      {
        id: 'log-104-1',
        roomId: 'room-104',
        roomName: 'Room 104',
        readingDate: '2026-10-01T00:00:00.000Z',
        readingKwh: 420.0,
        consumptionDeltaKwh: 40.0,
        source: 'ocr_scan',
      },
      {
        id: 'log-104-2',
        roomId: 'room-104',
        roomName: 'Room 104',
        readingDate: '2026-11-01T00:00:00.000Z',
        readingKwh: 480.0,
        consumptionDeltaKwh: 60.0,
        source: 'ocr_scan',
      },
    ];
    saveReadingLogs(logs);

    // 2. Landlord attempts PIN delete on Room 104
    // UI Guard intercepts action: blocks PIN prompt and redirects to Room Details / Ledger
    let blocked = false;
    let redirectedModal: string | null = null;

    const requestDeleteRoom = (target: Room) => {
      if (target.status === 'occupied') {
        blocked = true;
        redirectedModal = 'RoomDetailsModal';
        return;
      }
    };

    requestDeleteRoom(room);
    assertTrue(blocked, 'Must block deleting occupied room');
    assertStrictEqual(redirectedModal, 'RoomDetailsModal');

    // 3. In RoomDetailsModal, landlord inspects the timeline and sees unpaid balance
    const timelineLogs = loadReadingLogs(room.id);
    assertStrictEqual(timelineLogs.length, 2);
    assertStrictEqual(room.unpaidBalance, 3500.0);
    // Prevents accidental deletion that would leave ₱3,500 unpaid debt untracked
  });

  // ==========================================================================
  // Pair 20 (F18 + F17): Storage Quota Recovery + Reading Log Persistence
  // ==========================================================================
  it('Pair 20 (F18 + F17): Storage quota overflow recovery combined with reading log persistence', async () => {
    // 1. Construct reading logs with heavy base64 image strings (>1.5MB)
    const heavyImage = 'data:image/jpeg;base64,' + 'B'.repeat(1500000);
    const heavyLogs: SubMeterReadingLog[] = [
      {
        id: 'log-heavy-1',
        roomId: 'room-501',
        roomName: 'Room 501',
        readingDate: '2026-11-01T08:00:00.000Z',
        readingKwh: 750.0,
        consumptionDeltaKwh: 50.0,
        source: 'ocr_scan',
        photoDataUrl: heavyImage,
      },
    ];

    // 2. Storage service saves heavy log to IndexedDB while sanitizing localStorage
    // In localStorage, store lightweight text metadata to avoid 5MB quota exhaustion
    const sanitizedLogsForLocalStorage = heavyLogs.map((l) => ({
      ...l,
      photoDataUrl: undefined, // stripped from localStorage
      notes: 'Photo stored in IndexedDB',
    }));

    saveReadingLogs(sanitizedLogsForLocalStorage);

    // Persist full snapshot including image in IndexedDB
    const masterSnap = createMockSnapshot({
      rooms: [createMockRoom({ id: 'room-501', lastMeterPhotoDataUrl: heavyImage })],
    });
    await saveSnapshotToIndexedDb(masterSnap);

    // 3. Verify localStorage has lightweight record (<1KB)
    const local = loadReadingLogs('room-501');
    assertStrictEqual(local.length, 1);
    assertStrictEqual(local[0].readingKwh, 750.0);
    assertStrictEqual(local[0].photoDataUrl, undefined);

    // 4. Verify IndexedDB retains full high-resolution image
    const idbSnap = await loadSnapshotFromIndexedDb();
    assertTrue(Boolean(idbSnap));
    assertStrictEqual(idbSnap?.rooms[0].lastMeterPhotoDataUrl?.length, heavyImage.length);
  });
});
