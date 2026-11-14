import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  assembleA4PdfFromJpegPages,
  buildReceiptDocumentMeta,
  computeA4SliceBoundaries,
} from '../src/utils/pdfReceiptGenerator';
import { buildReceiptShareDescriptor } from '../src/services/notificationService';
import {
  formatPrimaryRoomLabel,
  getSelectedRoomInfoSummary,
  sortAndDeduplicateActiveRooms,
} from '../src/utils/roomSelection';
import { calculateSubMeterDifference } from '../src/utils/billingCalculator';
import { formatKwhReading, roundKwh } from '../src/utils/financialEngine';
import type { Room } from '../src/types/rental';

function makeRoom(overrides: Partial<Room>): Room {
  return {
    id: 'room-1',
    name: 'Room 1',
    monthlyRent: 4500,
    lastMeterReading: 3020.7,
    status: 'occupied',
    tenant: {
      fullName: 'Yuri Santos',
      phone: '0917-555-0101',
      moveInDate: '2026-10-01',
      dueDayOfMonth: 5,
    },
    unpaidBalance: 0,
    securityDeposit: 4500,
    securityDepositPaid: 2500,
    advanceRent: 6000,
    advanceHistory: [],
    updatedAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

test('Scenario F: A4 PDF export emits valid standard A4 portrait dimensions (1 and 2 pages)', () => {
  // Minimal valid JPEG SOI + EOI byte signature for structural PDF verification
  const dummyJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

  // 1-page receipt PDF check
  const singlePagePdf = assembleA4PdfFromJpegPages([
    { jpegBytes: dummyJpeg, widthPx: 1588, heightPx: 1980 },
  ]);
  const singleText = Buffer.from(singlePagePdf).toString('latin1');
  assert.ok(singleText.startsWith('%PDF-1.4\n'), 'PDF must start with PDF 1.4 header');
  assert.ok(singleText.includes(`/MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}]`), 'Page 1 must use exact A4 MediaBox');
  assert.ok(singleText.includes('/Count 1'), '1-page document must declare /Count 1');
  assert.ok(!singleText.includes('3500'), 'Must not stretch height beyond standard A4 portrait');
  assert.ok(singleText.trimEnd().endsWith('%%EOF'), 'PDF must terminate with %%EOF marker');

  // 2-page receipt PDF check
  const twoPagePdf = assembleA4PdfFromJpegPages([
    { jpegBytes: dummyJpeg, widthPx: 1588, heightPx: 2100 },
    { jpegBytes: dummyJpeg, widthPx: 1588, heightPx: 920 },
  ]);
  const twoText = Buffer.from(twoPagePdf).toString('latin1');
  assert.ok(twoText.includes('/Count 2'), '2-page document must declare /Count 2');
  const mediaBoxMatches = twoText.match(/\/MediaBox \[0 0 595\.28 841\.89\]/g) || [];
  assert.equal(mediaBoxMatches.length, 2, 'Both pages must enforce strict A4 portrait MediaBox');
  assert.ok(twoText.includes('xref\n0 11\n'), '2-page xref table must index all 11 objects');
});

test('Scenario F2: Semantic section boundary slicer prevents cutting billing tables/photos mid-block', () => {
  const sections = [
    { top: 0, bottom: 260 },
    { top: 280, bottom: 540 },
    { top: 560, bottom: 1320 },
    { top: 1340, bottom: 2240 }, // crosses hardLimit = 1800 -> should split cleanly at 1340
    { top: 2260, bottom: 2580 },
  ];
  const slices = computeA4SliceBoundaries(2600, 1800, sections);
  assert.equal(slices.length, 2);
  assert.deepEqual(slices[0], { startY: 0, height: 1340 });
  assert.deepEqual(slices[1], { startY: 1340, height: 1260 });
});

test('Scenario G: Sharing & Messenger PDF export works when tenant name or messenger handle is empty', () => {
  // Case 1: No Messenger handle AND no registered tenant name -> must never block
  const anonymousShare = buildReceiptShareDescriptor({
    receiptNo: '4R-202611-001',
    tenantName: '',
    roomName: 'Room 1',
    messengerHandle: '',
  });
  assert.equal(anonymousShare.requiresManualRecipient, false);
  assert.equal(anonymousShare.pdfFilename, '4Rent_Receipt_4R-202611-001_Room_1.pdf');
  assert.equal(anonymousShare.shareTitle, '4Rent Receipt 4R-202611-001 | Room 1');
  assert.equal(anonymousShare.messengerHandle, '');
  assert.equal(anonymousShare.targetMessengerUrl, 'https://www.messenger.com/');

  // Case 2: Named tenant with blank Messenger handle -> uses registered tenant name automatically
  const namedNoHandle = buildReceiptShareDescriptor({
    receiptNo: '4R-202611-002',
    tenantName: 'Mikel Santos',
    roomName: 'Room 3',
    messengerHandle: '',
  });
  assert.equal(namedNoHandle.requiresManualRecipient, false);
  assert.equal(namedNoHandle.pdfFilename, '4Rent_Receipt_4R-202611-002_Room_3_Mikel_Santos.pdf');
  assert.equal(namedNoHandle.shareTitle, '4Rent Receipt 4R-202611-002 | Room 3 | Mikel Santos');

  // Case 3: Messenger URL normalization + buildReceiptDocumentMeta parity
  const meta = buildReceiptDocumentMeta({
    receiptNo: '4R-202611-003',
    roomName: 'Room 2',
    tenantName: 'Vacant',
    billingPeriod: 'Nov 2026',
    tenantMessenger: 'https://m.me/@room2.tenant/',
  });
  assert.equal(meta.hasNamedTenant, false);
  assert.equal(meta.pdfFilename, '4Rent_Receipt_4R-202611-003_Room_2.pdf');
  assert.equal(meta.messengerHandle, 'room2.tenant');
});

test('OCR Room Selection: Primary label shows Room # only, deduplicates collisions, and isolates readings', () => {
  assert.equal(formatPrimaryRoomLabel({ name: 'Room 1' }), 'Room 1');
  assert.equal(formatPrimaryRoomLabel({ name: '3' }), 'Room 3');

  const rooms: Room[] = [
    makeRoom({ id: 'r3', name: 'Room 3', lastMeterReading: 3312.0, tenant: { fullName: 'Mikel', phone: '', moveInDate: '', dueDayOfMonth: 5 } }),
    makeRoom({ id: 'r1-dup-vacant', name: 'Room 1', status: 'vacant', tenant: undefined, lastMeterReading: 5520.0, updatedAt: '2026-10-10T00:00:00.000Z' }),
    makeRoom({ id: 'r1-occupied', name: 'Room 1', status: 'occupied', lastMeterReading: 3020.75, updatedAt: '2026-11-10T00:00:00.000Z' }),
    makeRoom({ id: 'r2', name: 'Room 2', status: 'vacant', tenant: undefined, lastMeterReading: 5225.0 }),
    makeRoom({ id: 'r-arch', name: 'Room 4', isArchived: true }),
  ];

  const sorted = sortAndDeduplicateActiveRooms(rooms);
  assert.deepEqual(
    sorted.map((r) => formatPrimaryRoomLabel(r)),
    ['Room 1', 'Room 2', 'Room 3'],
    'Dropdown must display ONLY clean sorted room numbers without tenant names/kWh or archived/duplicate rooms'
  );
  assert.equal(sorted[0].id, 'r1-occupied', 'Deduplication must prefer active occupied tenant Room 1 over stale collision');

  const room1Info = getSelectedRoomInfoSummary(sorted[0]);
  const room2Info = getSelectedRoomInfoSummary(sorted[1]);
  assert.equal(room1Info?.storedReadingKwh, 3020.75);
  assert.equal(room1Info?.storedReadingFormatted, '3020.75');
  assert.equal(room1Info?.tenantName, 'Yuri Santos');
  assert.equal(room2Info?.storedReadingKwh, 5225);
  assert.equal(room2Info?.advanceCredit, 0);
});

test('OCR Sub-Meter Validation: Preserves decimal kWh and blocks lower current reading without reset/rollover', () => {
  assert.equal(roundKwh(3020.75 - 3000.25), 20.5);
  assert.equal(formatKwhReading(3312), '3312.0');
  assert.equal(formatKwhReading(3020.75), '3020.75');

  const blocked = calculateSubMeterDifference({
    prevReading: 3312.5,
    currReading: 3300.0,
    electricRate: 11.84,
    isRollover: false,
    isReset: false,
  });
  assert.equal(blocked.isValid, false, 'Lower reading without rollover/reset flag must be rejected');

  const validReset = calculateSubMeterDifference({
    prevReading: 99980.5,
    currReading: 12.5,
    electricRate: 12,
    isRollover: true,
    dialDigits: 5,
  });
  assert.equal(validReset.isValid, true);
  assert.equal(validReset.consumptionKwh, 32);
  assert.equal(validReset.electricTotal, 384);
});

test('Em-dash check: Core UI data, PDF generator, notification service, and receipt templates contain zero em dashes', () => {
  const checkedFiles = [
    'src/components/receipt/PrintableA4Receipt.tsx',
    'src/components/receipt/ReceiptModal.tsx',
    'src/components/advance/AdvanceLedgerList.tsx',
    'src/components/modals/AdvanceBalanceModal.tsx',
    'src/components/ocr/SubMeterScannerModal.tsx',
    'src/utils/pdfReceiptGenerator.ts',
    'src/services/notificationService.ts',
    'src/data/guideFlows.ts',
  ];

  for (const relPath of checkedFiles) {
    const content = fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
    assert.equal(
      content.includes('—'),
      false,
      `Found prohibited em dash (—) in ${relPath}`
    );
  }
});
