import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  withGlow?: boolean;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  withGlow = false,
  className = '',
}) => {
  const dimensions = {
    sm: 'w-11 h-11 rounded-xl',
    md: 'w-16 h-16 rounded-2xl',
    lg: 'w-24 h-24 rounded-[26px]',
    xl: 'w-28 h-28 rounded-[30px]',
  }[size];

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {withGlow && (
        <div
          className="absolute -inset-4 rounded-full bg-amber-500/25 blur-2xl pointer-events-none"
          aria-hidden="true"
        />
      )}
      <div
        className={`relative ${dimensions} bg-[#080B10] p-1.5 shadow-2xl border border-slate-800/80 flex items-center justify-center overflow-hidden`}
      >
        <div className="w-full h-full rounded-[inherit] bg-gradient-to-b from-[#1E2532] via-[#11151D] to-[#07090D] border border-white/10 flex flex-col items-center justify-center relative">
          <svg
            viewBox="0 0 120 120"
            className="w-full h-full"
            fill="none"
            aria-label="4Rent Logo"
          >
            <defs>
              <linearGradient
                id="logoGold"
                x1="24"
                y1="20"
                x2="70"
                y2="75"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#FDE047" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#B45309" />
              </linearGradient>
              <linearGradient
                id="logoSilver"
                x1="55"
                y1="26"
                x2="92"
                y2="80"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#F8FAFC" />
                <stop offset="100%" stopColor="#94A3B8" />
              </linearGradient>
            </defs>
            {/* Golden '4' Left Roof & Vertical Stem */}
            <path
              d="M58 24 L28 58 H62"
              stroke="url(#logoGold)"
              strokeWidth="6.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M58 24 V72"
              stroke="url(#logoGold)"
              strokeWidth="6.5"
              strokeLinecap="round"
            />
            {/* Right House Roof & Wall */}
            <path
              d="M58 24 L86 50 V72"
              stroke="url(#logoSilver)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* 4-Pane Window */}
            <rect x="65" y="49" width="5.5" height="5.5" rx="1" fill="#F59E0B" />
            <rect x="72.5" y="49" width="5.5" height="5.5" rx="1" fill="#F59E0B" />
            <rect x="65" y="56.5" width="5.5" height="5.5" rx="1" fill="#F59E0B" />
            <rect x="72.5" y="56.5" width="5.5" height="5.5" rx="1" fill="#F59E0B" />
            {/* 4Rent Wordmark */}
            <text
              x="60"
              y="95"
              textAnchor="middle"
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight="700"
              fontSize="20"
              letterSpacing="0.4"
            >
              <tspan fill="#F59E0B">4</tspan>
              <tspan fill="#E2E8F0">Rent</tspan>
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
};

