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
import {
  formatKwhReading,
  resolveReceiptLiveDepositProps,
  roundKwh,
} from '../src/utils/financialEngine';
import type { Room } from '../src/types/rental';

function makeRoom(overrides: Partial<Room>): Room {
  return {
    id: 'room-1',
    name: 'Room 1',
    monthlyRent: 4500,
    lastMeterReading: 3020.7,
    status: 'occupied',
    tenant: {
      id: 'ten-1',
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

  // Case 4: Placeholder tenant labels and Facebook Messenger URL parity
  const shareFromUrl = buildReceiptShareDescriptor({
    receiptNo: '4R-202611-004',
    roomName: 'Unit 4A',
    tenantName: 'Current Room Tenant',
    messengerHandle: 'https://www.messenger.com/t/unit4.tenant/',
  });
  assert.equal(shareFromUrl.pdfFilename, '4Rent_Receipt_4R-202611-004_Unit_4A.pdf');
  assert.equal(shareFromUrl.messengerHandle, 'unit4.tenant');
  assert.equal(shareFromUrl.targetMessengerUrl, 'https://m.me/unit4.tenant');
});

test('OCR Room Selection: Primary label shows Room # only, deduplicates collisions, and isolates readings', () => {
  assert.equal(formatPrimaryRoomLabel({ name: 'Room 1' }), 'Room 1');
  assert.equal(formatPrimaryRoomLabel({ name: '3' }), 'Room 3');

  const rooms: Room[] = [
    makeRoom({ id: 'r3', name: 'Room 3', lastMeterReading: 3312.0, tenant: { id: 'ten-3', fullName: 'Mikel', phone: '', moveInDate: '', dueDayOfMonth: 5 } }),
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

test('PrintableA4Receipt places Rate in Billing Period, includes cropped meter photos, and explains charges & deductions clearly', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { PrintableA4Receipt } = await import('../src/components/receipt/PrintableA4Receipt');

  const bill: import('../src/types/rental').BillRecord = {
    id: 'bill-test-unified',
    receiptNo: '4R-202611-1',
    roomId: 'room-1',
    roomName: 'Room 1',
    tenantName: 'Yuri',
    tenantPhone: '09261234541',
    billingPeriod: 'Nov 2026',
    createdAt: '2026-11-14T08:00:00.000Z',
    dueDate: '2026-12-04T00:00:00.000Z',
    baseRent: 4500,
    prevReading: 0,
    currReading: 3020.7,
    consumptionKwh: 3020.7,
    electricRate: 11.84,
    electricTotal: 35765.09,
    previousBalanceCarryOver: 0,
    grossCharges: 40265.09,
    securityDepositRequired: 2500,
    securityDepositApplied: 2500,
    securityDepositRemainingAfterBill: 0,
    advanceApplied: 25000,
    advanceBalanceBefore: 25000,
    advanceBalanceAfter: 0,
    depositApplied: 27500,
    totalAmountDue: 12765.09,
    amountPaid: 12765.09,
    overpaymentToAdvance: 0,
    remainingBalance: 0,
    status: 'paid',
    paymentMethod: 'GCash',
    paymentHistory: [],
    paidAt: '2026-11-14T09:00:00.000Z',
    updatedAt: '2026-11-14T09:00:00.000Z',
    isLocked: true,
  };

  const settings: import('../src/types/rental').AppSettings = {
    apartmentName: '4Rent Residences',
    landlordName: 'Authorized Landlord',
    landlordPhone: '09170000000',
    landlordMessenger: '',
    paymentInstructions: 'GCash or Cash',
    defaultElectricRate: 11.84,
    monthlyElectricRates: { '2026-11': 11.84 },
    defaultMonthlyRent: 4500,
    defaultSecurityDeposit: 2500,
    advanceCapMode: 'unlimited',
    remindersPromptShown: false,
    remindersEnabled: false,
    receiptPrintFormat: 'standard',
    maskReceiptContacts: true,
    security: {
      isSetupComplete: true,
      lockEnabled: false,
      authMethod: 'none',
      pinCode: '1234',
    },
    cloudSync: {
      enabled: false,
      propertyCode: '4R-TEST99',
    },
  };

  const html = renderToStaticMarkup(
    React.createElement(PrintableA4Receipt as any, {
      bill,
      settings,
      maskContactsOnReceipt: true,
      prevMeterProofImg: 'data:image/jpeg;base64,PREV_FULL',
      prevMeterCropImg: 'data:image/jpeg;base64,PREV_CROP',
      currMeterProofImg: 'data:image/jpeg;base64,CURR_FULL',
      currMeterCropImg: 'data:image/jpeg;base64,CURR_CROP',
      remainingAdvanceCredit: 0,
    })
  );

  assert.ok(!html.includes('Due Date &amp; Rate') && !html.includes('Due Date & Rate'));
  const billingIdx = html.indexOf('Billing Period');
  const dueIdx = html.indexOf('Due Date');
  const meterSectionIdx = html.toLowerCase().indexOf('sub-meter reading');
  assert.ok(billingIdx >= 0 && dueIdx > billingIdx && meterSectionIdx > dueIdx);

  const billingCellHtml = html.slice(billingIdx, dueIdx);
  const dueCellHtml = html.slice(dueIdx, meterSectionIdx);
  assert.ok(billingCellHtml.includes('Nov 2026'));
  assert.ok(billingCellHtml.includes('11.84/kWh'));
  assert.ok(!dueCellHtml.includes('/kWh') && !dueCellHtml.includes('Rate:'));

  assert.ok(html.includes('data:image/jpeg;base64,PREV_FULL'));
  assert.ok(html.includes('data:image/jpeg;base64,PREV_CROP'));
  assert.ok(html.includes('data:image/jpeg;base64,CURR_FULL'));
  assert.ok(html.includes('data:image/jpeg;base64,CURR_CROP'));

  assert.ok(html.includes('Total Deductions Applied'));
  assert.ok(html.includes('Net Total Amount Due'));
  assert.ok(!html.includes('\u2014'));

  // Historical locked/archived receipt must preserve its own deposit snapshot even if the room now has a new tenant with a different deposit
  const newTenantRoom = makeRoom({
    id: 'room-1',
    securityDeposit: 6000,
    securityDepositPaid: 6000,
    tenant: {
      id: 'ten-next',
      fullName: 'Different Tenant',
      phone: '0917-999-9999',
      moveInDate: '2026-12-01',
      dueDayOfMonth: 5,
    },
  });
  const liveDepositProps = resolveReceiptLiveDepositProps(bill, newTenantRoom);
  const historicalHtml = renderToStaticMarkup(
    React.createElement(PrintableA4Receipt as any, {
      bill,
      settings,
      maskContactsOnReceipt: true,
      prevMeterProofImg: 'data:image/jpeg;base64,PREV_FULL',
      prevMeterCropImg: 'data:image/jpeg;base64,PREV_CROP',
      currMeterProofImg: 'data:image/jpeg;base64,CURR_FULL',
      currMeterCropImg: 'data:image/jpeg;base64,CURR_CROP',
      remainingAdvanceCredit: 0,
      ...liveDepositProps,
    })
  );
  assert.ok(
    historicalHtml.includes('2,500.00') && !historicalHtml.includes('6,000.00'),
    'Locked historical receipt must never display a later tenant live deposit amount'
  );
});

test('Body scroll lock is reference-counted across stacked modals and restores original styles cleanly', async () => {
  const {
    acquireBodyScrollLock,
    releaseBodyScrollLock,
    getActiveScrollLockCount,
    resetBodyScrollLockForTests,
  } = await import('../src/utils/bodyScrollLock');

  resetBodyScrollLockForTests();

  const fakeDoc = {
    documentElement: {
      style: { overflow: 'auto', overscrollBehaviorY: '' },
      clientWidth: 1264,
    },
    body: {
      style: { overflow: '', paddingRight: '4px', overscrollBehaviorY: '' },
    },
  };
  const fakeWin = {
    innerWidth: 1280,
    getComputedStyle: () => ({ paddingRight: '4px' }),
  }; // 16px scrollbar width + 4px existing body padding -> 20px

  // Modal 1 opens
  acquireBodyScrollLock(fakeDoc as any, fakeWin as any);
  assert.equal(getActiveScrollLockCount(), 1);
  assert.equal(fakeDoc.documentElement.style.overflow, 'hidden');
  assert.equal(fakeDoc.body.style.overflow, 'hidden');
  assert.equal(
    fakeDoc.body.style.paddingRight,
    '20px',
    'Scrollbar compensation must add to existing body paddingRight instead of overwriting it'
  );

  // Modal 2 opens on top (stacked)
  acquireBodyScrollLock(fakeDoc as any, fakeWin as any);
  assert.equal(getActiveScrollLockCount(), 2);
  assert.equal(fakeDoc.body.style.overflow, 'hidden');

  // Modal 2 closes -> lock MUST remain active for Modal 1
  releaseBodyScrollLock(fakeDoc as any);
  assert.equal(getActiveScrollLockCount(), 1);
  assert.equal(fakeDoc.documentElement.style.overflow, 'hidden');
  assert.equal(fakeDoc.body.style.overflow, 'hidden');

  // Modal 1 closes -> exact prior styles restored
  releaseBodyScrollLock(fakeDoc as any);
  assert.equal(getActiveScrollLockCount(), 0);
  assert.equal(fakeDoc.documentElement.style.overflow, 'auto');
  assert.equal(fakeDoc.body.style.overflow, '');
  assert.equal(fakeDoc.body.style.paddingRight, '4px');

  // Extra release never underflows
  releaseBodyScrollLock(fakeDoc as any);
  assert.equal(getActiveScrollLockCount(), 0);
});

test('Payment modals and view-hosted modals enforce viewport-fixed max-h-[calc(100dvh-32px)], internal scroll, sticky footer, and Portal isolation', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { RecordPaymentModal } = await import(
    '../src/components/modals/RecordPaymentModal'
  );

  const sampleRoom = makeRoom({
    id: 'room-modal-test',
    securityDeposit: 4500,
    securityDepositPaid: 1000,
    unpaidBalance: 1754,
  });
  const sampleBill: import('../src/types/rental').BillRecord = {
    id: 'bill-modal-test',
    receiptNo: '4R-202611-99',
    roomId: sampleRoom.id,
    roomName: sampleRoom.name,
    tenantName: 'Yuri Santos',
    billingPeriod: 'Nov 2026',
    createdAt: '2026-11-15T08:00:00.000Z',
    dueDate: '2026-11-10T00:00:00.000Z',
    baseRent: 500,
    prevReading: 100,
    currReading: 200,
    consumptionKwh: 100,
    electricRate: 12.54,
    electricTotal: 1254,
    previousBalanceCarryOver: 0,
    securityDepositRequired: 4500,
    depositApplied: 0,
    totalAmountDue: 1754,
    amountPaid: 0,
    overpaymentToAdvance: 0,
    remainingBalance: 1754,
    status: 'unpaid',
    paymentHistory: [],
    updatedAt: '2026-11-15T08:00:00.000Z',
  };

  const modalHtml = renderToStaticMarkup(
    React.createElement(RecordPaymentModal, {
      isOpen: true,
      room: sampleRoom,
      activeBill: sampleBill,
      initialMode: 'current_month',
      onClose: () => {},
      onRecordBillPayment: () => {},
      onRecordRequiredDepositPayment: () => {},
    })
  );

  assert.ok(modalHtml.includes('fixed inset-0'), 'Modal overlay must use viewport-relative fixed inset-0');
  assert.ok(
    modalHtml.includes('max-h-[calc(100dvh-32px)]'),
    'Modal panel must constrain height to calc(100dvh - 32px)'
  );
  assert.ok(
    modalHtml.includes('overflow-y-auto'),
    'Modal body must scroll independently'
  );
  assert.ok(
    modalHtml.includes('shrink-0'),
    'Modal header and footer must remain pinned (shrink-0)'
  );

  // Verify view-hosted modals use ModalPortal & viewport height constraint
  const allPaymentsSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/payments/AllPaymentsView.tsx'),
    'utf8'
  );
  assert.ok(allPaymentsSrc.includes('ModalPortal'), 'AllPaymentsView modal must render through ModalPortal');
  assert.ok(allPaymentsSrc.includes('max-h-[calc(100dvh-32px)]'), 'AllPaymentsView modal must use calc(100dvh - 32px)');

  const inquiriesSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/inquiries/InquiriesBookingsView.tsx'),
    'utf8'
  );
  assert.ok(inquiriesSrc.includes('ModalPortal'), 'InquiriesBookingsView modal must render through ModalPortal');
  assert.ok(inquiriesSrc.includes('max-h-[calc(100dvh-32px)]'), 'InquiriesBookingsView modal must use calc(100dvh - 32px)');

  const cssSrc = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
  assert.ok(
    cssSrc.includes('animation: viewEnter 0.42s var(--spring-ease) backwards;'),
    '.animate-view-enter must use backwards fill mode so it never retains a fixed-positioning containing block'
  );
  assert.ok(
    cssSrc.includes('animation: modalPop 0.36s var(--spring-ease) backwards;'),
    '.animate-modal-pop must use backwards fill mode so it never traps nested overlays'
  );

  // Verify RecordPaymentModal renders the Payment Type tablist once (no duplicated tablist)
  const recordPaymentSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/components/modals/RecordPaymentModal.tsx'),
    'utf8'
  );
  const tablistMatches = recordPaymentSrc.match(/role="tablist"/g) || [];
  assert.equal(
    tablistMatches.length,
    1,
    'RecordPaymentModal must render role="tablist" once to preserve focus and avoid duplication'
  );

  // Verify flex-column scrollable body containers enforce flex-1 min-h-0 overscroll-contain
  const flexBodyChecks: Array<{ file: string; needle: string }> = [
    {
      file: 'src/components/modals/DownloadAppsModal.tsx',
      needle: 'flex-1 min-h-0 overflow-y-auto overscroll-contain',
    },
    {
      file: 'src/components/ocr/SubMeterScannerModal.tsx',
      needle: 'grid grid-cols-1 lg:grid-cols-12 overflow-y-auto overscroll-contain flex-1 min-h-0',
    },
    {
      file: 'src/components/rooms/RoomDetailsModal.tsx',
      needle: 'flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto overscroll-contain',
    },
    {
      file: 'src/components/modals/AdvanceBalanceModal.tsx',
      needle: 'flex-1 min-h-0 p-4 sm:p-6 space-y-5 overflow-y-auto overscroll-contain min-w-0',
    },
    {
      file: 'src/components/receipt/ReceiptModal.tsx',
      needle: 'flex-1 min-h-0 overflow-y-auto overscroll-contain',
    },
    {
      file: 'src/components/modals/PinAuthModal.tsx',
      needle: 'flex-1 min-h-0 overflow-y-auto overscroll-contain',
    },
  ];
  for (const check of flexBodyChecks) {
    const src = fs.readFileSync(path.join(process.cwd(), check.file), 'utf8');
    assert.ok(
      src.includes(check.needle),
      `${check.file} scrollable body must include "${check.needle}"`
    );
  }
});

