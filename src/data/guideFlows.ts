import { NavigationTab } from '../types/rental';

export type GuideFlowId =
  | 'room-lifecycle'
  | 'submeter-ocr'
  | 'calendar-window'
  | 'official-receipt'
  | 'advance-vault'
  | 'archive-bookings'
  | 'offline-sync';

export type GuideCategory = 'Daily Billing' | 'Money & Vault' | 'Safety & Sync';

export type BuddyMood =
  | 'point'
  | 'scan'
  | 'lock'
  | 'receipt'
  | 'wallet'
  | 'archive'
  | 'sync';

export interface GuideSubStep {
  stepNo: 1 | 2 | 3;
  title: string;
  instruction: string;
  badge: string;
}

export type GuideActionTarget =
  | { type: 'tab'; tab: NavigationTab }
  | { type: 'addRoom' }
  | { type: 'scanner' };

export interface GuideFlowDefinition {
  id: GuideFlowId;
  order: number;
  category: GuideCategory;
  shortTitle: string;
  title: string;
  subtitle: string;
  mascotMood: BuddyMood;
  mascotTip: string;
  ruleWarning: string;
  actionLabel: string;
  actionTarget: GuideActionTarget;
  steps: [GuideSubStep, GuideSubStep, GuideSubStep];
}

export const GUIDE_CATEGORIES: Array<'All' | GuideCategory> = [
  'All',
  'Daily Billing',
  'Money & Vault',
  'Safety & Sync',
];

