import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  MessageCircle,
  Phone,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { Room, RoomInquiryBooking } from '../../types/rental';
import {
  formatPeso,
  formatPhoneNumber,
  maskPhoneNumber,
} from '../../utils/billingCalculator';

interface InquiriesBookingsViewProps {
  rooms: Room[];
  inquiries: RoomInquiryBooking[];
  defaultDeposit: number;
  privacyMaskEnabled?: boolean;
  onBack: () => void;
  onCreateInquiry: (
    data: Omit<RoomInquiryBooking, 'id' | 'createdAt'>
  ) => void;
  onApproveBookingMoveIn: (inquiry: RoomInquiryBooking) => void;
  onDeleteInquiry: (id: string) => void;
}

export const InquiriesBookingsView: React.FC<InquiriesBookingsViewProps> = ({
  rooms,
  inquiries,
  defaultDeposit,
  privacyMaskEnabled = false,
  onBack,
  onCreateInquiry,
  onApproveBookingMoveIn,
  onDeleteInquiry,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Only Vacant rooms are visible for booking (Occupied rooms are hidden)
  const vacantRooms = rooms.filter(
    (r) => !r.isArchived && r.status === 'vacant'
  );

  const [prospectName, setProspectName] = useState('');
  const [phone, setPhone] = useState('');
  const [messengerUsername, setMessengerUsername] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState(
    vacantRooms[0]?.id || ''
  );
  const [targetMoveInDate, setTargetMoveInDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [reservationFee, setReservationFee] = useState('0');
  const [status, setStatus] = useState<'inquiry' | 'booked'>('booked');

  useEffect(() => {
    if (
      vacantRooms.length > 0 &&
      !vacantRooms.some((r) => r.id === selectedRoomId)
    ) {
      setSelectedRoomId(vacantRooms[0].id);
    }
  }, [vacantRooms.length, selectedRoomId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const room = vacantRooms.find((r) => r.id === selectedRoomId);
    if (!room || !prospectName.trim()) return;

    onCreateInquiry({
      prospectName: prospectName.trim(),
      phone: formatPhoneNumber(phone),
      messengerUsername: messengerUsername.trim() || undefined,
      roomId: room.id,
      roomName: room.name,
      targetMoveInDate,
      reservationFee: Math.max(0, parseFloat(reservationFee) || 0),
      quotedMonthlyRent: room.monthlyRent,
      requiredDeposit: room.securityDeposit || defaultDeposit,
      validIdPresented: true,
      privacyConsentAccepted: true,
      status,
    });

    setProspectName('');
    setPhone('');
    setMessengerUsername('');
    setReservationFee('0');
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-transparent pb-32 animate-view-enter">
      <header className="sticky top-0 z-20 bg-[#111722]/90 backdrop-blur-xl border-b border-[#232E42] px-5 sm:px-8 h-18 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="w-11 h-11 rounded-2xl bg-[#172030] hover:bg-[#1E293D] border border-[#26334B] flex items-center justify-center text-slate-200 transition cursor-pointer btn-fluid"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            Inquiries & Bookings
          </h1>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Vacant Units Only ({vacantRooms.length} Available)
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (vacantRooms.length > 0 && !selectedRoomId) {
              setSelectedRoomId(vacantRooms[0].id);
            }
            setIsModalOpen(true);
          }}
          className="px-4 py-2.5 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer btn-fluid"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Booking</span>
        </button>
      </header>

      <div className="w-full max-w-5xl mx-auto px-5 sm:px-8 pt-8 space-y-6">
        <div className="surface-card rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-white">
              Vacant Room Reservations & Tenant Inquiries
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Only vacant rooms are listed for booking ({vacantRooms.length}{' '}
              available). Convert bookings into active tenants in 1 click while
              preserving continuous kWh sub-meter readings.
            </p>
          </div>
          <span className="text-xs font-mono-num text-amber-400 font-bold shrink-0 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30">
            {inquiries.length} {inquiries.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {inquiries.length === 0 ? (
          <div className="surface-card rounded-3xl py-20 px-6 text-center">
            <CalendarCheck className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h3 className="text-lg sm:text-xl font-extrabold text-white">
              No inquiries or room bookings yet
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-sm mx-auto">
              Log prospective tenants inquiring about available vacant rooms or
              reserve a unit with a booking deposit.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {inquiries.map((inq) => {
              const isConverted = inq.status === 'converted';
              return (
                <div
                  key={inq.id}
                  className="surface-card surface-card-interactive rounded-3xl p-6 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                          Target: {inq.roomName}
                        </span>
                        <h3 className="text-lg sm:text-xl font-extrabold text-white mt-0.5">
                          {inq.prospectName}
                        </h3>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                          isConverted
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                            : inq.status === 'booked'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/35'
                            : 'bg-blue-500/15 text-blue-400 border border-blue-500/35'
                        }`}
                      >
                        {isConverted
                          ? 'Moved In'
                          : inq.status === 'booked'
                          ? 'Reserved / Booked'
                          : 'Inquiry'}
                      </span>
                    </div>

                    <div className="rounded-2xl bg-[#0D121B] border border-[#202B40] p-4 space-y-2 text-xs text-slate-300">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Target Move-In:</span>
                        <span className="font-mono-num font-bold">
                          {inq.targetMoveInDate} (Pays Day 1 to 10)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">
                          Quoted Rent / Req. Deposit:
                        </span>
                        <span className="font-mono-num font-bold text-white">
                          {formatPeso(inq.quotedMonthlyRent)} /{' '}
                          {formatPeso(inq.requiredDeposit)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">
                          Booking Payment:
                        </span>
                        <span className="font-mono-num font-bold text-emerald-400">
                          {formatPeso(inq.reservationFee)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-1.5 border-t border-[#1D273B] text-slate-400">
                        {inq.phone && (
                          <span className="inline-flex items-center gap-1 font-mono-num">
                            <Phone className="w-3.5 h-3.5" />
                            {maskPhoneNumber(inq.phone, privacyMaskEnabled)}
                          </span>
                        )}
                        {inq.messengerUsername && !privacyMaskEnabled && (
                          <a
                            href={`https://m.me/${inq.messengerUsername}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            m.me/{inq.messengerUsername}
                          </a>
                        )}
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Privacy Protected
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-[#222E44] flex items-center justify-between gap-2.5">
                    {!isConverted ? (
                      <button
                        type="button"
                        onClick={() => onApproveBookingMoveIn(inq)}
                        className="flex-1 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer btn-fluid"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Approve & Move-In to {inq.roomName}</span>
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Active Tenant in {inq.roomName}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => onDeleteInquiry(inq.id)}
                      className="p-2.5 rounded-2xl bg-[#1A2334] hover:bg-red-500/20 text-red-400 transition cursor-pointer btn-fluid"
                      title="Remove Inquiry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Inquiry / Booking Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#151B26] border border-[#28334A] p-6 sm:p-7 shadow-2xl animate-modal-pop">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-white">
                Book Vacant Room / Log Inquiry
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {vacantRooms.length === 0 ? (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5 text-center space-y-3">
                <p className="text-xs font-bold text-amber-300">
                  All rooms are currently Occupied!
                </p>
                <p className="text-xs text-slate-400">
                  Occupied rooms are hidden from booking. Create a new room or
                  mark a room as Vacant first to accept new bookings.
                </p>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Select Available Vacant Room *
                  </label>
                  <select
                    required
                    value={selectedRoomId}
                    onChange={(e) => setSelectedRoomId(e.target.value)}
                    className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm font-bold text-white"
                  >
                    {vacantRooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} (VACANT) • Rent: {formatPeso(r.monthlyRent)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Prospective Tenant Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Kevin Mendoza"
                    value={prospectName}
                    onChange={(e) => setProspectName(e.target.value)}
                    className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-sm text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      placeholder="0917-555-0199"
                      value={phone}
                      onChange={(e) =>
                        setPhone(formatPhoneNumber(e.target.value))
                      }
                      className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-3.5 text-xs text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Messenger Username
                    </label>
                    <input
                      type="text"
                      placeholder="username"
                      value={messengerUsername}
                      onChange={(e) => setMessengerUsername(e.target.value)}
                      className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-3.5 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Target Move-In Date
                    </label>
                    <input
                      type="date"
                      value={targetMoveInDate}
                      onChange={(e) => setTargetMoveInDate(e.target.value)}
                      className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-3.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Booking / Advance Paid (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={reservationFee}
                      onChange={(e) => setReservationFee(e.target.value)}
                      className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-3.5 text-xs font-bold text-emerald-400 font-mono-num"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStatus('inquiry')}
                    className={`py-2.5 rounded-2xl text-xs font-bold border cursor-pointer ${
                      status === 'inquiry'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-[#0D121B] text-slate-400 border-[#253148]'
                    }`}
                  >
                    Inquiry Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('booked')}
                    className={`py-2.5 rounded-2xl text-xs font-bold border cursor-pointer ${
                      status === 'booked'
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-[#0D121B] text-slate-400 border-[#253148]'
                    }`}
                  >
                    Reserved / Booked
                  </button>
                </div>

                <div className="flex justify-end gap-2.5 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-2xl bg-[#1D2535] text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 text-xs font-extrabold cursor-pointer btn-fluid"
                  >
                    Save Inquiry / Booking
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
