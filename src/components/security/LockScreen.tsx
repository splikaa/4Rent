import React, { useEffect, useState } from 'react';
import { Delete, Fingerprint, Lock, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { SecurityConfig } from '../../types/rental';
import { verifyDeviceBiometrics } from '../../services/authService';
import { isMobileDevice } from '../../utils/billingCalculator';

interface LockScreenProps {
  security: SecurityConfig;
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ security, onUnlock }) => {
  const isMobile = isMobileDevice();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const handleDigit = (digit: string) => {
    setError(null);
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);

    if (next.length === 4) {
      setTimeout(() => {
        if (security.pinCode && next === security.pinCode) {
          onUnlock();
        } else {
          setError(
            security.pinCode
              ? 'Incorrect 4-digit PIN. Please try again.'
              : 'No valid PIN configured. Complete security setup first.'
          );
          setPin('');
        }
      }, 150);
    }
  };

  const handleBiometricUnlock = async () => {
    if (!isMobile || isScanning) return;
    setError(null);
    setIsScanning(true);

    const res = await verifyDeviceBiometrics(security.webAuthnCredentialId);
    setIsScanning(false);
    if (res.ok) {
      onUnlock();
    } else {
      setError(res.message);
    }
  };

  // Automatically trigger Biometric Fingerprint prompt on Mobile when configured
  useEffect(() => {
    if (isMobile && security.authMethod === 'fingerprint') {
      const t = setTimeout(() => {
        handleBiometricUnlock();
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isMobile, security.authMethod]);

  return (
    <div className="min-h-screen w-full bg-[#090D14] text-slate-100 flex flex-col items-center justify-between px-6 py-10 select-none">
      <div className="flex flex-col items-center pt-4">
        <BrandLogo size="lg" withGlow className="mb-5" />
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          4Rent Management System
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1.5 text-center max-w-xs">
          {isMobile
            ? 'Authenticate with your Mobile Fingerprint or 4-Digit Passcode PIN'
            : 'Enter your 4-Digit Landlord Passcode PIN to unlock'}
        </p>

        {error && (
          <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/35 text-xs text-red-300 text-center max-w-xs">
            {error}
          </div>
        )}
      </div>

      <div className="w-full max-w-xs my-auto py-4 flex flex-col items-center">
        {/* Prominent Mobile Fingerprint Biometric Sensor Button (Mobile Devices Only) */}
        {isMobile && (
          <div className="mb-6 flex flex-col items-center">
            <button
              type="button"
              onClick={handleBiometricUnlock}
              disabled={isScanning}
              className="relative w-20 h-20 rounded-3xl bg-[#151D2C] hover:bg-[#1C263B] active:scale-95 border-2 border-amber-500/55 flex items-center justify-center shadow-[0_0_28px_rgba(245,158,11,0.25)] transition cursor-pointer"
            >
              {isScanning && (
                <div className="absolute -inset-2 rounded-[28px] border-2 border-amber-500/25 border-t-amber-400 animate-spin" />
              )}
              <Fingerprint
                className={`w-10 h-10 text-amber-400 ${
                  isScanning ? 'animate-pulse' : ''
                }`}
              />
            </button>
            <span className="text-[11px] font-bold text-amber-400 mt-2.5">
              {isScanning
                ? 'Scanning Fingerprint Sensor...'
                : 'Tap to Unlock with Fingerprint'}
            </span>
          </div>
        )}

        {/* 4-Digit PIN Indicators */}
        <div className="flex items-center gap-4 mb-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full transition-all ${
                pin.length > idx
                  ? 'bg-amber-500 scale-110 shadow-[0_0_12px_rgba(245,158,11,0.7)]'
                  : 'bg-slate-800 border border-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3.5 w-full">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              className="h-15 sm:h-16 rounded-2xl bg-[#161C28] hover:bg-[#1F2737] active:bg-amber-500 active:text-slate-950 border border-[#242E42] text-xl font-bold text-white transition flex items-center justify-center cursor-pointer"
            >
              {d}
            </button>
          ))}
          {isMobile ? (
            <button
              type="button"
              onClick={handleBiometricUnlock}
              title="Biometric Fingerprint Unlock"
              className="h-15 sm:h-16 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-400 flex items-center justify-center transition cursor-pointer"
            >
              <Fingerprint className="w-6 h-6" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPin('')}
              className="h-15 sm:h-16 rounded-2xl bg-[#161C28]/60 hover:bg-[#1F2737] border border-[#242E42] text-xs font-semibold text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-15 sm:h-16 rounded-2xl bg-[#161C28] hover:bg-[#1F2737] active:bg-amber-500 active:text-slate-950 border border-[#242E42] text-xl font-bold text-white transition flex items-center justify-center cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setPin((p) => p.slice(0, -1))}
            aria-label="Backspace"
            className="h-15 sm:h-16 rounded-2xl bg-[#161C28]/60 hover:bg-[#1F2737] border border-[#242E42] text-slate-300 flex items-center justify-center transition cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mandatory Security Footer (Emergency Bypass Removed) */}
      <div className="flex flex-col items-center gap-1 pt-2">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#131A27] border border-[#222E44] text-[11px] font-semibold text-slate-400">
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>Authorized Landlord Access Only</span>
        </div>
        <span className="text-[10px] text-slate-500 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          Protected by 4Rent Security Gate
        </span>
      </div>
    </div>
  );
};
