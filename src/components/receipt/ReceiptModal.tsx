import React, { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageCircle,
  Moon,
  Printer,
  ShieldCheck,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { AppSettings, BillRecord } from '../../types/rental';
import {
  formatMessengerBillSummary,
  formatPeso,
} from '../../utils/billingCalculator';
import { generateSimulatedSubMeterDataUrl } from '../../services/ocrService';

interface ReceiptModalProps {
  bill: BillRecord | null;
  settings: AppSettings;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  bill,
  settings,
  onClose,
}) => {
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const [receiptTheme, setReceiptTheme] = useState<'dark' | 'light'>('dark');
  const [isExporting, setIsExporting] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Ensure both Sub-Meter #1 (Previous) and Sub-Meter #2 (Current) always have clear visual proof images
  const prevMeterProofImg = useMemo(() => {
    if (!bill) return '';
    return (
      bill.prevMeterPhotoDataUrl ||
      generateSimulatedSubMeterDataUrl(bill.prevReading)
    );
  }, [bill?.prevMeterPhotoDataUrl, bill?.prevReading]);

  const currMeterProofImg = useMemo(() => {
    if (!bill) return '';
    return (
      bill.meterPhotoDataUrl ||
      generateSimulatedSubMeterDataUrl(bill.currReading)
    );
  }, [bill?.meterPhotoDataUrl, bill?.currReading]);

  if (!bill) return null;

  const generateReceiptPngDataUrl = async (): Promise<string | null> => {
    if (!receiptRef.current) return null;
    try {
      setIsExporting(true);
      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        pixelRatio: 2.5,
        backgroundColor: receiptTheme === 'dark' ? '#0D121B' : '#FFFFFF',
      });
      return dataUrl;
    } catch {
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPng = async () => {
    setShareFeedback(null);
    const dataUrl = await generateReceiptPngDataUrl();
    if (!dataUrl) {
      setShareFeedback('Could not generate image. Use Print / PDF instead.');
      return;
    }
    const link = document.createElement('a');
    link.download = `4Rent-Receipt-${bill.roomName.replace(/\s+/g, '-')}-${
      bill.receiptNo
    }.png`;
    link.href = dataUrl;
    link.click();
    setShareFeedback('Official Receipt PNG downloaded!');
  };

  const handleCopySummary = async () => {
    const summary = formatMessengerBillSummary(bill, settings.apartmentName);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      const ta = document.createElement('textarea');
      ta.value = summary;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedText(true);
    setShareFeedback(
      'Formatted bill summary copied! Ready to paste into Messenger.'
    );
    setTimeout(() => setCopiedText(false), 3000);
  };

  const handleShareToMessenger = async () => {
    setShareFeedback(null);
    const summary = formatMessengerBillSummary(bill, settings.apartmentName);

    try {
      await navigator.clipboard.writeText(summary);
    } catch {
      // ignore clipboard restriction
    }

    const dataUrl = await generateReceiptPngDataUrl();
    if (dataUrl && navigator.share) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `4Rent-${bill.receiptNo}.png`, {
          type: 'image/png',
        });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `${settings.apartmentName} • ${bill.roomName} Official Receipt`,
            text: summary,
            files: [file],
          });
          setShareFeedback('Shared receipt image & summary via system share!');
          return;
        }
      } catch {
        // Fallback to direct Messenger link + download below
      }
    }

    if (dataUrl) {
      const link = document.createElement('a');
      link.download = `4Rent-Receipt-${bill.receiptNo}.png`;
      link.href = dataUrl;
      link.click();
    }

    const messengerTarget = bill.tenantMessenger?.trim()
      ? `https://m.me/${bill.tenantMessenger.trim()}`
      : 'https://www.messenger.com/';

    window.open(messengerTarget, '_blank', 'noopener,noreferrer');
    setShareFeedback(
      'Receipt PNG downloaded & Bill Summary copied! Paste (Ctrl+V / Cmd+V) and attach the image in Messenger.'
    );
  };

  const isDark = receiptTheme === 'dark';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-3xl bg-[#131924] border border-[#263147] shadow-2xl overflow-hidden my-auto flex flex-col max-h-[95vh]">
        {/* Top Action Header */}
        <div className="no-print flex items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-[#18202F] border-b border-[#263147] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm sm:text-base font-extrabold text-white">
              Official Printable Receipt
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono-num font-bold">
              {bill.receiptNo}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setReceiptTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
              }
              className="px-2.5 py-1.5 rounded-xl bg-[#0F141E] hover:bg-[#1E2738] border border-[#28334A] text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition cursor-pointer"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Paper White</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span>4Rent Dark</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-[#0F141E] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {shareFeedback && (
          <div className="no-print mx-4 mt-2.5 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between shrink-0">
            <span>{shareFeedback}</span>
            <button
              type="button"
              onClick={() => setShareFeedback(null)}
              className="text-emerald-400 hover:text-white ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Scrollable Receipt Body • Organized & Perfectly Proportioned */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 flex justify-center">
          <div
            id="printable-receipt-area"
            ref={receiptRef}
            className={`w-full rounded-2xl p-4 sm:p-5 border shadow-xl transition my-auto ${
              isDark
                ? 'bg-[#0D121B] text-slate-100 border-[#253148]'
                : 'bg-white text-slate-900 border-slate-300'
            }`}
          >
            {/* 1. Brand & Status Header */}
            <div className="flex items-center justify-between pb-3 border-b border-dashed border-amber-500/40">
              <div className="flex items-center gap-2.5">
                <BrandLogo size="sm" />
                <div>
                  <h2
                    className={`text-base sm:text-lg font-black tracking-tight leading-tight ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {settings.apartmentName}
                  </h2>
                  <p
                    className={`text-[11px] font-semibold ${
                      isDark ? 'text-amber-400' : 'text-amber-700'
                    }`}
                  >
                    Official Room & Dual Sub-Meter Statement
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider ${
                    bill.status === 'paid'
                      ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
                      : bill.status === 'partial'
                      ? 'bg-amber-500/20 text-amber-500 border border-amber-500/40'
                      : 'bg-red-500/20 text-red-500 border border-red-500/40'
                  }`}
                >
                  {bill.status}
                </span>
                <div
                  className={`text-[10px] font-mono-num mt-0.5 ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Receipt #{bill.receiptNo}
                </div>
              </div>
            </div>

            {/* 2. Room, Tenant & 1st-10th Payment Schedule Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 py-2.5 text-xs border-b border-dashed border-slate-500/30">
              <div>
                <span
                  className={`block text-[10px] uppercase ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Apartment Unit
                </span>
                <strong className="text-xs sm:text-sm font-extrabold">
                  {bill.roomName}
                </strong>
              </div>
              <div>
                <span
                  className={`block text-[10px] uppercase ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Tenant Name
                </span>
                <strong className="text-xs sm:text-sm font-bold truncate block">
                  {bill.tenantName}
                </strong>
              </div>
              <div>
                <span
                  className={`block text-[10px] uppercase ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Billing Period
                </span>
                <span className="font-semibold">{bill.billingPeriod}</span>
              </div>
              <div className="sm:text-right">
                <span
                  className={`block text-[10px] uppercase ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Next Due (Day 1 to 10)
                </span>
                <span className="font-bold font-mono-num text-amber-500">
                  {new Date(bill.dueDate).toLocaleDateString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>

            {/* 3. DUAL SUB-METER VERIFICATION PROOF (2 Sub-Meters Side-by-Side) */}
            <div
              className={`my-3 rounded-xl p-3 border ${
                isDark
                  ? 'bg-[#141C2B] border-amber-500/35'
                  : 'bg-amber-50/75 border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1 ${
                    isDark ? 'text-amber-400' : 'text-amber-800'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Dual Electric Sub-Meter Proof & Difference
                </span>
                <span className="text-[11px] font-mono-num font-bold">
                  Rate: {formatPeso(bill.electricRate)} / kWh
                </span>
              </div>

              {/* 2 Sub-Meter Boxes Side-by-Side */}
              <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                {/* Sub-Meter #1: Previous Reading Proof */}
                <div
                  className={`rounded-lg p-2 border ${
                    isDark
                      ? 'bg-[#0C111A] border-[#25324B]'
                      : 'bg-white border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="font-bold uppercase opacity-75">
                      1. Previous Meter
                    </span>
                    <span className="font-mono-num font-extrabold text-xs">
                      {bill.prevReading.toFixed(1)} kWh
                    </span>
                  </div>
                  {prevMeterProofImg && (
                    <img
                      src={prevMeterProofImg}
                      alt="Previous Sub-Meter Proof"
                      className="w-full h-12 object-contain rounded bg-white border border-slate-400/30"
                    />
                  )}
                </div>

                {/* Sub-Meter #2: Current Reading Proof */}
                <div
                  className={`rounded-lg p-2 border ${
                    isDark
                      ? 'bg-[#0C111A] border-amber-500/50'
                      : 'bg-white border-amber-500'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span
                      className={`font-bold uppercase ${
                        isDark ? 'text-amber-400' : 'text-amber-700'
                      }`}
                    >
                      2. Current Meter
                    </span>
                    <span
                      className={`font-mono-num font-extrabold text-xs ${
                        isDark ? 'text-amber-400' : 'text-amber-700'
                      }`}
                    >
                      {bill.currReading.toFixed(1)} kWh
                    </span>
                  </div>
                  {currMeterProofImg && (
                    <img
                      src={currMeterProofImg}
                      alt="Current Sub-Meter Proof"
                      className="w-full h-12 object-contain rounded bg-white border border-amber-500/40"
                    />
                  )}
                </div>
              </div>

              {/* Difference & Total Computation Bar */}
              <div className="pt-2 border-t border-slate-500/25 flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="font-medium">
                  Difference:{' '}
                  <strong className="font-mono-num">
                    {bill.currReading.toFixed(1)} -{' '}
                    {bill.prevReading.toFixed(1)} ={' '}
                    {bill.consumptionKwh.toFixed(1)} kWh
                  </strong>{' '}
                  × {formatPeso(bill.electricRate)}
                </span>
                <span
                  className={`font-mono-num text-sm font-black ${
                    isDark ? 'text-amber-400' : 'text-amber-800'
                  }`}
                >
                  = {formatPeso(bill.electricTotal)}
                </span>
              </div>
            </div>

            {/* 4. Itemized Financial Summary */}
            <div className="space-y-1.5 text-xs pb-2.5 border-b border-dashed border-slate-500/30">
              <div className="flex justify-between">
                <span>Monthly Apartment Base Rent</span>
                <span className="font-mono-num font-bold">
                  {formatPeso(bill.baseRent)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>
                  Electric Sub-Meter Bill ({bill.consumptionKwh.toFixed(1)} kWh)
                </span>
                <span className="font-mono-num font-bold">
                  {formatPeso(bill.electricTotal)}
                </span>
              </div>
              {bill.securityDepositRequired > 0 && (
                <div className="flex justify-between opacity-80">
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    Required Room Security Deposit (On File)
                  </span>
                  <span className="font-mono-num font-semibold">
                    {formatPeso(bill.securityDepositRequired)}
                  </span>
                </div>
              )}
              {bill.previousBalanceCarryOver > 0 && (
                <div className="flex justify-between text-red-400 font-semibold">
                  <span>Previous Unpaid Balance (Carry-Over)</span>
                  <span className="font-mono-num">
                    {formatPeso(bill.previousBalanceCarryOver)}
                  </span>
                </div>
              )}
              {bill.depositApplied > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>Less Advance / Deposit Credit Applied</span>
                  <span className="font-mono-num">
                    -{formatPeso(bill.depositApplied)}
                  </span>
                </div>
              )}
            </div>

            {/* 5. Grand Total, Amount Paid & Advance Overpayment Credit */}
            <div className="py-2.5 space-y-1 border-b border-dashed border-slate-500/30">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-extrabold uppercase">
                  Total Amount Due
                </span>
                <span
                  className={`text-lg sm:text-xl font-black font-mono-num ${
                    isDark ? 'text-amber-400' : 'text-slate-900'
                  }`}
                >
                  {formatPeso(bill.totalAmountDue)}
                </span>
              </div>

              <div className="flex justify-between text-xs">
                <span>Amount Paid</span>
                <span className="font-mono-num font-bold text-emerald-500">
                  {formatPeso(bill.amountPaid)}
                </span>
              </div>

              <div className="flex justify-between text-xs font-bold">
                <span>Remaining Balance Due</span>
                <span
                  className={`font-mono-num ${
                    bill.remainingBalance > 0
                      ? 'text-red-400'
                      : 'text-emerald-500'
                  }`}
                >
                  {formatPeso(bill.remainingBalance)}
                </span>
              </div>

              {bill.overpaymentToAdvance > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-400 pt-0.5">
                  <span>Excess Credited to Withdrawable Advance Balance</span>
                  <span className="font-mono-num">
                    +{formatPeso(bill.overpaymentToAdvance)}
                  </span>
                </div>
              )}
            </div>

            {/* 6. Footer & Payment Schedule Notice */}
            <div className="pt-2.5 text-[10px] space-y-1 opacity-85">
              <div className="font-semibold text-amber-500">
                Payment Policy: Tenants are required to pay between the 1st and
                10th of every month.
              </div>
              <div className="pt-1 flex items-center justify-between text-[9px] opacity-70 font-mono-num">
                <span>4Rent Official Receipt • Developed by splikaa</span>
                <span>{new Date(bill.createdAt).toLocaleString('en-PH')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Export, Print & Messenger Integration Bar */}
        <div className="no-print px-4 sm:px-5 py-3 bg-[#18202F] border-t border-[#263147] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleShareToMessenger}
            disabled={isExporting}
            className="flex-1 min-w-[180px] py-2.5 px-4 rounded-xl bg-[#0084FF] hover:bg-[#1890FF] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition cursor-pointer"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4 fill-white" />
            )}
            <span>Share Receipt to Messenger</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isExporting}
              className="py-2.5 px-3.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PNG</span>
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="py-2.5 px-3 rounded-xl bg-[#10151F] hover:bg-[#1E2738] border border-[#28334A] text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              {copiedText ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Text</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="py-2.5 px-3 rounded-xl bg-[#10151F] hover:bg-[#1E2738] border border-[#28334A] text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-amber-400" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
