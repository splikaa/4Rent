export type NavigationTab = 'dashboard' | 'rooms' | 'payments' | 'settings';

export interface TenantProfile {
  id: string;
  fullName: string;
  phone: string;
  messengerUsername?: string;
  moveInDate: string;
  dueDayOfMonth: number; // 1 - 31
  emergencyContact?: string;
  notes?: string;
}

export interface TenantHistoryEntry {
  id: string;
  roomId: string;
  roomName: string;
  tenantName: string;
  phone: string;
  moveInDate: string;
  moveOutDate: string;
  finalMeterReading: number;
  notes?: string;
}

export interface Room {
  id: string;
  name: string; // e.g., "Room 101"
  floorOrUnit?: string; // e.g., "1st Floor • Studio"
  monthlyRent: number; // Base monthly rent in ₱
  electricRatePerKwh: number; // Rate per kWh in ₱
  lastMeterReading: number; // Previous electric sub-meter kWh reading
  lastReadingDate?: string;
  status: 'occupied' | 'vacant';
  tenant?: TenantProfile;
  unpaidBalance: number; // Carried-over unpaid or partial balance in ₱
  securityDeposit: number; // Security deposit held in ₱
  advanceRent: number; // Advance payment held in ₱
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  amount: number;
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
  dueDate: string;

  // Electric Sub-Meter OCR Data
  prevReading: number;
  currReading: number;
  consumptionKwh: number; // currReading - prevReading
  electricRate: number; // ₱/kWh
  electricTotal: number; // consumptionKwh * electricRate
  meterPhotoDataUrl?: string; // Cropped/annotated meter reading snapshot
  ocrConfidence?: number;

  // Financial Breakdown
  baseRent: number;
  previousBalanceCarryOver: number;
  depositApplied: number;
  totalAmountDue: number;
  amountPaid: number;
  remainingBalance: number;
  status: 'paid' | 'partial' | 'unpaid';
  paymentMethod?: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer';
  paidAt?: string;
  notes?: string;
  paymentHistory: PaymentTransaction[];
  updatedAt: string;
}

export interface SecurityConfig {
  isSetupComplete: boolean;
  lockEnabled: boolean;
  authMethod: 'none' | 'pin' | 'fingerprint' | 'both';
  pinCode?: string; // 4-digit PIN
  webAuthnCredentialId?: string; // Base64 credential ID from navigator.credentials
}

export interface CloudSyncConfig {
  enabled: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  propertyCode: string; // Shared workspace/apartment identifier across desktop & mobile
  lastSyncedAt?: string;
}

export interface AppSettings {
  apartmentName: string;
  landlordName: string;
  landlordPhone: string;
  landlordMessenger: string;
  paymentInstructions: string; // e.g., GCash / Maya account details shown on receipts
  defaultElectricRate: number; // Default ₱/kWh (e.g., ₱14.50/kWh)
  defaultMonthlyRent: number; // Default ₱ base rent
  remindersPromptShown: boolean;
  remindersEnabled: boolean;
  receiptPrintFormat: 'standard' | 'thermal80';
  security: SecurityConfig;
  cloudSync: CloudSyncConfig;
}

export interface AppDatabaseSnapshot {
  version: string;
  exportedAt: string;
  rooms: Room[];
  bills: BillRecord[];
  tenantHistory: TenantHistoryEntry[];
  settings: AppSettings;
}

