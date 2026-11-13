import React, { useEffect } from 'react';
import { Delete, Fingerprint } from 'lucide-react';

interface PinKeypadProps {
  pinLength: number;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
  onBiometricPress?: () => void;
  biometricActive?: boolean;
  onBack?: () => void;
  enableKeyboard?: boolean;
  compact?: boolean;
}

/**
 * Shared 4-dot PIN indicator and touch/keyboard numeric keypad used across all PIN gates.
 */
export const PinKeypad: React.FC<PinKeypadProps> = ({
  pinLength,
  onDigit,
  onBackspace,
  onClear,
  onBiometricPress,
  biometricActive = false,
  onBack,
  enableKeyboard = true,
  compact = false,
}) => {
  useEffect(() => {
    if (!enableKeyboard) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        onDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onBackspace();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboard, onDigit, onBackspace]);

  const keyHeight = compact ? 'h-12 sm:h-13' : 'h-14 sm:h-16';
  const gridGap = compact ? 'gap-2 sm:gap-2.5' : 'gap-3 sm:gap-3.5';

  return (
    <div className="w-full flex flex-col items-center">
      <div className={`flex items-center justify-center gap-4 ${compact ? 'my-4' : 'mb-6'}`}>
        {[0, 1, 2, 3].map((idx) => {
          const filled = pinLength > idx;
          return (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full transition-all duration-150 ${
                filled
                  ? 'bg-amber-500 scale-110 shadow-[0_0_12px_rgba(245,158,11,0.7)]'
                  : 'bg-[#0D1119] border border-slate-600'
              }`}
            />
          );
        })}
      </div>

      <div className={`grid grid-cols-3 ${gridGap} w-full`}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => onDigit(digit)}
            className={`${keyHeight} rounded-2xl bg-[#161C28] hover:bg-[#1F2737] active:bg-amber-500 active:text-slate-950 border border-[#242E42] text-lg sm:text-xl font-bold text-white transition flex items-center justify-center cursor-pointer`}
          >
            {digit}
          </button>
        ))}

        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={`${keyHeight} rounded-2xl bg-[#161C28]/70 hover:bg-[#1F2737] border border-[#242E42] text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer`}
          >
            Back
          </button>
        ) : onBiometricPress ? (
          <button
            type="button"
            onClick={onBiometricPress}
            title={
              biometricActive
                ? 'Verify with Biometrics'
                : 'Biometrics not set up yet'
            }
            aria-label="Authenticate with Biometrics"
            className={`${keyHeight} rounded-2xl ${
              biometricActive
                ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/35 text-amber-400'
                : 'bg-[#161C28]/70 hover:bg-[#1F2737] border-[#242E42] text-slate-400 hover:text-amber-300'
            } border flex items-center justify-center transition cursor-pointer`}
          >
            <Fingerprint className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onClear}
            className={`${keyHeight} rounded-2xl bg-[#161C28]/70 hover:bg-[#1F2737] border border-[#242E42] text-xs font-semibold text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer`}
          >
            Clear
          </button>
        )}

        <button
          type="button"
          onClick={() => onDigit('0')}
          className={`${keyHeight} rounded-2xl bg-[#161C28] hover:bg-[#1F2737] active:bg-amber-500 active:text-slate-950 border border-[#242E42] text-lg sm:text-xl font-bold text-white transition flex items-center justify-center cursor-pointer`}
        >
          0
        </button>

        <button
          type="button"
          onClick={onBackspace}
          aria-label="Backspace"
          className={`${keyHeight} rounded-2xl bg-[#161C28]/70 hover:bg-[#1F2737] border border-[#242E42] text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer`}
        >
          <Delete className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
