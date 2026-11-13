import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Fingerprint,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { registerDeviceBiometrics } from '../../services/authService';
import { SecurityConfig } from '../../types/rental';
import { PinKeypad } from './PinKeypad';

interface SecuritySetupScreenProps {
  onComplete: (config: SecurityConfig) => void;
}

export const SecuritySetupScreen: React.FC<SecuritySetupScreenProps> = ({
  onComplete,
}) => {
  const [mode, setMode] = useState<'menu' | 'fingerprint_scan' | 'pin'>('menu');
  const [pinStep, setPinStep] = useState<'create' | 'confirm'>('create');
  const [firstPin, setFirstPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRegisteringBio, setIsRegisteringBio] = useState(false);
  const [bioSuccess, setBioSuccess] = useState(false);
  const [enrolledCredentialId, setEnrolledCredentialId] = useState<string | null>(
    null
  );

  const handleRegisterFingerprint = async () => {
    setErrorMessage(null);
    setMode('fingerprint_scan');
    setIsRegisteringBio(true);

    const res = await registerDeviceBiometrics();
    setIsRegisteringBio(false);

    if (res.ok && res.credentialId) {
      setBioSuccess(true);
      setEnrolledCredentialId(res.credentialId);
      setTimeout(() => {
        // Require a custom backup PIN instead of falling back to a hardcoded PIN
        setBioSuccess(false);
        setMode('pin');
        setPinStep('create');
        setFirstPin('');
        setCurrentPin('');
      }, 650);
    } else {
      setErrorMessage(res.message);
    }
  };

  const handleDigitPress = (digit: string) => {
    setErrorMessage(null);
    if (currentPin.length >= 4) return;
    const next = currentPin + digit;
    setCurrentPin(next);

    if (next.length === 4) {
      setTimeout(() => {
        if (pinStep === 'create') {
          setFirstPin(next);
          setCurrentPin('');
          setPinStep('confirm');
        } else {
          if (next === firstPin) {
            onComplete({
              isSetupComplete: true,
              lockEnabled: true,
              authMethod: enrolledCredentialId ? 'both' : 'pin',
              pinCode: next,
              ...(enrolledCredentialId
                ? { webAuthnCredentialId: enrolledCredentialId }
                : {}),
            });
          } else {
            setErrorMessage('PIN codes did not match. Please try again.');
            setPinStep('create');
            setFirstPin('');
            setCurrentPin('');
          }
        }
      }, 180);
    }
  };

  const handleBackspace = () => {
    setCurrentPin((prev) => prev.slice(0, -1));
  };

  return (
    <div className="min-h-screen w-full bg-[#090D14] text-slate-100 flex flex-col items-center justify-between px-4 sm:px-6 py-8 sm:py-10 select-none">
      <div className="w-full max-w-md flex flex-col items-center pt-2 sm:pt-4">
        <BrandLogo size="xl" withGlow className="mb-5 sm:mb-6" />

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white text-center">
          {mode === 'menu'
            ? 'Security Setup'
            : mode === 'fingerprint_scan'
              ? 'Biometric Setup'
              : pinStep === 'create'
                ? 'Create 4-Digit PIN'
                : 'Confirm 4-Digit PIN'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 text-center mt-2 max-w-xs leading-relaxed">
          {mode === 'menu'
            ? 'Protect records with Biometrics and a 4-digit PIN.'
            : mode === 'fingerprint_scan'
              ? 'Complete your device prompt to enroll biometrics.'
              : pinStep === 'create'
                ? 'Enter a 4-digit PIN to secure your account.'
                : 'Re-enter your 4-digit PIN to confirm.'}
        </p>

        {errorMessage && (
          <div className="mt-4 w-full rounded-xl bg-red-500/15 border border-red-500/35 p-3 text-xs text-red-300 text-center">
            {errorMessage}
          </div>
        )}
      </div>

      {mode === 'menu' ? (
        <div className="w-full max-w-md space-y-3.5 my-auto py-6">
          <button
            type="button"
            disabled={isRegisteringBio}
            onClick={handleRegisterFingerprint}
            className="w-full text-left rounded-2xl bg-[#151C2A] hover:bg-[#1C2538] active:scale-[0.99] border border-amber-500/35 p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 transition shadow-lg cursor-pointer group"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
              <Fingerprint className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base sm:text-lg font-extrabold text-white group-hover:text-amber-400 transition">
                  Set Up Biometrics + PIN
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Enroll Fingerprint / Windows Hello plus a 4-digit backup PIN.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setMode('pin');
              setPinStep('create');
              setCurrentPin('');
            }}
            className="w-full text-left rounded-2xl bg-[#151C2A] hover:bg-[#1C2538] active:scale-[0.99] border border-[#243047] p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 transition shadow-lg cursor-pointer group"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#1F293D] border border-amber-500/20 flex items-center justify-center shrink-0">
              <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-black text-xs tracking-tighter font-mono-num">
                1234
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base sm:text-lg font-extrabold text-white group-hover:text-amber-400 transition">
                Create Passcode PIN Only
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Choose a 4-digit PIN now — you can set up Biometrics later in Settings.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition shrink-0" />
          </button>
        </div>
      ) : mode === 'fingerprint_scan' ? (
        <div className="w-full max-w-sm my-auto py-8 flex flex-col items-center text-center">
          <button
            type="button"
            onClick={handleRegisterFingerprint}
            className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-[36px] flex items-center justify-center transition-all cursor-pointer ${
              bioSuccess
                ? 'bg-emerald-500/20 border-2 border-emerald-400 shadow-[0_0_40px_rgba(16,185,129,0.35)]'
                : 'bg-[#151D2C] border-2 border-amber-500/60 shadow-[0_0_40px_rgba(245,158,11,0.28)] active:scale-95'
            }`}
          >
            {isRegisteringBio && (
              <div className="absolute -inset-2.5 rounded-[42px] border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
            )}
            {bioSuccess ? (
              <CheckCircle2 className="w-14 h-14 sm:w-16 sm:h-16 text-emerald-400" />
            ) : (
              <Fingerprint
                className={`w-14 h-14 sm:w-16 sm:h-16 text-amber-400 ${
                  isRegisteringBio ? 'animate-pulse' : ''
                }`}
              />
            )}
          </button>

          <div className="mt-6 text-sm font-bold text-white">
            {bioSuccess
              ? 'Biometrics Verified & Registered!'
              : isRegisteringBio
                ? 'Scanning Device Biometrics...'
                : 'Tap Biometric Sensor to Retry'}
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Complete the biometric prompt, or go back to create a PIN and enable Biometrics in Settings.
          </p>

          <button
            type="button"
            onClick={() => {
              setMode('menu');
              setErrorMessage(null);
            }}
            className="mt-6 px-4 py-2 rounded-xl bg-[#161E2E] border border-[#26324A] text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
          >
            Back to Security Options
          </button>
        </div>
      ) : (
        <div className="w-full max-w-xs my-auto py-4 flex flex-col items-center">
          <PinKeypad
            pinLength={currentPin.length}
            onDigit={handleDigitPress}
            onBackspace={handleBackspace}
            onBack={() => {
              setMode('menu');
              setCurrentPin('');
              setErrorMessage(null);
            }}
            enableKeyboard
          />
        </div>
      )}

      {/* Mandatory Security Badge */}
      <div className="w-full max-w-md flex flex-col items-center gap-1.5 pt-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#131A27] border border-[#222E44] text-[11px] font-semibold text-slate-400">
          <Lock className="w-3.5 h-3.5 text-amber-400" />
          <span>Mandatory Landlord Authentication Required</span>
        </div>
        <span className="text-[10px] text-slate-500 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          4Rent Management System v1.0.0 • RA 10173 Data Privacy Protected
        </span>
      </div>
    </div>
  );
};
