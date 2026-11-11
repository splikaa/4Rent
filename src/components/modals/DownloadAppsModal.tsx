import React, { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderArchive,
  Laptop,
  QrCode,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { isMobileDevice } from '../../utils/billingCalculator';

interface DownloadAppsModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyCode?: string;
  canInstallPwa?: boolean;
  onInstallPwa?: () => void;
}

export const DownloadAppsModal: React.FC<DownloadAppsModalProps> = ({
  isOpen,
  onClose,
  propertyCode = '4RENT-MAIN',
  canInstallPwa = false,
  onInstallPwa,
}) => {
  const [copiedExeLink, setCopiedExeLink] = useState(false);
  const [copiedZipLink, setCopiedZipLink] = useState(false);
  const [copiedApkLink, setCopiedApkLink] = useState(false);
  const [copiedPairLink, setCopiedPairLink] = useState(false);
  const [activeTab, setActiveTab] = useState<'downloads' | 'instructions'>(
    'downloads'
  );
  const isMobile = isMobileDevice();

  if (!isOpen) return null;

  const baseUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '');
  const zipUrl = `${baseUrl}/4Rent-Desktop-Windows.zip`;
  const exeUrl = `${baseUrl}/4Rent-Launcher.exe`;
  const apkUrl = `${baseUrl}/4Rent-v1.0.0-release.apk`;
  const pairUrl = `${baseUrl}/?prop=${encodeURIComponent(propertyCode)}`;

  const copyToClipboard = async (
    text: string,
    setCopied: (v: boolean) => void
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      // Ignore copy error
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div
        className="relative w-full max-w-2xl bg-[#0F1522] border border-[#243147] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-view-enter text-slate-100"
      >
        {/* Header Bar */}
        <div className="relative px-6 py-5 bg-gradient-to-r from-[#172033] via-[#1A2438] to-[#121927] border-b border-[#243147] flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <BrandLogo size="sm" className="shadow-lg shadow-amber-500/20" />
            <div>
              <h2
                id="download-modal-title"
                className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2"
              >
                <span>{isMobile ? 'Download 4Rent Mobile App' : 'Download 4Rent System Apps'}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold tracking-wider uppercase border border-amber-500/40">
                  Official
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isMobile
                  ? 'Official Android Package (.apk) with live Sub-Meter OCR camera'
                  : 'Zero-install Windows Desktop Launcher & Offline Android Package'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close download modal"
            className="w-9 h-9 rounded-xl bg-[#1C263A] hover:bg-[#25334D] text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#202B3E] bg-[#0C111B] px-6">
          <button
            type="button"
            onClick={() => setActiveTab('downloads')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'downloads'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Direct Downloads</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('instructions')}
            className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'instructions'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Install & Pairing Guide</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {activeTab === 'downloads' ? (
            <>
              {/* Option 1: 1-Click Native Desktop App (Zero Download • Zero Warnings - Desktop Only) */}
              {!isMobile && canInstallPwa && onInstallPwa && (
                <div className="rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#1A2438] to-[#121B2B] border border-amber-500/40 p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/40 shadow-inner">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-white text-base">
                          1-Click Desktop App (Instant Install)
                        </h3>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/40">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        Directly installs 4Rent to your Windows Desktop &amp; Start Menu. No files to download, zero security warnings, and opens in a dedicated window!
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onInstallPwa}
                    className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition cursor-pointer active:scale-95 shrink-0"
                  >
                    <Sparkles className="w-4 h-4 fill-slate-950" />
                    <span>Install 4Rent Desktop</span>
                  </button>
                </div>
              )}

              {/* Windows Desktop Launcher Card (Desktop Browsers Only) */}
              {!isMobile && (
                <div className="rounded-2xl bg-gradient-to-br from-[#141C2B] to-[#101724] border border-[#26354D] p-5 shadow-lg relative overflow-hidden group hover:border-amber-500/50 transition duration-300">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
                        <Laptop className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-extrabold text-white text-base">
                            4Rent Windows Desktop Launcher
                          </h3>
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                            .ZIP / .EXE
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-[#1E293B] text-slate-400 text-[10px] font-semibold">
                            ~44 KB
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">
                          Zero-installation standalone desktop window with official system icon and shortcut pinner.
                        </p>

                        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                          <li className="flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Fullscreen borderless window host</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Auto pins desktop shortcut with icon</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Multi-User Property Code support</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Works on Windows 10 &amp; 11 (x64/x86)</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Download Options */}
                  <div className="mt-4 pt-4 border-t border-[#1E293B] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-[11px] font-mono text-slate-400 truncate max-w-xs">
                        Package: <span className="text-amber-300">4Rent-Desktop-Windows.zip</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={zipUrl}
                          download="4Rent-Desktop-Windows.zip"
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/25 transition cursor-pointer active:scale-95"
                        >
                          <FolderArchive className="w-4 h-4" />
                          <span>Download Portable (.ZIP)</span>
                        </a>

                        <a
                          href={exeUrl}
                          download="4Rent-Launcher.exe"
                          className="px-3.5 py-2 rounded-xl bg-[#1A2438] hover:bg-[#22304A] border border-[#2E3F5C] text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                          title="Direct executable file"
                        >
                          <Laptop className="w-3.5 h-3.5 text-slate-400" />
                          <span>Direct .EXE</span>
                        </a>
                      </div>
                    </div>

                    {/* Chrome Safe Browsing Guidance Notice */}
                    <div className="rounded-xl bg-[#141B28] border border-amber-500/25 p-3 text-[11px] text-slate-300 leading-relaxed flex items-start gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-amber-300">
                          Why does Chrome say &quot;This file isn&apos;t commonly downloaded&quot;?
                        </strong>
                        <p className="mt-0.5 text-slate-300">
                          Google Chrome automatically shows this standard precaution for newly uploaded <code className="text-amber-300">.exe</code> files from GitHub until they reach high global download counts.
                        </p>
                        <p className="mt-1 text-slate-200">
                          👉 <strong>To proceed:</strong> Click <strong className="text-amber-300">&quot;Download suspicious file&quot;</strong> in Chrome, or use the <strong className="text-white">Portable (.ZIP)</strong> button above which downloads cleanly with zero prompts.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Android Mobile App Card */}
              <div className="rounded-2xl bg-gradient-to-br from-[#141C2B] to-[#101724] border border-[#26354D] p-5 shadow-lg relative overflow-hidden group hover:border-emerald-500/50 transition duration-300">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0 shadow-inner">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-extrabold text-white text-base">
                          4Rent Android Mobile App
                        </h3>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold">
                          .APK
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#1E293B] text-slate-400 text-[10px] font-semibold">
                          ~272 KB
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        High-speed mobile client with real-time green Sub-Meter viewfinder and 1-tap Messenger forwarding.
                      </p>

                      <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                        <li className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>Live camera viewfinder with green lock</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>Direct Messenger image receipt sharing</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>Offline-first database (IndexedDB)</span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>Requires Android 7.0+ (ARM64/x86)</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[11px] font-mono text-slate-400 truncate max-w-xs">
                    File: <span className="text-slate-200">4Rent-v1.0.0-release.apk</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(apkUrl, setCopiedApkLink)}
                      className="px-3 py-2 rounded-xl bg-[#1A2438] hover:bg-[#22304A] border border-[#2E3F5C] text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedApkLink ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>

                    <a
                      href={apkUrl}
                      download="4Rent-v1.0.0-release.apk"
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition cursor-pointer active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download .APK</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* 1-Click Multi-Device Pairing Bar */}
              <div className="rounded-2xl bg-[#0D121B] border border-[#232F45] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      Current Property Code: <span className="text-amber-400 font-mono">{propertyCode}</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Syncs data between your desktop launcher and mobile app automatically.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(pairUrl, setCopiedPairLink)}
                  className="px-3 py-2 rounded-xl bg-[#162031] hover:bg-[#1E2B42] border border-[#2A3B57] text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  {copiedPairLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Pair Link Copied</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Copy Pairing Link</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Instructions Tab */
            <div className="space-y-4 text-xs">
              <div className="rounded-2xl bg-[#131B29] border border-[#243147] p-4">
                <div className="font-bold text-amber-400 text-sm flex items-center gap-2 mb-2">
                  <Laptop className="w-4 h-4" />
                  <span>How to Run the Windows Desktop Launcher</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 text-xs leading-relaxed">
                  <li>
                    Click <strong className="text-white">Download Portable (.ZIP)</strong> above for an instant, warning-free download, or click <strong className="text-white">Download .EXE</strong>.
                  </li>
                  <li>
                    If downloading the raw .EXE, Chrome may show a standard safety prompt (&quot;This file isn&apos;t commonly downloaded&quot;). Simply click <strong className="text-amber-300">&quot;Download suspicious file&quot;</strong> to complete the download.
                  </li>
                  <li>
                    Extract the ZIP (or place the .EXE anywhere on your PC) — zero installation is required.
                  </li>
                  <li>
                    Double-click <code className="text-amber-300">4Rent-Launcher.exe</code>. If Windows SmartScreen appears on first run, click <strong className="text-white">More info &gt; Run anyway</strong>.
                  </li>
                  <li>
                    Enter your <strong className="text-white">Property Space Code</strong> (default: <code className="text-amber-300">{propertyCode}</code>).
                  </li>
                  <li>
                    Click <strong className="text-amber-400">LAUNCH 4RENT STANDALONE DESKTOP APP</strong> to open in dedicated window mode, or click <strong className="text-slate-200">Pin to Desktop</strong> to save a permanent shortcut!
                  </li>
                </ol>
              </div>

              <div className="rounded-2xl bg-[#131B29] border border-[#243147] p-4">
                <div className="font-bold text-emerald-400 text-sm flex items-center gap-2 mb-2">
                  <Smartphone className="w-4 h-4" />
                  <span>How to Install the Android Mobile App</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300 text-xs leading-relaxed">
                  <li>
                    Download <code className="text-emerald-300">4Rent-v1.0.0-release.apk</code> directly on your Android phone.
                  </li>
                  <li>
                    When download finishes, tap the notification or open your device <strong className="text-white">Files / Downloads</strong> app and tap the APK file.
                  </li>
                  <li>
                    If prompted, allow <strong className="text-white">Install unknown apps</strong> for your browser or file manager.
                  </li>
                  <li>
                    Tap <strong className="text-emerald-400">Install</strong> and open the app.
                  </li>
                  <li>
                    Grant camera permission when prompted to enable the live Sub-Meter OCR scanner.
                  </li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[#0C111B] border-t border-[#202B3E] flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Official 4Rent Builds • Verified &amp; Signed</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#1A2334] hover:bg-[#233047] border border-[#2C3B54] text-xs font-bold text-slate-200 hover:text-white transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
