export type NavigationTab =
  | 'dashboard'
  | 'rooms'
  | 'calendar'
  | 'inquiries'
  | 'payments'
  | 'archive'
  | 'settings';

export interface TenantProfile {
  id: string;
  fullName: string;
  phone: string;
  messengerUsername?: string;
  moveInDate: string;
  moveOutDate?: string; // Optional planned or actual occupancy end date (YYYY-MM-DD) for mid-month proration
  dueDayOfMonth: number; // Preferred reminder day (1-10); billing due date is the 10th of the billing month
  emergencyContact?: string;
  validIdVerified?: boolean; // Landlord safety: Tenant valid ID verified on file
  privacyConsentSigned?: boolean; // Tenant privacy: RA 10173 Data Privacy & Lease terms acknowledged
  notes?: string;
}

export interface TenantHistoryEntry {
  id: string;
  roomId: string;
  roomName: string;
  tenantName: string;
  phone: string;
  messengerUsername?: string;
  moveInDate: string;
  moveOutDate: string;
  reason?: string; // e.g., "Completed Lease", "Stopped Paying Rent / Vacated"
  finalMeterReading: number;
  depositHeld: number;
  unpaidBalanceAtMoveOut: number;
  lastReceiptNo?: string;
  notes?: string;
}

export type AdvanceTransactionType =
  | 'overpayment_credit'
  | 'manual_deposit'
  | 'withdrawal'
  | 'applied_to_bill'
  | 'adjustment';

export type AdvanceTransactionStatus = 'completed' | 'pending' | 'reversed';

export type AdvanceCapPolicyMode = 'unlimited' | '1_month';

export interface AdvanceBalanceTransaction {
  id: string;
  type: AdvanceTransactionType;
  amount: number;
  createdAt: string;
  note: string;
  description?: string;
  referenceNo?: string;
  balanceBefore?: number;
  balanceAfter?: number;
  status?: AdvanceTransactionStatus;
  billingPeriod?: string;
  billId?: string;
  receiptNo?: string;
  idempotencyKey?: string;
  category?:
    | 'rent'
    | 'electricity'
    | 'carryover'
    | 'other'
    | 'deposit'
    | 'refund'
    | 'advance_credit'
    | 'adjustment';
}

export interface Room {
  id: string;
  name: string; // e.g., "Room 101"
  floorOrUnit?: string; // e.g., "1st Floor • Studio"
  monthlyRent: number; // Base monthly rent in ₱
  lastMeterReading: number; // Continuous physical electric sub-meter kWh reading (never resets on tenant change)
  lastMeterPhotoDataUrl?: string; // Stored photo proof of the previous sub-meter reading
  lastMeterCropDataUrl?: string; // Cropped close-up screenshot of the sub-meter register value itself
  lastReadingDate?: string;
  status: 'occupied' | 'vacant';
  tenant?: TenantProfile;
  unpaidBalance: number; // Carried-over unpaid or partial balance in ₱
  securityDeposit: number; // Required Security deposit held in ₱
  securityDepositPaid?: number; // Paid required security deposit held on account in ₱
  securityDepositHistory?: PaymentTransaction[]; // Tracked payments toward Required Security Deposit
  advanceRent: number; // Withdrawable Advance payment balance (includes overpayments) in ₱
  advanceHistory?: AdvanceBalanceTransaction[];
  activeReceiptId?: string; // 1 Room = 1 Active Official Receipt
  isArchived?: boolean; // Archived rooms
  archivedAt?: string;
  updatedAt: string;
}

export interface RoomInquiryBooking {
  id: string;
  prospectName: string;
  phone: string;
  messengerUsername?: string;
  roomId: string;
  roomName: string;
  targetMoveInDate: string;
  reservationFee: number; // Paid booking/reservation fee in ₱
  quotedMonthlyRent: number;
  requiredDeposit: number;
  status: 'inquiry' | 'booked' | 'converted' | 'cancelled';
  validIdPresented?: boolean;
  privacyConsentAccepted?: boolean;
  notes?: string;
  createdAt: string;
}

export type PaymentAllocationTarget =
  | 'auto'
  | 'rent'
  | 'electricity'
  | 'penalty'
  | 'custom';

export interface ComponentPaymentAllocation {
  rentPaid: number;
  electricityPaid: number;
  latePenaltyPaid: number;
  carryOverPaid: number;
  otherChargesPaid?: number;
}

