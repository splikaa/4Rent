import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CheckSquare,
  DoorOpen,
  Lock,
  Save,
  Shield,
  ShieldCheck,
  User,
  X,
  Zap,
} from 'lucide-react';
import { Room } from '../../types/rental';
import {
  clampDueDayOneToTen,
  formatPeso,
  formatPhoneNumber,
  getNextDueDateInOneToTenWindow,
} from '../../utils/billingCalculator';

interface RoomFormModalProps {
  isOpen: boolean;
  initialRoom?: Room | null;
  defaultRent: number;
  globalElectricRate: number; // Strictly controlled from Settings
  onClose: () => void;
  onSave: (
    roomData: Omit<Room, 'id' | 'updatedAt'>,
    existingId?: string,
    vacatedReason?: string
  ) => void;
}

export const RoomFormModal: React.FC<RoomFormModalProps> = ({
  isOpen,
  initialRoom,
  defaultRent,
  globalElectricRate,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [monthlyRent, setMonthlyRent] = useState(String(defaultRent));
  const [lastMeterReading, setLastMeterReading] = useState('0');
  const [status, setStatus] = useState<'occupied' | 'vacant'>('occupied');
  const [unpaidBalance, setUnpaidBalance] = useState('0');
  const [requiredSecurityDeposit, setRequiredSecurityDeposit] = useState(
    String(defaultRent)
  );
  const [amountDepositPaidByTenant, setAmountDepositPaidByTenant] = useState(
    String(defaultRent)
  );
  const [advanceRent, setAdvanceRent] = useState('0');
  const [vacatedReason, setVacatedReason] = useState(
    'Stopped Paying Rent / Vacated'
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Tenant details + Landlord Safety & Tenant Privacy Consent
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [messengerUsername, setMessengerUsername] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [validIdVerified, setValidIdVerified] = useState(true);
  const [privacyConsentSigned, setPrivacyConsentSigned] = useState(true);
  const [moveInDate, setMoveInDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dueDayOfMonth, setDueDayOfMonth] = useState('5'); // Strictly 1 to 10

  useEffect(() => {
    setFormError(null);
    if (initialRoom) {
      setName(initialRoom.name);
      setMonthlyRent(String(initialRoom.monthlyRent));
      setLastMeterReading(String(initialRoom.lastMeterReading));
      setStatus(initialRoom.status);
      setUnpaidBalance(String(initialRoom.unpaidBalance || 0));
      const reqDep =
        initialRoom.securityDeposit > 0
          ? initialRoom.securityDeposit
          : initialRoom.monthlyRent || defaultRent;
      setRequiredSecurityDeposit(String(reqDep));
      setAmountDepositPaidByTenant(String(reqDep));
      setAdvanceRent(String(initialRoom.advanceRent || 0));
      setTenantName(initialRoom.tenant?.fullName || '');
      setTenantPhone(formatPhoneNumber(initialRoom.tenant?.phone || ''));
      setMessengerUsername(initialRoom.tenant?.messengerUsername || '');
      setEmergencyContact(initialRoom.tenant?.emergencyContact || '');
      setValidIdVerified(initialRoom.tenant?.validIdVerified ?? true);
      setPrivacyConsentSigned(initialRoom.tenant?.privacyConsentSigned ?? true);
      setMoveInDate(
        initialRoom.tenant?.moveInDate || new Date().toISOString().slice(0, 10)
      );
      setDueDayOfMonth(
        String(clampDueDayOneToTen(initialRoom.tenant?.dueDayOfMonth || 5))
      );
    } else {
      const todayIso = new Date().toISOString().slice(0, 10);
      const autoDay = clampDueDayOneToTen(new Date().getDate());
      setName('');
      setMonthlyRent(String(defaultRent));
      setLastMeterReading('0');
      setStatus('occupied');
      setUnpaidBalance('0');
      setRequiredSecurityDeposit(String(defaultRent));
      setAmountDepositPaidByTenant(String(defaultRent));
      setAdvanceRent('0');
      setTenantName('');
      setTenantPhone('');
      setMessengerUsername('');
      setEmergencyContact('');
      setValidIdVerified(true);
      setPrivacyConsentSigned(true);
      setMoveInDate(todayIso);
      setDueDayOfMonth(String(autoDay));
    }
  }, [initialRoom, defaultRent, isOpen]);

  if (!isOpen) return null;

  const reqDepNum = Math.max(0, parseFloat(requiredSecurityDeposit) || 0);
  const paidDepNum = Math.max(0, parseFloat(amountDepositPaidByTenant) || 0);
  const excessDepositToAdvance =
    paidDepNum > reqDepNum
      ? Math.round((paidDepNum - reqDepNum) * 100) / 100
      : 0;

  const safeDueDay = clampDueDayOneToTen(parseInt(dueDayOfMonth, 10) || 5);
  const nextMonthDueDateIso = getNextDueDateInOneToTenWindow(
    safeDueDay,
    moveInDate
  );
  const nextMonthDueDateFormatted = new Date(
    nextMonthDueDateIso
  ).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleMoveInDateChange = (newDate: string) => {
    setMoveInDate(newDate);
    if (newDate) {
      const d = new Date(newDate);
      if (!Number.isNaN(d.getTime())) {
        setDueDayOfMonth(String(clampDueDayOneToTen(d.getDate())));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) return;

    if (reqDepNum <= 0) {
      setFormError(
        'A Security Deposit (> ₱0.00) is required for every apartment room.'
      );
      return;
    }

    const baseAdvance =
      status === 'occupied' ? Math.max(0, parseFloat(advanceRent) || 0) : 0;
    const totalAdvance =
      status === 'occupied'
        ? Math.round((baseAdvance + excessDepositToAdvance) * 100) / 100
        : 0;

    const nowIso = new Date().toISOString();
    const prevAdvanceHistory = initialRoom?.advanceHistory || [];
    const updatedAdvanceHistory =
      status === 'occupied' && excessDepositToAdvance > 0
        ? [
            {
              id: `adv-${Date.now()}`,
              type: 'overpayment_credit' as const,
              amount: excessDepositToAdvance,
              createdAt: nowIso,
              note: `Tenant paid ${formatPeso(
                paidDepNum
              )} for required deposit ${formatPeso(
                reqDepNum
              )} (+${formatPeso(
                excessDepositToAdvance
              )} to Advance Balance)`,
            },
            ...prevAdvanceHistory,
          ]
        : status === 'occupied'
        ? prevAdvanceHistory
        : [];

    const roomPayload: Omit<Room, 'id' | 'updatedAt'> = {
      name: name.trim(),
      monthlyRent: Math.max(0, parseFloat(monthlyRent) || 0),
      // Continuous physical electric sub-meter kWh reading (never resets on tenant change)
      lastMeterReading: Math.max(0, parseFloat(lastMeterReading) || 0),
      lastMeterPhotoDataUrl: initialRoom?.lastMeterPhotoDataUrl,
      lastReadingDate: initialRoom?.lastReadingDate || nowIso,
      status,
      unpaidBalance:
        status === 'occupied' ? Math.max(0, parseFloat(unpaidBalance) || 0) : 0,
      securityDeposit: reqDepNum,
      advanceRent: totalAdvance,
      advanceHistory: updatedAdvanceHistory,
      activeReceiptId:
        status === 'occupied' ? initialRoom?.activeReceiptId : undefined,
      isArchived: initialRoom?.isArchived,
      tenant:
        status === 'occupied' && tenantName.trim()
          ? {
              id: initialRoom?.tenant?.id || `ten-${Date.now()}`,
              fullName: tenantName.trim(),
              phone: formatPhoneNumber(tenantPhone),
              messengerUsername: messengerUsername.trim() || undefined,
              emergencyContact: emergencyContact.trim() || undefined,
              validIdVerified,
              privacyConsentSigned,
              moveInDate,
              dueDayOfMonth: safeDueDay,
            }
          : undefined,
    };

    onSave(roomPayload, initialRoom?.id, vacatedReason);
    onClose();
  };

  const wasOccupiedNowVacant =
    initialRoom?.status === 'occupied' &&
    initialRoom?.tenant &&
    status === 'vacant';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-[#141B28] border border-[#26334D] shadow-2xl overflow-hidden my-6 animate-modal-pop">
        <div className="flex items-center justify-between px-6 sm:px-7 py-5 bg-[#192233] border-b border-[#26334D]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-white">
                {initialRoom ? `Edit ${initialRoom.name}` : 'Create New Room'}
              </h2>
              <p className="text-xs text-slate-400">
                Required Deposit • Continuous Sub-Meter • Landlord & Tenant
                Protection
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-2xl bg-[#10151F] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 sm:p-7 space-y-6 max-h-[82vh] overflow-y-auto"
        >
          {formError && (
            <div className="rounded-2xl bg-red-500/15 border border-red-500/30 p-3.5 text-xs text-red-300 font-semibold">
              {formError}
            </div>
          )}

          {/* Section 1: Room & Continuous Sub-Meter Configuration */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-3.5">
              <Zap className="w-3.5 h-3.5" />
              Room & Continuous Sub-Meter Configuration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="flex flex-col">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Room Name / Unit Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Room 101"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Occupancy Status
                </label>
                <div className="grid grid-cols-2 gap-2.5 h-11">
                  <button
                    type="button"
                    onClick={() => setStatus('occupied')}
                    className={`rounded-2xl text-xs font-bold border transition cursor-pointer ${
                      status === 'occupied'
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-[#0D121B] text-slate-300 border-[#253148]'
                    }`}
                  >
                    Occupied
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('vacant')}
                    className={`rounded-2xl text-xs font-bold border transition cursor-pointer ${
                      status === 'vacant'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                        : 'bg-[#0D121B] text-slate-300 border-[#253148]'
                    }`}
                  >
                    Vacant
                  </button>
                </div>
              </div>

              <div className="flex flex-col">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Monthly Base Rent (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-400" />
                  Electric Rate (Managed in Settings)
                </label>
                <div className="w-full h-11 rounded-2xl bg-[#0A0E16] border border-[#253148] px-4 text-sm text-amber-400 font-bold font-mono-num flex items-center justify-between">
                  <span>{formatPeso(globalElectricRate)} / kWh</span>
                  <span className="text-[10px] text-slate-500 font-sans">
                    Global Rate
                  </span>
                </div>
              </div>

              <div className="sm:col-span-2 flex flex-col">
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Continuous Sub-Meter Reading (kWh) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={lastMeterReading}
                  onChange={(e) => setLastMeterReading(e.target.value)}
                  className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm text-amber-400 font-bold font-mono-num focus:border-amber-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Continues across tenant changes without resetting to 0.
                </span>
              </div>
            </div>
          </div>

          {wasOccupiedNowVacant && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-2.5">
              <p className="text-xs font-bold text-amber-300">
                Tenant "{initialRoom?.tenant?.fullName}" will be automatically
                archived to Previous Tenant History!
              </p>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">
                  Reason for Vacating / Turning Vacant:
                </label>
                <select
                  value={vacatedReason}
                  onChange={(e) => setVacatedReason(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#0D121B] border border-amber-500/40 px-3 text-xs font-bold text-white"
                >
                  <option value="Stopped Paying Rent / Vacated">
                    Stopped Paying Rent / Vacated
                  </option>
                  <option value="Completed Lease (Moved Out)">
                    Completed Lease (Moved Out)
                  </option>
                  <option value="Transferred to Another Room">
                    Transferred to Another Room
                  </option>
                </select>
              </div>
            </div>
          )}

          {/* Section 2: Required Deposit & Overpayment -> Advance Balance */}
          <div className="pt-4 border-t border-[#222E44]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-3.5">
              <Shield className="w-3.5 h-3.5" />
              {status === 'occupied'
                ? 'Required Security Deposit & Withdrawable Advance Balance'
                : 'Required Security Deposit for Room'}
            </h3>
            <div
              className={`grid grid-cols-1 ${
                status === 'occupied' ? 'sm:grid-cols-3' : 'sm:grid-cols-1'
              } gap-4 items-start`}
            >
              <div className="flex flex-col">
                <label className="block text-xs font-bold text-emerald-400 mb-1.5 whitespace-nowrap">
                  Required Deposit (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={requiredSecurityDeposit}
                  onChange={(e) => setRequiredSecurityDeposit(e.target.value)}
                  className="w-full h-11 rounded-2xl bg-[#0D121B] border border-emerald-500/40 px-4 text-sm text-emerald-400 font-bold font-mono-num focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {status === 'occupied' && (
                <>
                  <div className="flex flex-col">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                      Deposit Paid (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={amountDepositPaidByTenant}
                      onChange={(e) =>
                        setAmountDepositPaidByTenant(e.target.value)
                      }
                      className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm text-white font-bold font-mono-num focus:border-amber-500 focus:outline-none"
                    />
                    {excessDepositToAdvance > 0 && (
                      <span className="text-[10px] text-emerald-400 font-semibold block mt-1">
                        +{formatPeso(excessDepositToAdvance)} credited to
                        Advance!
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5 whitespace-nowrap">
                      Advance Balance (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={advanceRent}
                      onChange={(e) => setAdvanceRent(e.target.value)}
                      className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm text-emerald-400 font-bold font-mono-num focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 3: Tenant Profile, Landlord Safety & Tenant Privacy Consent */}
          {status === 'occupied' && (
            <div className="pt-4 border-t border-[#222E44] space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Tenant Profile, Safety Verification & Payment Window (Day 1–10)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div className="flex flex-col">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tenant Full Name *
                  </label>
                  <input
                    type="text"
                    required={status === 'occupied'}
                    placeholder="e.g., Juan Dela Cruz"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Mobile Phone Number (Auto-Formatted)
                  </label>
                  <input
                    type="tel"
                    placeholder="0917-555-0101"
                    value={tenantPhone}
                    onChange={(e) =>
                      setTenantPhone(formatPhoneNumber(e.target.value))
                    }
                    className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Facebook Messenger Username
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., juandelacruz"
                    value={messengerUsername}
                    onChange={(e) => setMessengerUsername(e.target.value)}
                    className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Emergency Contact (Landlord Safety)
                  </label>
                  <input
                    type="text"
                    placeholder="Name & Emergency Phone"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  <div className="flex flex-col">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Move-In Date
                    </label>
                    <input
                      type="date"
                      value={moveInDate}
                      onChange={(e) => handleMoveInDateChange(e.target.value)}
                      className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-3.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col">
                    <label className="block text-xs font-bold text-amber-400 mb-1.5">
                      Pay Day (Day 1 to 10) *
                    </label>
                    <select
                      value={dueDayOfMonth}
                      onChange={(e) => setDueDayOfMonth(e.target.value)}
                      className="w-full h-11 rounded-2xl bg-[#0D121B] border border-amber-500/40 px-3.5 text-xs font-bold text-amber-400 focus:border-amber-500 focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                        <option key={d} value={d}>
                          Day {d} of Month
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Landlord Safety & Tenant Privacy Checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setValidIdVerified((v) => !v)}
                  className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition cursor-pointer ${
                    validIdVerified
                      ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                      : 'bg-[#0D121B] border-[#253148] text-slate-400'
                  }`}
                >
                  <CheckSquare className="w-4 h-4 shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold block">
                      Tenant Valid ID Verified
                    </span>
                    <span className="text-[10px] opacity-80">
                      Landlord safety identity check
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPrivacyConsentSigned((v) => !v)}
                  className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition cursor-pointer ${
                    privacyConsentSigned
                      ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                      : 'bg-[#0D121B] border-[#253148] text-slate-400'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold block">
                      Data Privacy & Lease Consent
                    </span>
                    <span className="text-[10px] opacity-80">
                      RA 10173 tenant data protection
                    </span>
                  </div>
                </button>
              </div>

              <div className="rounded-2xl bg-[#0D121B] border border-amber-500/30 px-4 py-3 flex items-center justify-between text-xs">
                <span className="text-slate-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  Auto-Scheduled Next Month Payment Due Date (1 to 10 Window):
                </span>
                <span className="font-bold text-amber-400">
                  {nextMonthDueDateFormatted} (Day {safeDueDay})
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#222E44]">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-2xl bg-[#1C2434] hover:bg-[#242E42] text-slate-300 font-semibold text-sm cursor-pointer btn-fluid"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-3 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer btn-fluid"
            >
              <Save className="w-4 h-4" />
              <span>{initialRoom ? 'Save Changes' : 'Create Room'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
