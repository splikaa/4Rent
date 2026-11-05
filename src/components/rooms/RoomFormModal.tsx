import React, { useEffect, useState } from 'react';
import { DoorOpen, Lock, Save, Shield, User, X, Zap } from 'lucide-react';
import { Room } from '../../types/rental';
import {
  clampDueDayOneToTen,
  formatPeso,
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
  const [floorOrUnit, setFloorOrUnit] = useState('');
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

  // Tenant details
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [messengerUsername, setMessengerUsername] = useState('');
  const [moveInDate, setMoveInDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dueDayOfMonth, setDueDayOfMonth] = useState('5'); // Strictly 1 to 10
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setFormError(null);
    if (initialRoom) {
      setName(initialRoom.name);
      setFloorOrUnit(initialRoom.floorOrUnit || '');
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
      setTenantPhone(initialRoom.tenant?.phone || '');
      setMessengerUsername(initialRoom.tenant?.messengerUsername || '');
      setMoveInDate(
        initialRoom.tenant?.moveInDate || new Date().toISOString().slice(0, 10)
      );
      setDueDayOfMonth(
        String(clampDueDayOneToTen(initialRoom.tenant?.dueDayOfMonth || 5))
      );
      setNotes(initialRoom.tenant?.notes || '');
    } else {
      setName('');
      setFloorOrUnit('');
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
      setMoveInDate(new Date().toISOString().slice(0, 10));
      setDueDayOfMonth('5');
      setNotes('');
    }
  }, [initialRoom, defaultRent, isOpen]);

  if (!isOpen) return null;

  const reqDepNum = Math.max(0, parseFloat(requiredSecurityDeposit) || 0);
  const paidDepNum = Math.max(0, parseFloat(amountDepositPaidByTenant) || 0);
  const excessDepositToAdvance =
    paidDepNum > reqDepNum
      ? Math.round((paidDepNum - reqDepNum) * 100) / 100
      : 0;

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

    const baseAdvance = Math.max(0, parseFloat(advanceRent) || 0);
    const totalAdvance =
      Math.round((baseAdvance + excessDepositToAdvance) * 100) / 100;

    const nowIso = new Date().toISOString();
    const prevAdvanceHistory = initialRoom?.advanceHistory || [];
    const updatedAdvanceHistory =
      excessDepositToAdvance > 0
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
        : prevAdvanceHistory;

    const roomPayload: Omit<Room, 'id' | 'updatedAt'> = {
      name: name.trim(),
      floorOrUnit: floorOrUnit.trim() || undefined,
      monthlyRent: Math.max(0, parseFloat(monthlyRent) || 0),
      // Note: lastMeterReading continues even if tenant changes or room becomes vacant!
      lastMeterReading: Math.max(0, parseFloat(lastMeterReading) || 0),
      lastMeterPhotoDataUrl: initialRoom?.lastMeterPhotoDataUrl,
      lastReadingDate: initialRoom?.lastReadingDate || nowIso,
      status,
      unpaidBalance: Math.max(0, parseFloat(unpaidBalance) || 0),
      securityDeposit: reqDepNum,
      advanceRent: totalAdvance,
      advanceHistory: updatedAdvanceHistory,
      activeReceiptId: initialRoom?.activeReceiptId,
      isArchived: initialRoom?.isArchived,
      tenant:
        status === 'occupied' && tenantName.trim()
          ? {
              id: initialRoom?.tenant?.id || `ten-${Date.now()}`,
              fullName: tenantName.trim(),
              phone: tenantPhone.trim(),
              messengerUsername: messengerUsername.trim() || undefined,
              moveInDate,
              dueDayOfMonth: clampDueDayOneToTen(parseInt(dueDayOfMonth, 10)),
              notes: notes.trim() || undefined,
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
      <div className="w-full max-w-2xl rounded-3xl bg-[#151B26] border border-[#263147] shadow-2xl overflow-hidden my-6">
        <div className="flex items-center justify-between px-6 py-4 bg-[#1A2232] border-b border-[#263147]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {initialRoom ? `Edit ${initialRoom.name}` : 'Create New Room'}
              </h2>
              <p className="text-xs text-slate-400">
                Required Deposit • Continuous kWh Sub-Meter • 1st–10th Monthly
                Payment Schedule
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-[#10151F] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-5 max-h-[82vh] overflow-y-auto"
        >
          {formError && (
            <div className="rounded-xl bg-red-500/15 border border-red-500/30 p-3 text-xs text-red-300 font-semibold">
              {formError}
            </div>
          )}

          {/* Section 1: Room & Continuous Sub-Meter Configuration */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-3">
              <Zap className="w-3.5 h-3.5" />
              Room & Continuous Sub-Meter Configuration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Room Name / Unit Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Room 101"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Floor / Unit Description
                </label>
                <input
                  type="text"
                  placeholder="e.g., 1st Floor • Studio Unit"
                  value={floorOrUnit}
                  onChange={(e) => setFloorOrUnit(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Monthly Base Rent (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={monthlyRent}
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-400" />
                  Electric Sub-Meter Rate (Managed in Settings)
                </label>
                <div className="w-full rounded-xl bg-[#0B0E14] border border-[#252F42] px-3.5 py-2.5 text-sm text-amber-400 font-bold font-mono-num flex items-center justify-between">
                  <span>{formatPeso(globalElectricRate)} / kWh</span>
                  <span className="text-[10px] text-slate-500 font-sans">
                    Global Rate
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Continuous Sub-Meter Reading (kWh) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={lastMeterReading}
                  onChange={(e) => setLastMeterReading(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-amber-400 font-bold font-mono-num focus:border-amber-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Continues across tenant changes without resetting to 0.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Occupancy Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus('occupied')}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      status === 'occupied'
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-[#0E131C] text-slate-300 border-[#252F42]'
                    }`}
                  >
                    Occupied
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('vacant')}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      status === 'vacant'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                        : 'bg-[#0E131C] text-slate-300 border-[#252F42]'
                    }`}
                  >
                    Vacant
                  </button>
                </div>
              </div>
            </div>
          </div>

          {wasOccupiedNowVacant && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-2">
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
                  className="w-full rounded-xl bg-[#0E131C] border border-amber-500/40 px-3 py-2 text-xs font-bold text-white"
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
          <div className="pt-3 border-t border-[#222C3F]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-3">
              <Shield className="w-3.5 h-3.5" />
              Required Security Deposit & Withdrawable Advance Balance
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-emerald-400 mb-1">
                  Required Room Deposit (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={requiredSecurityDeposit}
                  onChange={(e) => setRequiredSecurityDeposit(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-emerald-500/40 px-3.5 py-2.5 text-sm text-emerald-400 font-bold font-mono-num focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Deposit Amount Paid by Tenant (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={amountDepositPaidByTenant}
                  onChange={(e) => setAmountDepositPaidByTenant(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white font-bold font-mono-num focus:border-amber-500 focus:outline-none"
                />
                {excessDepositToAdvance > 0 && (
                  <span className="text-[10px] text-emerald-400 font-semibold block mt-0.5">
                    +{formatPeso(excessDepositToAdvance)} excess goes to Advance
                    Balance!
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Existing Advance Balance (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={advanceRent}
                  onChange={(e) => setAdvanceRent(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-emerald-400 font-bold font-mono-num focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Tenant Profile & Mandatory 1–10 Due Date */}
          {status === 'occupied' && (
            <div className="pt-3 border-t border-[#222C3F]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5 mb-3">
                <User className="w-3.5 h-3.5" />
                Tenant Profile & Mandatory 1st–10th Monthly Payment Window
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tenant Full Name *
                  </label>
                  <input
                    type="text"
                    required={status === 'occupied'}
                    placeholder="e.g., Juan Dela Cruz"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mobile Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 0917-555-0101"
                    value={tenantPhone}
                    onChange={(e) => setTenantPhone(e.target.value)}
                    className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Facebook Messenger Username
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., juandelacruz"
                    value={messengerUsername}
                    onChange={(e) => setMessengerUsername(e.target.value)}
                    className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Move-In Date
                    </label>
                    <input
                      type="date"
                      value={moveInDate}
                      onChange={(e) => setMoveInDate(e.target.value)}
                      className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3 py-2.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-400 mb-1">
                      Pay Day (1–10) *
                    </label>
                    <select
                      value={dueDayOfMonth}
                      onChange={(e) => setDueDayOfMonth(e.target.value)}
                      className="w-full rounded-xl bg-[#0E131C] border border-amber-500/40 px-2.5 py-2.5 text-xs font-bold text-amber-400"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                        <option key={d} value={d}>
                          Every Day {d} (1st–10th)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222C3F]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[#1C2434] hover:bg-[#242E42] text-slate-300 font-semibold text-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-bold text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
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