export const GUIDE_FLOWS: GuideFlowDefinition[] = [
  {
    id: 'room-lifecycle',
    order: 1,
    category: 'Daily Billing',
    shortTitle: 'Rooms & Tenants',
    title: 'Room Setup & Tenancy Lifecycle',
    subtitle:
      'Keep your electric sub-meter reading continuous from tenant to tenant while protecting occupied units.',
    mascotMood: 'point',
    mascotTip: 'Start here! One room keeps its physical meter kWh forever.',
    ruleWarning:
      'Occupied rooms cannot be archived directly. Always mark Tenant Vacated first, and Permanent Removal requires Fingerprint/PIN.',
    actionLabel: 'Go to Rooms & Add Room',
    actionTarget: { type: 'addRoom' },
    steps: [
      {
        stepNo: 1,
        title: 'Create Room & Baseline kWh',
        badge: 'Step 1 • Unit',
        instruction:
          'Enter Monthly Rent, Required Deposit, and initial sub-meter kWh. This meter reading stays continuous even after tenants move out.',
      },
      {
        stepNo: 2,
        title: 'Assign Tenant & Due Day (1–10)',
        badge: 'Step 2 • Lease',
        instruction:
          'Record Tenant Name, Phone, Due Day (1st to 10th), Valid ID verification, and RA 10173 Privacy Consent.',
      },
      {
        stepNo: 3,
        title: 'Safe Vacate, Archive & Remove',
        badge: 'Step 3 • Guards',
        instruction:
          'Every critical room button confirms cleanly: Tenant Vacated saves history, Archive stores vacant units, and Remove Room requires Fingerprint/PIN.',
      },
    ],
  },
  {
    id: 'submeter-ocr',
    order: 2,
    category: 'Daily Billing',
    shortTitle: 'Sub-Meter OCR',
    title: 'Sub-Meter OCR Scan & Auto-Rollover',
    subtitle:
      'Read mechanical rollers and digital LCD kWh meters accurately on both Mobile camera and Desktop upload.',
    mascotMood: 'scan',
    mascotTip: 'Snap straight & close! HD Crop zooms the register drums for you.',
    ruleWarning:
      'Wait for HD Crop to verify the register digits before saving. #2 Current automatically becomes #1 Previous next month.',
    actionLabel: 'Open Sub-Meter Scanner',
    actionTarget: { type: 'scanner' },
    steps: [
      {
        stepNo: 1,
        title: 'Pick Slot #1 or #2 & Capture',
        badge: 'Step 1 • Scan',
        instruction:
          'Select Sub-Meter #1 (Previous) or #2 (Current). Use Live Camera / Snap Photo on Mobile or Upload Image on Desktop.',
      },
      {
        stepNo: 2,
        title: 'Verify Digits with HD Crop',
        badge: 'Step 2 • Verify',
        instruction:
          'Inspect the zoomed register crop to confirm every kWh digit (and tenths digit) matches your physical sub-meter.',
      },
      {
        stepNo: 3,
        title: 'Calculate & Auto-Rollover',
        badge: 'Step 3 • Rollover',
        instruction:
          'System computes kWh delta x Rate, issues 1 Active Official Receipt per room, and carries Current kWh forward next month.',
      },
    ],
  },
  {
    id: 'calendar-window',
    order: 3,
    category: 'Daily Billing',
    shortTitle: 'Calendar Locks',
    title: 'Calendar Schedule & Pay Window Guard',
    subtitle:
      'Prevent early or duplicate meter scans with smart monthly lock rules tied to Days 1–10 and paid status.',
    mascotMood: 'lock',
    mascotTip: 'Locked months let you inspect Room Details without double-billing!',
    ruleWarning:
      'Scan Meter is locked when browsing Future Months or when the current month bill is already Paid. Use Advance Payment to prepay ahead.',
    actionLabel: 'Open Due Calendar',
    actionTarget: { type: 'tab', tab: 'calendar' },
    steps: [
      {
        stepNo: 1,
        title: 'Track Due Days 1–10',
        badge: 'Step 1 • Window',
        instruction:
          'Navigate months with the stepper and filter specific due dates (1st–10th) to see Pending, Partial, or Paid rooms.',
      },
      {
        stepNo: 2,
        title: 'Respect Paid & Future Locks',
        badge: 'Step 2 • Guard',
        instruction:
          'Already-settled rooms in the active month and all future months automatically lock Scan Meter so no premature bill is issued.',
      },
      {
        stepNo: 3,
        title: 'Inspect Room Details Anytime',
        badge: 'Step 3 • Inspect',
        instruction:
          'Even on locked future months, tap any unit to open Room Details or launch Advance Payment for upcoming cycles.',
      },
    ],
  },
  {
    id: 'official-receipt',
    order: 4,
    category: 'Money & Vault',
    shortTitle: 'Receipts & Share',
    title: 'Official Statement & Receipt Sharing',
    subtitle:
      'Present a clean white-paper statement showing itemized rent, kWh proof photos, and export options.',
    mascotMood: 'receipt',
    mascotTip: 'Dual meter crops inside the receipt prevent tenant billing disputes!',
    ruleWarning:
      'Each room holds 1 active Official Receipt at a time. Issuing a new monthly receipt archives the prior one safely.',
    actionLabel: 'View Payment History',
    actionTarget: { type: 'tab', tab: 'payments' },
    steps: [
      {
        stepNo: 1,
        title: 'Itemized Breakdown & Meter Proofs',
        badge: 'Step 1 • Audit',
        instruction:
          'Every receipt displays Base Rent, Previous & Current kWh photo crops, Carry-over Balance, and Applied Advance/Deposit.',
      },
      {
        stepNo: 2,
        title: 'One-Page A4 PDF or PNG Download',
        badge: 'Step 2 • Export',
        instruction:
          'Tap Print / Save PDF for a formal single-sheet statement or Download PNG to save an image receipt directly on your device.',
      },
      {
        stepNo: 3,
        title: 'Direct Messenger Delivery',
        badge: 'Step 3 • Share',
        instruction:
          'Tap Share to Messenger to open the tenant chat with receipt details/image copied and ready to send.',
      },
    ],
  },
  {
    id: 'advance-vault',
    order: 5,
    category: 'Money & Vault',
    shortTitle: 'Advance & Refund',
    title: 'Overpayment, Advance Balance & Refund',
    subtitle:
      'Turn extra payments into protected Next-Month Advance Credit with biometric/PIN sign-off and move-out refunds.',
    mascotMood: 'wallet',
    mascotTip: 'Extra ₱ above the bill automatically waits safely for next month!',
    ruleWarning:
      'Every Overpayment-to-Advance credit, manual Advance deposit, and Move-Out Refund requires Fingerprint (Mobile) or 4-Digit PIN (Desktop).',
    actionLabel: 'Open Rooms & Balances',
    actionTarget: { type: 'tab', tab: 'rooms' },
    steps: [
      {
        stepNo: 1,
        title: 'Pay Over Due or Prepay Next Month',
        badge: 'Step 1 • Credit',
        instruction:
          'Record a payment larger than Remaining Balance—or use Advance / Refund quick-fills (+1 Month, +2 Months, Due + Next Month).',
      },
      {
        stepNo: 2,
        title: 'Verify with Fingerprint or PIN',
        badge: 'Step 2 • Auth',
        instruction:
          'Confirm excess credit via device Fingerprint (Mobile) or 4-Digit PIN (Desktop/Web) before balances update.',
      },
      {
        stepNo: 3,
        title: 'Auto-Deduct or Refund on Move-Out',
        badge: 'Step 3 • Apply',
        instruction:
          'Credited Advance automatically deducts on the next billing cycle, or refund unused balance cleanly when a tenant vacates.',
      },
    ],
  },
  {
    id: 'archive-bookings',
    order: 6,
    category: 'Safety & Sync',
    shortTitle: 'Bookings & Archive',
    title: 'Bookings, Archive Center & Immutable Logs',
    subtitle:
      'Convert reservations into move-ins and protect past tenant receipts and meter history from accidental deletion.',
    mascotMood: 'archive',
    mascotTip: 'Archive reading logs stay locked so your kWh audit trail is always safe.',
    ruleWarning:
      'Sub-Meter reading logs in Archive are immutable—there is intentionally no Delete Log action to protect financial integrity.',
    actionLabel: 'Open Archive Center',
    actionTarget: { type: 'tab', tab: 'archive' },
    steps: [
      {
        stepNo: 1,
        title: 'Approve Booking -> 1-Tap Move-In',
        badge: 'Step 1 • Book',
        instruction:
          'Track unit inquiries, log reservation fees, and approve a booking to convert the prospect directly into an occupied room.',
      },
      {
        stepNo: 2,
        title: 'Previous Tenants & Restorable Units',
        badge: 'Step 2 • History',
        instruction:
          'Inspect Previous Tenants History and Archived Receipts anytime, or restore an Archived Room back to active service.',
      },
      {
        stepNo: 3,
        title: 'Permanent Meter Audit Logs',
        badge: 'Step 3 • Lock',
        instruction:
          'Every OCR scan and move-out final reading remains permanently stored in Archive & Logs and cannot be removed.',
      },
    ],
  },
  {
    id: 'offline-sync',
    order: 7,
    category: 'Safety & Sync',
    shortTitle: 'Sync & Offline',
    title: 'Offline IndexedDB & Space Code Sync',
    subtitle:
      'Run 100% offline in the Android APK or Browser, then pair Mobile from your Desktop Property Space Code.',
    mascotMood: 'sync',
    mascotTip: 'Keep your Property Space Code private—anyone with it sees synced data!',
    ruleWarning:
      'Only Desktop/Web generates Space Codes. Mobile can apply a code once per month, which refreshes the app cleanly and applies cloud data.',
    actionLabel: 'Open Sync & Security Settings',
    actionTarget: { type: 'tab', tab: 'settings' },
    steps: [
      {
        stepNo: 1,
        title: '100% Offline-First Local Storage',
        badge: 'Step 1 • Offline',
        instruction:
          'All rooms, photos, bills, and PIN locks save automatically into persistent IndexedDB + local storage without requiring Wi-Fi.',
      },
      {
        stepNo: 2,
        title: 'Generate Space Code on Desktop',
        badge: 'Step 2 • Desktop',
        instruction:
          'In Settings -> Cloud Sync on Desktop/Web, sync your property and copy your private Space Code (do not share publicly).',
      },
      {
        stepNo: 3,
        title: 'Apply Once a Month on Mobile',
        badge: 'Step 3 • Mobile',
        instruction:
          'Paste the Space Code on Mobile (1 change/month limit) -> app reloads automatically -> pulls and applies your cloud snapshot cleanly.',
      },
    ],
  },
];