test('Modal Escape stack closes only the top-most open modal in LIFO order', async () => {
  const {
    pushModalEscapeHandler,
    removeModalEscapeHandler,
    dispatchTopModalEscape,
    getModalEscapeStackSize,
    resetModalEscapeStackForTests,
  } = await import('../src/utils/modalStack');

  resetModalEscapeStackForTests();
  const closed: string[] = [];

  const tokenA = pushModalEscapeHandler(() => closed.push('A'));
  const tokenB = pushModalEscapeHandler(() => closed.push('B'));
  const tokenC = pushModalEscapeHandler(() => closed.push('C'));
  assert.equal(getModalEscapeStackSize(), 3);

  // Escape closes only top-most modal C
  assert.equal(dispatchTopModalEscape(), true);
  assert.deepEqual(closed, ['C']);

  // Unregister C and B out of order (e.g., B closes programmatically)
  removeModalEscapeHandler(tokenB);
  removeModalEscapeHandler(tokenC);
  assert.equal(getModalEscapeStackSize(), 1);

  // Next Escape closes A
  assert.equal(dispatchTopModalEscape(), true);
  assert.deepEqual(closed, ['C', 'A']);

  removeModalEscapeHandler(tokenA);
  assert.equal(getModalEscapeStackSize(), 0);
  assert.equal(dispatchTopModalEscape(), false);
});
