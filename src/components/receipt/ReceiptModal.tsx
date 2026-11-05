import React, { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  MessageCircle,
  Printer,
  Share2,
  Sun,
  Moon,
  X,
  Zap,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { AppSettings, BillRecord } from '../../types/rental';
import {
  formatMessengerBillSummary,
  formatPeso,
} from '../../utils/billingCalculator';

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

  if (!bill) return null;

  const generateReceiptPngDataUrl = async (): Promise<string | null> => {
    if (!receiptRef.current) return null;
    try {
      setIsExporting(true);
      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        pixelRatio: 2.5,
        backgroundColor: receiptTheme === 'dark' ? '#0F141E' : '#FFFFFF',
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
      setShareFeedback('Could not generate image. Use Print Receipt instead.');
      return;
    }
    const link = document.createElement('a');
    link.download = `4Rent-Receipt-${bill.roomName.replace(/\s+/g, '-')}-${
      bill.receiptNo
    }.png`;
    link.href = dataUrl;
    link.click();
    setShareFeedback('Receipt PNG downloaded to your device!');
  };

  const handleCopySummary = async () => {
    const summary = formatMessengerBillSummary(
      bill,
      settings.apartmentName,
      settings.paymentInstructions
    );
    await navigator.clipboard.writeText(summary);
    setCopiedText(true);
    setShareFeedback(
      'Bill summary copied! You can paste it directly into Messenger.'
    );
    setTimeout(() => setCopiedText(false), 3000);
  };

  const handleShareToMessenger = async () => {
    setShareFeedback(null);
    const summary = formatMessengerBillSummary(
      bill,
      settings.apartmentName,
      settings.paymentInstructions
    );

    // 1. Always copy the formatted text summary so user can paste immediately
    try {
      await navigator.clipboard.writeText(summary);
    } catch {
      // ignore clipboard error if restricted
    }

    // 2. Try native Web Share API with PNG file (works on Android/iOS mobile browsers to share directly to Messenger app)
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
            title: `${settings.apartmentName} — ${bill.roomName} Bill`,
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

    // 3. Desktop / Fallback: Download the PNG receipt & open Messenger thread (m.me/<username> or messenger.com)
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
      'Receipt PNG downloaded & Bill Summary copied to clipboard! Paste (Ctrl+V) and attach the image in Messenger.'
    );
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const isDark = receiptTheme === 'dark';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-[#141A25] border border-[#263147] shadow-2xl overflow-hidden my-6">
        {/* Top Action Header (hidden when printing) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 px-5 py-4 bg-[#192130] border-b border-[#263147]">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-extrabold text-white">
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
              className="px-3 py-1.5 rounded-xl bg-[#10151F] hover:bg-[#1E2738] border border-[#28334A] text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition cursor-pointer"
              title="Switch receipt style between Dark Digital Card and White Paper Print"
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
              className="w-9 h-9 rounded-xl bg-[#10151F] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {shareFeedback && (
          <div className="no-print mx-5 mt-4 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between">
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

        {/* Receipt Canvas Container */}
        <div className="p-4 sm:p-6 max-h-[72vh] overflow-y-auto flex justify-center">
          <div
            id="printable-receipt-area"
            ref={receiptRef}
            className={`w-full max-w-md rounded-2xl p-6 border shadow-xl transition ${
              isDark
                ? 'bg-[#0F141E] text-slate-100 border-[#26324A]'
                : 'bg-white text-slate-900 border-slate-300'
            }`}
          >
            {/* Receipt Header */}
            <div className="flex items-center justify-between pb-4 border-b border-dashed border-amber-500/40">
              <div className="flex items-center gap-3">
                <BrandLogo size="sm" />
                <div>
                  <h2
                    className={`text-lg font-black tracking-tight ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {settings.apartmentName}
                  </h2>
                  <p
                    className={`text-xs ${
                      isDark ? 'text-amber-400' : 'text-amber-700'
                    } font-semibold`}
                  >
                    Official Rental & Sub-Meter Statement
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`inline-block px-2.5 py-1 rounded-md text-xs font-extrabold uppercase tracking-wider ${
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
                  className={`text-[11px] font-mono-num mt-1 ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  #{bill.receiptNo}
                </div>
              </div>
            </div>

            {/* Tenant & Room Metadata */}
            <div className="grid grid-cols-2 gap-2 py-3.5 text-xs border-b border-dashed border-slate-500/30">
              <div>
                <span
                  className={`block text-[10px] uppercase ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Apartment Unit
                </span>
                <strong className="text-sm font-extrabold">
                  {bill.roomName}
                </strong>
              </div>
              <div className="text-right">
                <span
                  className={`block text-[10px] uppercase ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Tenant Name
                </span>
                <strong className="text-sm font-bold">{bill.tenantName}</strong>
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
              <div className="text-right">
                <span
                  className={`block text-[10px] uppercase ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Due Date
                </span>
                <span className="font-semibold font-mono-num">
                  {new Date(bill.dueDate).toLocaleDateString('en-PH', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>

            {/* Electric Sub-Meter OCR Computation Box */}
            <div
              className={`my-4 rounded-xl p-3.5 border ${
                isDark
                  ? 'bg-[#161D2B] border-amber-500/30'
                  : 'bg-amber-50/70 border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-xs font-extrabold uppercase tracking-wider flex items-center gap-1 ${
                    isDark ? 'text-amber-400' : 'text-amber-800'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  Electric Sub-Meter Computation
                </span>
                <span className="text-[11px] font-mono-num font-bold">
                  {formatPeso(bill.electricRate)} / kWh
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center py-2 rounded-lg bg-black/15">
                <div>
                  <span className="text-[10px] uppercase opacity-75 block">
                    Previous
                  </span>
                  <span className="text-xs font-bold font-mono-num">
                    {bill.prevReading.toFixed(1)} kWh
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase opacity-75 block">
                    Current
                  </span>
                  <span className="text-xs font-bold font-mono-num">
                    {bill.currReading.toFixed(1)} kWh
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase opacity-75 block">
                    Difference (Δ)
                  </span>
                  <span
                    className={`text-xs font-extrabold font-mono-num ${
                      isDark ? 'text-amber-400' : 'text-amber-700'
                    }`}
                  >
                    {bill.consumptionKwh.toFixed(1)} kWh
                  </span>
                </div>
              </div>

              {bill.meterPhotoDataUrl && (
                <div className="mt-2.5 flex items-center gap-2.5 pt-2 border-t border-slate-500/20">
                  <img
                    src={bill.meterPhotoDataUrl}
                    alt="OCR Sub-Meter Snapshot"
                    className="h-10 rounded border border-amber-500/40 bg-white px-1.5 object-contain"
                  />
                  <span className="text-[10px] opacity-80">
                    Verified OCR Sub-Meter Reading Snapshot
                  </span>
                </div>
              )}

              <div className="mt-2.5 pt-2 border-t border-slate-500/20 flex items-center justify-between text-xs font-bold">
                <span>
                  Sub-Total ({bill.consumptionKwh.toFixed(1)} kWh ×{' '}
                  {formatPeso(bill.electricRate)})
                </span>
                <span className="font-mono-num text-sm font-extrabold">
                  {formatPeso(bill.electricTotal)}
                </span>
              </div>
            </div>

            {/* Itemized Charges */}
            <div className="space-y-2 text-xs pb-3.5 border-b border-dashed border-slate-500/30">
              <div className="flex justify-between">
                <span>Monthly Apartment Base Rent</span>
                <span className="font-mono-num font-bold">
                  {formatPeso(bill.baseRent)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Electric Sub-Meter Charge</span>
                <span className="font-mono-num font-bold">
                  {formatPeso(bill.electricTotal)}
                </span>
              </div>
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
                  <span>Less Security Deposit / Credit Applied</span>
                  <span className="font-mono-num">
                    −{formatPeso(bill.depositApplied)}
                  </span>
                </div>
              )}
            </div>

            {/* Grand Total & Payment Summary */}
            <div className="py-3.5 space-y-1.5 border-b border-dashed border-slate-500/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold uppercase">
                  Total Amount Due
                </span>
                <span
                  className={`text-xl font-black font-mono-num ${
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
            </div>

            {/* Payment Instructions Footer */}
            <div className="pt-3 text-[11px] space-y-1 opacity-85">
              {settings.paymentInstructions && (
                <p className="whitespace-pre-line leading-relaxed">
                  {settings.paymentInstructions}
                </p>
              )}
              <div className="pt-2 flex items-center justify-between text-[10px] opacity-70 font-mono-num">
                <span>Generated by 4Rent v1.0.0</span>
                <span>{new Date(bill.createdAt).toLocaleString('en-PH')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Export, Print & Messenger Integration Bar (hidden when printing) */}
        <div className="no-print px-5 py-4 bg-[#192130] border-t border-[#263147] flex flex-wrap items-center justify-between gap-2.5">
          {/* Messenger Primary Button */}
          <button
            type="button"
            onClick={handleShareToMessenger}
            disabled={isExporting}
            className="flex-1 min-w-[200px] py-3 px-4 rounded-2xl bg-[#0084FF] hover:bg-[#1890FF] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition cursor-pointer"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4 fill-white" />
            )}
            <span>Share Receipt to Messenger</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isExporting}
              className="py-3 px-4 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download PNG</span>
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="py-3 px-3.5 rounded-2xl bg-[#10151F] hover:bg-[#1E2738] border border-[#28334A] text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Copy formatted Messenger text summary"
            >
              {copiedText ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Text</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrintReceipt}
              className="py-3 px-4 rounded-2xl bg-[#10151F] hover:bg-[#1E2738] border border-[#28334A] text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

