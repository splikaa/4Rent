import React, { useState } from 'react';
import { ChevronRight, Delete, Fingerprint, ShieldCheck, X } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { registerDeviceBiometrics } from '../../services/ocrService';
import { SecurityConfig } from '../../types/rental';

interface SecuritySetupScreenProps {
  onComplete: (config: SecurityConfig) => void;
}

export const SecuritySetupScreen: React.FC<SecuritySetupScreenProps> = ({
  onComplete,
}) => {
  const [mode, setMode] = useState<'menu' | 'pin'>('menu');
  const [pinStep, setPinStep] = useState<'create' | 'confirm'>('create');
  const [firstPin, setFirstPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRegisteringBio, setIsRegisteringBio] = useState(false);

  const handleRegisterFingerprint = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsRegisteringBio(true);
    const res = await registerDeviceBiometrics();
    setIsRegisteringBio(false);

    if (res.ok) {
      onComplete({
        isSetupComplete: true,
        lockEnabled: true,
        authMethod: 'fingerprint',
        webAuthnCredentialId: res.credentialId,
      });
    } else {
      // Allow fallback or simulated biometric registration if desktop has no hardware sensor
      setErrorMessage(
        `${res.message} You can create a 4-digit Passcode PIN instead or enable simulated biometric lock.`
      );
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
              authMethod: 'pin',
              pinCode: next,
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

  const handleSkipSecurity = () => {
    onComplete({
      isSetupComplete: true,
      lockEnabled: false,
      authMethod: 'none',
    });
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0E14] text-slate-100 flex flex-col items-center justify-between px-6 py-12 select-none">
      <div className="w-full max-w-md flex flex-col items-center pt-6">
        <BrandLogo size="xl" withGlow className="mb-7" />

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white text-center">
          {mode === 'menu'
            ? 'Setup Security'
            : pinStep === 'create'
            ? 'Create Passcode PIN'
            : 'Confirm Passcode PIN'}
        </h1>
        <p className="text-sm sm:text-base text-slate-400 text-center mt-2.5 max-w-xs">
          {mode === 'menu'
            ? 'Choose how you want to protect your application'
            : pinStep === 'create'
            ? 'Enter a secure 4-digit numeric code to unlock 4Rent'
            : 'Re-enter your 4-digit PIN to confirm'}
        </p>

        {errorMessage && (
          <div className="mt-5 w-full rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-300 text-center">
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={() =>
                onComplete({
                  isSetupComplete: true,
                  lockEnabled: true,
                  authMethod: 'fingerprint',
                  webAuthnCredentialId: 'simulated-biometric-id',
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-semibold text-xs hover:bg-amber-400 transition cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Continue with Biometric Profile
            </button>
          </div>
        )}

        {statusMessage && (
          <div className="mt-5 w-full rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300 text-center">
            {statusMessage}
          </div>
        )}
      </div>

      {mode === 'menu' ? (
        <div className="w-full max-w-md space-y-4 my-auto py-8">
          {/* Card 1: Register Fingerprint (Matches Screenshot 1) */}
          <button
            type="button"
            disabled={isRegisteringBio}
            onClick={handleRegisterFingerprint}
            className="w-full text-left rounded-2xl bg-[#161C28] hover:bg-[#1C2433] active:scale-[0.99] border border-[#242E42] p-5 flex items-center gap-4 transition shadow-lg cursor-pointer group"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#25282A] border border-amber-500/20 flex items-center justify-center shrink-0">
              <Fingerprint className="w-7 h-7 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base sm:text-lg font-bold text-white group-hover:text-amber-400 transition">
                {isRegisteringBio ? 'Scanning Biometrics...' : 'Register Fingerprint'}
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5 leading-relaxed">
                Authenticate instantly using your device biometrics.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition shrink-0" />
          </button>

          {/* Card 2: Create Passcode PIN (Matches Screenshot 1) */}
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setMode('pin');
              setPinStep('create');
              setCurrentPin('');
            }}
            className="w-full text-left rounded-2xl bg-[#161C28] hover:bg-[#1C2433] active:scale-[0.99] border border-[#242E42] p-5 flex items-center gap-4 transition shadow-lg cursor-pointer group"
          >
            <div className="w-14 h-14 rounded-2xl bg-[#25282A] border border-amber-500/20 flex items-center justify-center shrink-0">
              <span className="px-2 py-1 rounded-md bg-amber-500 text-slate-950 font-extrabold text-xs tracking-tighter font-mono-num">
                123
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base sm:text-lg font-bold text-white group-hover:text-amber-400 transition">
                Create Passcode PIN
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5 leading-relaxed">
                Choose a secure 4-digit numeric code to unlock.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition shrink-0" />
          </button>
        </div>
      ) : (
        <div className="w-full max-w-xs my-auto py-4 flex flex-col items-center">
          {/* 4-dot indicator */}
          <div className="flex items-center gap-4 mb-8">
            {[0, 1, 2, 3].map((idx) => {
              const filled = currentPin.length > idx;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full transition-all duration-150 ${
                    filled
                      ? 'bg-amber-500 scale-110 shadow-[0_0_12px_rgba(245,158,11,0.7)]'
                      : 'bg-slate-800 border border-slate-600'
                  }`}
                />
              );
            })}
          </div>

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-3.5 w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigitPress(digit)}
                className="h-16 rounded-2xl bg-[#161C28] hover:bg-[#1F2737] active:bg-amber-500 active:text-slate-950 border border-[#242E42] text-xl font-bold text-white transition flex items-center justify-center cursor-pointer"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setMode('menu');
                setCurrentPin('');
              }}
              className="h-16 rounded-2xl bg-[#161C28]/60 hover:bg-[#1F2737] border border-[#242E42] text-xs font-semibold text-slate-400 hover:text-white transition flex items-center justify-center gap-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
              Back
            </button>
            <button
              type="button"
              onClick={() => handleDigitPress('0')}
              className="h-16 rounded-2xl bg-[#161C28] hover:bg-[#1F2737] active:bg-amber-500 active:text-slate-950 border border-[#242E42] text-xl font-bold text-white transition flex items-center justify-center cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              aria-label="Backspace"
              className="h-16 rounded-2xl bg-[#161C28]/60 hover:bg-[#1F2737] border border-[#242E42] text-slate-300 hover:text-white transition flex items-center justify-center cursor-pointer"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-md flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={handleSkipSecurity}
          className="text-xs sm:text-sm text-slate-500 hover:text-amber-400 transition py-2 px-4 cursor-pointer"
        >
          Continue without lock screen (Can be changed in Settings)
        </button>
      </div>
    </div>
  );
};

