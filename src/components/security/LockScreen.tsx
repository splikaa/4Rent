import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Lock, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { SecurityConfig } from '../../types/rental';
import {
  hasBiometricEnrollment,
  isDeviceBiometricsAvailable,
  verifyDeviceBiometrics,
} from '../../services/authService';
import { PinKeypad } from './PinKeypad';

interface LockScreenProps {
  security: SecurityConfig;
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ security, onUnlock }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [bioSupportReason, setBioSupportReason] = useState<string | null>(null);

  const hasBioEnrolled = hasBiometricEnrollment(security.webAuthnCredentialId);

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

  const handleBiometricUnlock = useCallback(async () => {
    if (isScanning) return;
    setError(null);
    if (!hasBioEnrolled) {
      setError(
        'Biometrics is not set up yet. Unlock with your 4-digit PIN and configure Biometrics in Settings.'
      );
      return;
    }
    setIsScanning(true);

    const res = await verifyDeviceBiometrics(security.webAuthnCredentialId);
    setIsScanning(false);
    if (res.ok) {
      onUnlock();
    } else {
      setError(res.message);
    }
  }, [hasBioEnrolled, isScanning, onUnlock, security.webAuthnCredentialId]);

  useEffect(() => {
    let active = true;
    isDeviceBiometricsAvailable().then((info) => {
      if (active && !info.supported && info.reason) {
        setBioSupportReason(info.reason);
      }
    });
    if (
      hasBioEnrolled &&
      (security.authMethod === 'fingerprint' || security.authMethod === 'both')
    ) {
      const t = setTimeout(() => {
        handleBiometricUnlock();
      }, 300);
      return () => {
        active = false;
        clearTimeout(t);
      };
    }
    return () => {
      active = false;
    };
  }, [hasBioEnrolled, security.authMethod]);

  return (
    <div className="min-h-screen w-full bg-[#090D14] text-slate-100 flex flex-col items-center justify-between px-4 sm:px-6 py-8 sm:py-10 select-none">
      <div className="flex flex-col items-center pt-2 sm:pt-4">
        <BrandLogo size="lg" withGlow className="mb-4 sm:mb-5" />
        <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight text-center">
          4Rent
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1.5 text-center max-w-xs">
          Unlock with Biometrics or your 4-digit PIN
        </p>

        {error && (
          <div className="mt-4 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/35 text-xs text-red-300 text-center max-w-xs">
            {error}
          </div>
        )}
      </div>

      <div className="w-full max-w-xs my-auto py-4 flex flex-col items-center">
        {hasBioEnrolled ? (
          <div className="mb-5 flex flex-col items-center">
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
            <span className="text-[11px] font-bold text-amber-400 mt-2.5 text-center">
              {isScanning
                ? 'Verifying Device Biometrics...'
                : 'Tap to Unlock with Biometrics'}
            </span>
          </div>
        ) : (
          <div className="mb-5 w-full rounded-2xl bg-[#111827] border border-[#243047] px-3.5 py-2.5 flex items-center gap-2.5 text-left">
            <Fingerprint className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-white">Biometrics Not Set Up</p>
              <p className="text-[11px] text-slate-400 leading-snug">
                {bioSupportReason ||
                  'Unlock with your 4-digit PIN, then enable Biometrics in Settings.'}
              </p>
            </div>
          </div>
        )}

        <PinKeypad
          pinLength={pin.length}
          onDigit={handleDigit}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
          onBiometricPress={handleBiometricUnlock}
          biometricActive={hasBioEnrolled}
          enableKeyboard
        />
      </div>

      {/* Mandatory Security Footer */}
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
