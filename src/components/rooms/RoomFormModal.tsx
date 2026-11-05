import React, { useEffect, useState } from 'react';
import { DoorOpen, Save, Shield, User, X, Zap } from 'lucide-react';
import { Room } from '../../types/rental';

interface RoomFormModalProps {
  isOpen: boolean;
  initialRoom?: Room | null;
  defaultRent: number;
  defaultElectricRate: number;
  onClose: () => void;
  onSave: (roomData: Omit<Room, 'id' | 'updatedAt'>, existingId?: string) => void;
}

export const RoomFormModal: React.FC<RoomFormModalProps> = ({
  isOpen,
  initialRoom,
  defaultRent,
  defaultElectricRate,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [floorOrUnit, setFloorOrUnit] = useState('');
  const [monthlyRent, setMonthlyRent] = useState(String(defaultRent));
  const [electricRatePerKwh, setElectricRatePerKwh] = useState(
    String(defaultElectricRate)
  );
  const [lastMeterReading, setLastMeterReading] = useState('0');
  const [status, setStatus] = useState<'occupied' | 'vacant'>('occupied');
  const [unpaidBalance, setUnpaidBalance] = useState('0');
  const [securityDeposit, setSecurityDeposit] = useState('0');
  const [advanceRent, setAdvanceRent] = useState('0');

  // Tenant details
  const [tenantName, setTenantName] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [messengerUsername, setMessengerUsername] = useState('');
  const [moveInDate, setMoveInDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dueDayOfMonth, setDueDayOfMonth] = useState('15');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (initialRoom) {
      setName(initialRoom.name);
      setFloorOrUnit(initialRoom.floorOrUnit || '');
      setMonthlyRent(String(initialRoom.monthlyRent));
      setElectricRatePerKwh(String(initialRoom.electricRatePerKwh));
      setLastMeterReading(String(initialRoom.lastMeterReading));
      setStatus(initialRoom.status);
      setUnpaidBalance(String(initialRoom.unpaidBalance || 0));
      setSecurityDeposit(String(initialRoom.securityDeposit || 0));
      setAdvanceRent(String(initialRoom.advanceRent || 0));
      setTenantName(initialRoom.tenant?.fullName || '');
      setTenantPhone(initialRoom.tenant?.phone || '');
      setMessengerUsername(initialRoom.tenant?.messengerUsername || '');
      setMoveInDate(
        initialRoom.tenant?.moveInDate || new Date().toISOString().slice(0, 10)
      );
      setDueDayOfMonth(String(initialRoom.tenant?.dueDayOfMonth || 15));
      setNotes(initialRoom.tenant?.notes || '');
    } else {
      setName('');
      setFloorOrUnit('');
      setMonthlyRent(String(defaultRent));
      setElectricRatePerKwh(String(defaultElectricRate));
      setLastMeterReading('0');
      setStatus('occupied');
      setUnpaidBalance('0');
      setSecurityDeposit(String(defaultRent));
      setAdvanceRent('0');
      setTenantName('');
      setTenantPhone('');
      setMessengerUsername('');
      setMoveInDate(new Date().toISOString().slice(0, 10));
      setDueDayOfMonth('15');
      setNotes('');
    }
  }, [initialRoom, defaultRent, defaultElectricRate, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const roomPayload: Omit<Room, 'id' | 'updatedAt'> = {
      name: name.trim(),
      floorOrUnit: floorOrUnit.trim() || undefined,
      monthlyRent: Math.max(0, parseFloat(monthlyRent) || 0),
      electricRatePerKwh: Math.max(0, parseFloat(electricRatePerKwh) || 0),
      lastMeterReading: Math.max(0, parseFloat(lastMeterReading) || 0),
      lastReadingDate: new Date().toISOString(),
      status,
      unpaidBalance: Math.max(0, parseFloat(unpaidBalance) || 0),
      securityDeposit: Math.max(0, parseFloat(securityDeposit) || 0),
      advanceRent: Math.max(0, parseFloat(advanceRent) || 0),
      tenant:
        status === 'occupied' && tenantName.trim()
          ? {
              id: initialRoom?.tenant?.id || `ten-${Date.now()}`,
              fullName: tenantName.trim(),
              phone: tenantPhone.trim(),
              messengerUsername: messengerUsername.trim() || undefined,
              moveInDate,
              dueDayOfMonth: Math.min(
                31,
                Math.max(1, parseInt(dueDayOfMonth, 10) || 15)
              ),
              notes: notes.trim() || undefined,
            }
          : undefined,
    };

    onSave(roomPayload, initialRoom?.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-[#151B26] border border-[#263147] shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 bg-[#1A2232] border-b border-[#263147]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {initialRoom ? `Edit ${initialRoom.name}` : 'Add Apartment Room'}
              </h2>
              <p className="text-xs text-slate-400">
                Configure base rent, electric sub-meter baseline, and tenant
                details
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
          className="p-6 space-y-6 max-h-[80vh] overflow-y-auto"
        >
          {/* Section 1: Room & Sub-Meter Configuration */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-3">
              <Zap className="w-3.5 h-3.5" />
              Room & Sub-Meter Baseline
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Electric Sub-Meter Rate (₱ / kWh) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={electricRatePerKwh}
                  onChange={(e) => setElectricRatePerKwh(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Initial / Previous Meter Reading (kWh) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={lastMeterReading}
                  onChange={(e) => setLastMeterReading(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-amber-400 font-bold font-mono-num focus:border-amber-500 focus:outline-none"
                />
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

          {/* Section 2: Balances & Security Deposit */}
          <div className="pt-4 border-t border-[#222C3F]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-3">
              <Shield className="w-3.5 h-3.5" />
              Carry-Over Balance & Security Deposit
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Previous Unpaid Balance (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={unpaidBalance}
                  onChange={(e) => setUnpaidBalance(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-red-400 font-bold font-mono-num focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Security Deposit Held (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={securityDeposit}
                  onChange={(e) => setSecurityDeposit(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-emerald-400 font-bold font-mono-num focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Advance Rent Held (₱)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={advanceRent}
                  onChange={(e) => setAdvanceRent(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Tenant Profile & Messenger Link */}
          {status === 'occupied' && (
            <div className="pt-4 border-t border-[#222C3F]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5 mb-3">
                <User className="w-3.5 h-3.5" />
                Tenant Profile & Messenger Integration
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
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
                    className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Facebook Messenger Username (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., juandelacruz (opens m.me/juandelacruz)"
                    value={messengerUsername}
                    onChange={(e) => setMessengerUsername(e.target.value)}
                    className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
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
                      className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3 py-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Monthly Due Day
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={dueDayOfMonth}
                      onChange={(e) => setDueDayOfMonth(e.target.value)}
                      className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3 py-2.5 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Lease / Contract Notes
                  </label>
                  <input
                    type="text"
                    placeholder="Optional notes about deposit, Wi-Fi inclusion, or payment schedule"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#222C3F]">
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

