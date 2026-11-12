import React, { useState } from 'react';
import { Delete, Fingerprint, Lock, ShieldAlert, X } from 'lucide-react';
import { SecurityConfig } from '../../types/rental';
import { verifyDeviceBiometrics } from '../../services/authService';
import { isMobileDevice } from '../../utils/billingCalculator';

interface PinAuthModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  security: SecurityConfig;
  onClose: () => void;
  onAuthorized: () => void;
}

export const PinAuthModal: React.FC<PinAuthModalProps> = ({
  isOpen,
  title = 'Authentication PIN Required',
  description = 'Enter your 4-digit security PIN to confirm removing this room.',
  security,
  onClose,
  onAuthorized,
}) => {
  const isMobile = isMobileDevice();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const expectedPin = security.pinCode;

  const handleDigit = (digit: string) => {
    setError(null);
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);

    if (next.length === 4) {
      setTimeout(() => {
        if (expectedPin && next === expectedPin) {
          setPin('');
          onAuthorized();
          onClose();
        } else {
          setError(
            expectedPin
              ? 'Incorrect 4-digit PIN. Authorization denied.'
              : 'No security PIN configured. Set your PIN in Settings first.'
          );
          setPin('');
        }
      }, 140);
    }
  };

  const handleBiometricVerify = async () => {
    if (!isMobile) return;
    setError(null);
    const res = await verifyDeviceBiometrics(security.webAuthnCredentialId);
    if (res.ok) {
      setPin('');
      onAuthorized();
      onClose();
    } else {
      setError('Biometric check failed. Please enter your 4-digit PIN.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm rounded-3xl bg-[#151B26] border border-[#28334A] p-6 shadow-2xl select-none animate-modal-pop">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">{title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPin('');
              setError(null);
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-[#0E131C] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!security.pinCode && (
          <div className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-[11px] text-amber-300 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>No Landlord PIN configured. Set a custom PIN in Settings.</span>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs text-red-300 text-center">
            {error}
          </div>
        )}

        {isMobile && (
          <button
            type="button"
            onClick={handleBiometricVerify}
            className="w-full mb-4 py-2.5 px-4 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Fingerprint className="w-4 h-4" />
            <span>Authenticate with Fingerprint</span>
          </button>
        )}

        {/* 4-Dot PIN Indicator */}
        <div className="flex items-center justify-center gap-4 my-5">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full transition-all ${
                pin.length > idx
                  ? 'bg-amber-500 scale-110 shadow-[0_0_12px_rgba(245,158,11,0.7)]'
                  : 'bg-[#0D1119] border border-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-13 rounded-2xl bg-[#0E131C] hover:bg-[#1C2434] active:bg-amber-500 active:text-slate-950 border border-[#242E42] text-lg font-bold text-white transition flex items-center justify-center cursor-pointer"
            >
              {d}
            </button>
          ))}
          {isMobile ? (
            <button
              type="button"
              onClick={handleBiometricVerify}
              title="Verify with Fingerprint"
              className="h-13 rounded-2xl bg-[#0E131C] hover:bg-[#1C2434] border border-[#242E42] text-amber-400 flex items-center justify-center transition cursor-pointer"
            >
              <Fingerprint className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPin('')}
              className="h-13 rounded-2xl bg-[#0E131C] hover:bg-[#1C2434] border border-[#242E42] text-xs font-semibold text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-13 rounded-2xl bg-[#0E131C] hover:bg-[#1C2434] active:bg-amber-500 active:text-slate-950 border border-[#242E42] text-lg font-bold text-white transition flex items-center justify-center cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="h-13 rounded-2xl bg-[#0E131C] hover:bg-[#1C2434] border border-[#242E42] text-slate-300 flex items-center justify-center transition cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
