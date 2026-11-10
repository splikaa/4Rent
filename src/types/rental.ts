export type NavigationTab =
  | 'dashboard'
  | 'rooms'
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
  dueDayOfMonth: number; // Strictly 1 - 10 of every month
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

export interface AdvanceBalanceTransaction {
  id: string;
  type: 'overpayment_credit' | 'manual_deposit' | 'withdrawal' | 'applied_to_bill';
  amount: number;
  createdAt: string;
  note: string;
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

export interface PaymentTransaction {
  id: string;
  amount: number;
  overpaymentCredited?: number;
  method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer';
  paidAt: string;
  referenceNo?: string;
  note?: string;
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
  createdAt: string;
  dueDate: string; // Always within Day 1 - 10 of the month
  paymentWindowLabel?: string; // "Every 1st - 10th of the Month"

  // Dual Electric Sub-Meter OCR Data (Previous Meter + Current Meter Proofs)
  prevReading: number;
  currReading: number;
  consumptionKwh: number; // currReading - prevReading
  electricRate: number; // Global ₱/kWh from Settings
  electricTotal: number; // consumptionKwh * electricRate
  prevMeterPhotoDataUrl?: string; // Sub-Meter #1: Previous Reading Photo Proof
  prevMeterCropDataUrl?: string; // Sub-Meter #1: Cropped Register Value Screenshot
  meterPhotoDataUrl?: string; // Sub-Meter #2: Current Reading Photo Proof
  currMeterCropDataUrl?: string; // Sub-Meter #2: Cropped Register Value Screenshot
  ocrConfidence?: number;

  // Financial Breakdown
  baseRent: number;
  securityDepositRequired: number;
  previousBalanceCarryOver: number;
  depositApplied: number; // Advance/Deposit credit applied to this bill
  totalAmountDue: number;
  amountPaid: number;
  overpaymentToAdvance: number; // Any excess paid above totalAmountDue credited to room's Advance Balance
  remainingBalance: number;
  status: 'paid' | 'partial' | 'unpaid';
  paymentMethod?: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer';
  paidAt?: string;
  isArchived?: boolean; // Previous receipts archived when a new receipt is issued for the room
  archivedAt?: string;
  notes?: string;
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
}

export interface AppSettings {
  apartmentName: string;
  landlordName: string;
  landlordPhone: string;
  landlordMessenger: string;
  paymentInstructions: string;
  defaultElectricRate: number; // Master ₱/kWh rate applied to ALL rooms
  defaultMonthlyRent: number;
  defaultSecurityDeposit: number;
  remindersPromptShown: boolean;
  remindersEnabled: boolean;
  notificationsVerified?: boolean;
  receiptPrintFormat: 'standard' | 'thermal80';
  privacyMaskEnabled?: boolean; // Masks tenant PII and revenue when viewing in public
  maskReceiptContacts?: boolean; // Masks tenant phone digits on exported receipts for privacy
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
  exportedAt: string;
  rooms: Room[];
  bills: BillRecord[];
  inquiries: RoomInquiryBooking[];
  tenantHistory: TenantHistoryEntry[];
  settings: AppSettings;
  meterLogs?: SubMeterReadingLog[];
}
