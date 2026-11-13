import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Lock, Settings, ShieldAlert, X } from 'lucide-react';
import { SecurityConfig } from '../../types/rental';
import {
  hasBiometricEnrollment,
  isDeviceBiometricsAvailable,
  verifyDeviceBiometrics,
} from '../../services/authService';
import { PinKeypad } from '../security/PinKeypad';

interface PinAuthModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  security: SecurityConfig;
  onClose: () => void;
  onAuthorized: () => void;
  onGoToSettings?: () => void;
}

export const PinAuthModal: React.FC<PinAuthModalProps> = ({
  isOpen,
  title = 'Biometrics / PIN Verification',
  description = 'Authenticate with Biometrics or your 4-digit security PIN to confirm this action.',
  security,
  onClose,
  onAuthorized,
  onGoToSettings,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isScanningBio, setIsScanningBio] = useState(false);
  const [bioUnavailableNote, setBioUnavailableNote] = useState<string | null>(null);

  const hasBioEnrolled = hasBiometricEnrollment(security.webAuthnCredentialId);

  const handleBiometricVerify = useCallback(async () => {
    if (isScanningBio) return;
    setError(null);
    if (!hasBioEnrolled) {
      setError(
        'Biometrics is not set up yet. Set up Biometrics in Settings or enter your 4-digit PIN below.'
      );
      return;
    }
    setIsScanningBio(true);
    const res = await verifyDeviceBiometrics(security.webAuthnCredentialId);
    setIsScanningBio(false);
    if (res.ok) {
      setPin('');
      onAuthorized();
      onClose();
    } else {
      setError(res.message || 'Biometric check failed. Please enter your 4-digit PIN.');
    }
  }, [hasBioEnrolled, isScanningBio, onAuthorized, onClose, security.webAuthnCredentialId]);

  useEffect(() => {
    if (!isOpen) return;
    setPin('');
    setError(null);
    setBioUnavailableNote(null);

    let active = true;
    isDeviceBiometricsAvailable().then((info) => {
      if (!active) return;
      if (!info.supported && info.reason) {
        setBioUnavailableNote(info.reason);
      }
    });

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);

    return () => {
      active = false;
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-sm rounded-2xl sm:rounded-3xl bg-[#151B26] border border-[#28334A] p-5 sm:p-6 shadow-2xl select-none animate-modal-pop my-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-white leading-snug">{title}</h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-snug">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPin('');
              setError(null);
              onClose();
            }}
            aria-label="Close security modal"
            className="w-8 h-8 rounded-xl bg-[#0E131C] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!security.pinCode && (
          <div className="mb-3 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-[11px] text-amber-300 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>No Landlord PIN configured. Set a custom PIN in Settings.</span>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-xs text-red-300 text-center">
            {error}
          </div>
        )}

        {hasBioEnrolled ? (
          <button
            type="button"
            onClick={handleBiometricVerify}
            disabled={isScanningBio}
            className="w-full mb-2 py-2.5 px-4 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <Fingerprint className={`w-4 h-4 ${isScanningBio ? 'animate-pulse' : ''}`} />
            <span>
              {isScanningBio ? 'Verifying Biometrics...' : 'Authenticate with Biometrics'}
            </span>
          </button>
        ) : (
          <div className="mb-2 rounded-2xl bg-[#0E131C] border border-[#243047] p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300 min-w-0">
              <Fingerprint className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-white leading-tight">Biometrics Not Set Up</p>
                <p className="text-[10px] text-slate-400 leading-snug">
                  {bioUnavailableNote || 'Set up Biometrics in Settings or enter PIN below.'}
                </p>
              </div>
            </div>
            {onGoToSettings && (
              <button
                type="button"
                onClick={() => {
                  setPin('');
                  setError(null);
                  onClose();
                  onGoToSettings();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-[11px] font-bold text-amber-300 flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Settings className="w-3 h-3" />
                <span>Setup in Settings</span>
              </button>
            )}
          </div>
        )}

        <PinKeypad
          compact
          pinLength={pin.length}
          onDigit={handleDigit}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
          onBiometricPress={handleBiometricVerify}
          biometricActive={hasBioEnrolled}
          enableKeyboard={isOpen}
        />
      </div>
    </div>
  );
};