export interface PaymentTransaction {
  id: string;
  amount: number;
  overpaymentCredited?: number;
  method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer';
  paidAt: string;
  referenceNo?: string;
  note?: string;
  allocationTarget?: PaymentAllocationTarget;
  componentAllocation?: ComponentPaymentAllocation;
}

export interface MonthlyMeterReading {
  id: string;
  roomId: string;
  roomName: string;
  tenantName?: string;
  billingPeriod: string; // e.g., "Nov 2026"
  billingMonthKey: string; // Canonical "YYYY-MM" unique per room
  previousReadingKwh: number;
  currentReadingKwh: number;
  consumptionKwh: number;
  electricRate: number;
  electricCharge: number;
  source: 'ocr_verified' | 'ocr_corrected' | 'manual_authorized';
  ocrExtractedReadingKwh?: number | null;
  ocrConfidence?: number;
  isVerified: boolean;
  verifiedAt: string;
  correctionAuthorized?: boolean;
  correctionNote?: string;
  meterResetOrReplacement?: boolean;
  meterResetType?: 'dial_rollover' | 'meter_reset';
  meterResetDocumentedReason?: string;
  dialDigits?: number;
  prevPhotoDataUrl?: string;
  prevCropDataUrl?: string;
  currPhotoDataUrl?: string;
  currCropDataUrl?: string;
  billId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillRecord {
  id: string;
  receiptNo: string; // e.g., "4R-202611-001"
  roomId: string;
  roomName: string;
  tenantName: string;
  tenantPhone?: string;
  tenantMessenger?: string;
  billingPeriod: string; // e.g., "Nov 2026"
  billingMonthKey?: string; // Canonical "YYYY-MM" for strict period deduplication
  createdAt: string;
  dueDate: string; // 10th day of the billing month (Payment Period: 1st-10th; Late from 11th)
  paymentWindowLabel?: string; // e.g., "1st - 10th of Nov 2026 (Late Penalty starts 11th)"

  // Dual Electric Sub-Meter OCR Data (Previous Meter + Current Meter Proofs)
  prevReading: number;
  currReading: number;
  consumptionKwh: number; // currReading - prevReading
  electricRate: number; // Applicable monthly ₱/kWh rate locked for this billing month
  electricTotal: number; // consumptionKwh * electricRate
  electricityVerified?: boolean; // Mandatory verified OCR/authorized electricity reading flag
  meterReadingId?: string; // Foreign reference to verified MonthlyMeterReading
  prevMeterPhotoDataUrl?: string; // Sub-Meter #1: Previous Reading Photo Proof
  prevMeterCropDataUrl?: string; // Sub-Meter #1: Cropped Register Value Screenshot
  meterPhotoDataUrl?: string; // Sub-Meter #2: Current Reading Photo Proof
  currMeterCropDataUrl?: string; // Sub-Meter #2: Cropped Register Value Screenshot
  ocrConfidence?: number;

  // Rent Schedule, Proration & Configurable Late Penalty Breakdown
  baseRent: number; // Chargeable rent for this billing month (equals prorated rent if prorated)
  monthlyRentFull?: number; // Full monthly room rent before proration
  isProrated?: boolean;
  occupiedDays?: number;
  daysInBillingMonth?: number;
  dailyRentRate?: number;
  occupancyStartDate?: string; // YYYY-MM-DD
  occupancyEndDate?: string; // YYYY-MM-DD
  latePenalty?: number; // Configurable penalty applied starting on the 11th day of billing month
  latePenaltyLabel?: string;
  daysPastDue?: number;
  totalRentDue?: number; // baseRent + (latePenalty || 0)

  // Financial Breakdown
  otherCharges?: number;
  grossCharges?: number; // baseRent + electricTotal + latePenalty + previousBalanceCarryOver + otherCharges
  securityDepositRequired: number;
  securityDepositApplied?: number; // Paid required deposit deducted from this bill
  securityDepositRemainingAfterBill?: number; // Remaining paid deposit carried forward to future bills
  advanceApplied?: number; // Advance balance deducted from this bill
  advanceBalanceBefore?: number; // Wallet advance credit available before this bill
  advanceBalanceAfter?: number; // Wallet advance credit remaining after this bill / payment
  previousBalanceCarryOver: number;
  depositApplied: number; // Total Deposit + Advance credit deducted from this bill
  totalAmountDue: number;
  amountPaid: number;
  overpaymentToAdvance: number; // Any excess paid above totalAmountDue credited to room's Advance Balance
  remainingBalance: number;

  // Separate Component Payment Tracking (Rent vs Electricity vs Late Penalty vs Carry-Over)
  rentPaid?: number;
  rentRemaining?: number;
  electricityPaid?: number;
  electricityRemaining?: number;
  latePenaltyPaid?: number;
  latePenaltyRemaining?: number;
  carryOverPaid?: number;
  carryOverRemaining?: number;

  status: 'paid' | 'partial' | 'unpaid';
  paymentMethod?: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer';
  paidAt?: string;
  isLocked?: boolean; // Finalized/locked receipt protection against retroactive mutation
  isArchived?: boolean; // Previous receipts archived when a new receipt is issued for the room
  archivedAt?: string;
  idempotencyKey?: string;
  notes?: string;
  adjustmentNotes?: Array<{
    id: string;
    createdAt: string;
    reason: string;
    deltaAmount: number;
  }>;
  paymentHistory: PaymentTransaction[];
  updatedAt: string;
}

export interface SecurityAuditEntry {
  id: string;
  action: string;
  details: string;
  category: 'security' | 'privacy' | 'billing' | 'tenant';
  createdAt: string;
}

export interface SecurityConfig {
  isSetupComplete: boolean;
  lockEnabled: boolean;
  authMethod: 'none' | 'pin' | 'fingerprint' | 'both';
  pinCode: string; // 4-digit PIN (Required for deleting rooms & protected actions; defaults to "1234" if skipped)
  webAuthnCredentialId?: string;
  autoLockMinutes?: number; // Auto-lock inactivity timer (e.g., 0 = disabled, 5, 15, 30)
  requirePinForSensitiveActions?: boolean; // Require PIN for advance withdrawals & room deletions
}

export type CloudProvider = 'firebase';

export interface CloudSyncConfig {
  enabled: boolean;
  provider?: CloudProvider;
  firebaseProjectId?: string;
  firebaseApiKey?: string;
  firebaseDatabaseUrl?: string;
  propertyCode: string;
  lastSyncedAt?: string;
  mobileCodeAppliedMonth?: string; // YYYY-MM when mobile last applied a Property Space Code
  mobileCodeAppliedAt?: string;
}

export interface LatePenaltyConfig {
  enabled: boolean;
  mode: 'daily_rent' | 'fixed' | 'percentage'; // Daily divided rent (Rent / daysInMonth), Fixed Peso amount, OR Percentage of chargeable rent
  value: number | null; // Null for daily_rent or when unconfigured
  applyPerDay?: boolean; // false = flat once starting Day 11, true = per late day starting Day 11
}

export interface AppSettings {
  apartmentName: string;
  landlordName: string;
  landlordPhone: string;
  landlordMessenger: string;
  paymentInstructions: string;
  defaultElectricRate: number; // Master ₱/kWh fallback rate for unconfigured months
  monthlyElectricRates?: Record<string, number>; // Independent monthly rates keyed by YYYY-MM (e.g. '2026-01': 12.50)
  defaultMonthlyRent: number;
  defaultSecurityDeposit: number;
  latePenalty?: LatePenaltyConfig; // Configurable late charges starting Day 11 of billing month
  advanceCapMode?: AdvanceCapPolicyMode; // 'unlimited' = Prepaid Wallet (default), '1_month' = Legacy 1-month cap
  remindersPromptShown: boolean;
  remindersEnabled: boolean;
  notificationsVerified?: boolean;
  receiptPrintFormat: 'standard' | 'thermal80';
  privacyMaskEnabled?: boolean; // Masks tenant PII and revenue when viewing in public
  maskReceiptContacts?: boolean; // Masks tenant phone digits on exported receipts for privacy
  updatedAt?: string; // ISO timestamp for cross-device configuration synchronization
  security: SecurityConfig;
  cloudSync: CloudSyncConfig;
}

export interface SubMeterReadingLog {
  id: string;
  roomId: string;
  roomName: string;
  tenantName?: string;
  readingDate: string; // ISO 8601
  readingKwh: number;
  consumptionDeltaKwh: number;
  source: 'ocr_scan' | 'manual_entry' | 'rollover';
  photoDataUrl?: string; // stored in IndexedDB, referenced or truncated in localStorage
  cropDataUrl?: string;
  billId?: string;
  notes?: string;
}

export interface AppDatabaseSnapshot {
  version: string;
  schemaVersion?: number;
  exportedAt: string;
  rooms: Room[];
  bills: BillRecord[];
  inquiries: RoomInquiryBooking[];
  tenantHistory: TenantHistoryEntry[];
  settings: AppSettings;
  meterLogs?: SubMeterReadingLog[];
  monthlyReadings?: MonthlyMeterReading[];
}
