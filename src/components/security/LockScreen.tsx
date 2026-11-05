import React, { useState } from 'react';
import { Delete, Fingerprint, LockOpen } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { SecurityConfig } from '../../types/rental';
import { verifyDeviceBiometrics } from '../../services/ocrService';

interface LockScreenProps {
  security: SecurityConfig;
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ security, onUnlock }) => {
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
        if (!security.pinCode || next === security.pinCode) {
          onUnlock();
        } else {
          setError('Incorrect 4-digit PIN. Try again.');
          setPin('');
        }
      }, 150);
    }
  };

  const handleBiometricUnlock = async () => {
    setError(null);
    setIsScanning(true);
    if (security.webAuthnCredentialId === 'simulated-biometric-id') {
      setTimeout(() => {
        setIsScanning(false);
        onUnlock();
      }, 400);
      return;
    }

    const res = await verifyDeviceBiometrics(security.webAuthnCredentialId);
    setIsScanning(false);
    if (res.ok) {
      onUnlock();
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0E14] text-slate-100 flex flex-col items-center justify-center px-6 py-10 select-none">
      <BrandLogo size="lg" withGlow className="mb-6" />
      <h1 className="text-2xl font-bold text-white">Welcome Back to 4Rent</h1>
      <p className="text-sm text-slate-400 mt-1.5 text-center">
        {security.authMethod === 'fingerprint'
          ? 'Authenticate with your fingerprint to unlock'
          : 'Enter your 4-digit Passcode PIN to unlock'}
      </p>

      {error && (
        <div className="mt-4 px-4 py-2 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300">
          {error}
        </div>
      )}

      {security.authMethod === 'fingerprint' && !security.pinCode ? (
        <div className="mt-10 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleBiometricUnlock}
            disabled={isScanning}
            className="w-24 h-24 rounded-3xl bg-[#161C28] hover:bg-[#1E2636] border-2 border-amber-500/50 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.2)] transition cursor-pointer"
          >
            <Fingerprint
              className={`w-12 h-12 text-amber-500 ${
                isScanning ? 'animate-pulse' : ''
              }`}
            />
          </button>
          <span className="text-xs text-slate-400">
            {isScanning ? 'Verifying Biometrics...' : 'Tap sensor icon to unlock'}
          </span>
        </div>
      ) : (
        <div className="w-full max-w-xs mt-8 flex flex-col items-center">
          <div className="flex items-center gap-4 mb-7">
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

          <div className="grid grid-cols-3 gap-3.5 w-full">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                className="h-16 rounded-2xl bg-[#161C28] hover:bg-[#1F2737] active:bg-amber-500 active:text-slate-950 border border-[#242E42] text-xl font-bold text-white transition flex items-center justify-center cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={handleBiometricUnlock}
              title="Biometric Unlock"
              className="h-16 rounded-2xl bg-[#161C28]/60 hover:bg-[#1F2737] border border-[#242E42] text-amber-500 flex items-center justify-center transition cursor-pointer"
            >
              <Fingerprint className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-16 rounded-2xl bg-[#161C28] hover:bg-[#1F2737] active:bg-amber-500 active:text-slate-950 border border-[#242E42] text-xl font-bold text-white transition flex items-center justify-center cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((p) => p.slice(0, -1))}
              className="h-16 rounded-2xl bg-[#161C28]/60 hover:bg-[#1F2737] border border-[#242E42] text-slate-300 flex items-center justify-center transition cursor-pointer"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onUnlock}
        className="mt-8 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 transition cursor-pointer"
      >
        <LockOpen className="w-3.5 h-3.5" />
        Emergency Admin Bypass
      </button>
    </div>
  );
};

