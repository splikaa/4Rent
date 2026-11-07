import React, { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageCircle,
  Printer,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { AppSettings, BillRecord } from '../../types/rental';
import {
  formatMessengerBillSummary,
  formatPeso,
  generateReceiptVerificationCode,
  maskPhoneNumber,
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
  const [maskContactsOnReceipt, setMaskContactsOnReceipt] = useState<boolean>(
    () => settings.maskReceiptContacts ?? true
  );
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

  const verificationSeal = generateReceiptVerificationCode(
    bill.receiptNo,
    bill.roomName,
    bill.totalAmountDue
  );

  const generateReceiptPngDataUrl = async (): Promise<string | null> => {
    if (!receiptRef.current) return null;
    try {
      setIsExporting(true);
      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        pixelRatio: 2.5,
        backgroundColor: '#FFFFFF',
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
    link.download = `4Rent-Official-Receipt-${bill.roomName.replace(
      /\s+/g,
      '-'
    )}-${bill.receiptNo}.png`;
    link.href = dataUrl;
    link.click();
    setShareFeedback('Official White-Paper Receipt PNG downloaded!');
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
      link.download = `4Rent-Official-Receipt-${bill.receiptNo}.png`;
      link.href = dataUrl;
      link.click();
    }

    const messengerTarget = bill.tenantMessenger?.trim()
      ? `https://m.me/${bill.tenantMessenger.trim()}`
      : 'https://www.messenger.com/';

    window.open(messengerTarget, '_blank', 'noopener,noreferrer');
    setShareFeedback(
      'Official Receipt PNG downloaded & Summary copied! Paste and attach in Messenger.'
    );
  };

  const formattedIssueDate = new Date(bill.createdAt).toLocaleDateString(
    'en-PH',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  );

  const formattedDueDate = new Date(bill.dueDate).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="receipt-print-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="receipt-print-shell w-full max-w-2xl rounded-3xl bg-[#131924] border border-[#263147] shadow-2xl overflow-hidden my-auto flex flex-col max-h-[95vh] animate-modal-pop">
        {/* Top Action Header (Hidden during print) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 bg-[#18202F] border-b border-[#263147] shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-sm sm:text-base font-extrabold text-white">
              Formal Official Statement & Receipt
            </span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono-num font-bold">
              {bill.receiptNo}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMaskContactsOnReceipt((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-[#0F141E] hover:bg-[#1E2738] border border-[#28334A] text-xs font-semibold text-emerald-300 flex items-center gap-1.5 transition cursor-pointer"
              title="Toggle Tenant Contact Privacy Masking on Receipt"
            >
              {maskContactsOnReceipt ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Contact Redacted</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>Full Contact</span>
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
          <div className="no-print mx-5 mt-2.5 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-between shrink-0">
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

        {/* Scrollable Receipt Body — Strictly Formal White Bond Paper (#FFFFFF) */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 flex justify-center bg-[#0E131D] print:bg-white print:p-0">
          <div
            id="printable-receipt-area"
            ref={receiptRef}
            className="w-full bg-white text-slate-900 rounded-xl p-5 sm:p-7 border-2 border-slate-800 shadow-2xl my-auto"
          >
            {/* 1. FORMAL DOCUMENT HEADER */}
            <div className="flex items-start justify-between gap-4 pb-3.5 border-b-2 border-slate-900">
              <div className="flex items-center gap-3">
                <BrandLogo size="sm" />
                <div>
                  <h2 className="text-lg sm:text-xl font-black tracking-tight text-slate-950 uppercase leading-tight">
                    {settings.apartmentName || '4Rent Management System'}
                  </h2>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-600 mt-0.5">
                    Official Statement of Account & Sub-Meter Billing Receipt
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Property Admin: {settings.landlordName || 'Landlord'} • Contact:{' '}
                    {settings.landlordPhone || 'On File'}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div
                  className={`inline-block px-3 py-1 rounded border-2 text-xs font-black uppercase tracking-wider ${
                    bill.status === 'paid'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-700'
                      : bill.status === 'partial'
                      ? 'bg-amber-50 text-amber-800 border-amber-700'
                      : 'bg-red-50 text-red-800 border-red-700'
                  }`}
                >
                  {bill.status === 'paid'
                    ? 'OFFICIAL PAID'
                    : bill.status === 'partial'
                    ? 'PARTIAL PAYMENT'
                    : 'STATEMENT DUE'}
                </div>
                <div className="text-[11px] font-mono-num font-bold text-slate-800 mt-1">
                  OR No: {bill.receiptNo}
                </div>
                <div className="text-[10px] font-mono-num text-slate-500">
                  Issued: {formattedIssueDate}
                </div>
              </div>
            </div>

            {/* 2. TENANT & UNIT PARTICULARS TABLE */}
            <div className="mt-3.5 border border-slate-400 rounded-lg overflow-hidden text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-300 bg-slate-50">
                <div className="p-2.5">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Unit / Room No.
                  </span>
                  <strong className="text-sm font-black text-slate-950">
                    {bill.roomName}
                  </strong>
                </div>
                <div className="p-2.5">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Registered Tenant
                  </span>
                  <strong className="text-xs font-extrabold text-slate-900 block truncate">
                    {bill.tenantName}
                  </strong>
                  {bill.tenantPhone && (
                    <span className="text-[10px] font-mono-num text-slate-600 block">
                      {maskPhoneNumber(bill.tenantPhone, maskContactsOnReceipt)}
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Billing Cycle
                  </span>
                  <strong className="text-xs font-extrabold text-slate-900">
                    {bill.billingPeriod}
                  </strong>
                </div>
                <div className="p-2.5 sm:text-right">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Due Date (1st–10th)
                  </span>
                  <strong className="text-xs font-black font-mono-num text-slate-950">
                    {formattedDueDate}
                  </strong>
                </div>
              </div>
            </div>

            {/* 3. DUAL ELECTRIC SUB-METER COMPUTATION & PHOTO PROOFS */}
            <div className="mt-3.5 border border-slate-400 rounded-lg p-3 bg-slate-50/60">
              <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-300">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  Section I • Electric Sub-Meter Reading & Photo Verification
                </span>
                <span className="text-[11px] font-mono-num font-bold text-slate-800">
                  Approved Rate: {formatPeso(bill.electricRate)} / kWh
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-2.5">
                {/* Sub-Meter #1: Previous Reading Proof */}
                <div className="rounded border border-slate-300 bg-white p-2">
                  <div className="flex items-center justify-between text-[10px] mb-1 pb-1 border-b border-slate-200">
                    <span className="font-bold uppercase text-slate-600">
                      1. Previous Reading
                    </span>
                    <span className="font-mono-num font-black text-xs text-slate-900">
                      {bill.prevReading.toFixed(1)} kWh
                    </span>
                  </div>
                  {prevMeterProofImg && (
                    <img
                      src={prevMeterProofImg}
                      alt="Previous Sub-Meter Proof"
                      className="w-full h-14 object-contain rounded bg-slate-100 border border-slate-200"
                    />
                  )}
                </div>

                {/* Sub-Meter #2: Current Reading Proof */}
                <div className="rounded border border-slate-400 bg-white p-2">
                  <div className="flex items-center justify-between text-[10px] mb-1 pb-1 border-b border-slate-200">
                    <span className="font-bold uppercase text-slate-800">
                      2. Current Reading
                    </span>
                    <span className="font-mono-num font-black text-xs text-slate-950">
                      {bill.currReading.toFixed(1)} kWh
                    </span>
                  </div>
                  {currMeterProofImg && (
                    <img
                      src={currMeterProofImg}
                      alt="Current Sub-Meter Proof"
                      className="w-full h-14 object-contain rounded bg-slate-100 border border-slate-200"
                    />
                  )}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-300 flex flex-wrap items-center justify-between gap-1 text-xs text-slate-800">
                <span>
                  Consumption Computation:{' '}
                  <strong className="font-mono-num text-slate-950">
                    {bill.currReading.toFixed(1)} kWh −{' '}
                    {bill.prevReading.toFixed(1)} kWh ={' '}
                    {bill.consumptionKwh.toFixed(1)} kWh
                  </strong>{' '}
                  × {formatPeso(bill.electricRate)}/kWh
                </span>
                <span className="font-mono-num text-sm font-black text-slate-950">
                  = {formatPeso(bill.electricTotal)}
                </span>
              </div>
            </div>

            {/* 4. ITEMIZED STATEMENT OF CHARGES TABLE */}
            <div className="mt-3.5 border border-slate-400 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-700">
                <span>Section II • Particular Description of Charges</span>
                <span>Amount (PHP)</span>
              </div>
              <div className="divide-y divide-slate-200 text-xs">
                <div className="px-3 py-2 flex justify-between text-slate-800">
                  <span>1. Monthly Apartment Unit Base Rent</span>
                  <span className="font-mono-num font-bold text-slate-950">
                    {formatPeso(bill.baseRent)}
                  </span>
                </div>
                <div className="px-3 py-2 flex justify-between text-slate-800">
                  <span>
                    2. Electric Sub-Meter Consumption ({bill.consumptionKwh.toFixed(1)}{' '}
                    kWh @ {formatPeso(bill.electricRate)}/kWh)
                  </span>
                  <span className="font-mono-num font-bold text-slate-950">
                    {formatPeso(bill.electricTotal)}
                  </span>
                </div>
                {bill.previousBalanceCarryOver > 0 && (
                  <div className="px-3 py-2 flex justify-between text-red-700 font-semibold">
                    <span>3. Previous Unpaid Balance (Carried Over)</span>
                    <span className="font-mono-num">
                      {formatPeso(bill.previousBalanceCarryOver)}
                    </span>
                  </div>
                )}
                {bill.depositApplied > 0 && (
                  <div className="px-3 py-2 flex justify-between text-emerald-700 font-semibold bg-emerald-50/50">
                    <span>
                      Less: Automatic Advance Payment Balance Applied
                    </span>
                    <span className="font-mono-num">
                      −{formatPeso(bill.depositApplied)}
                    </span>
                  </div>
                )}
                {bill.securityDepositRequired > 0 && (
                  <div className="px-3 py-1.5 flex justify-between text-[11px] text-slate-500 bg-slate-50/70">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Security Deposit Held on File (Non-Deductible Reference)
                    </span>
                    <span className="font-mono-num font-semibold">
                      {formatPeso(bill.securityDepositRequired)}
                    </span>
                  </div>
                )}
              </div>

              {/* 5. GRAND TOTAL & PAYMENT SETTLEMENT SUMMARY */}
              <div className="bg-slate-100 border-t-2 border-slate-900 px-3 py-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-black uppercase text-slate-950">
                    Total Amount Due
                  </span>
                  <span className="text-lg sm:text-xl font-black font-mono-num text-slate-950">
                    {formatPeso(bill.totalAmountDue)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-slate-700">
                  <span>Amount Paid / Tendered</span>
                  <span className="font-mono-num font-bold text-emerald-700">
                    {formatPeso(bill.amountPaid)}
                  </span>
                </div>
                <div className="flex justify-between text-xs font-extrabold text-slate-900">
                  <span>Remaining Balance Due</span>
                  <span
                    className={`font-mono-num ${
                      bill.remainingBalance > 0
                        ? 'text-red-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatPeso(bill.remainingBalance)}
                  </span>
                </div>
                {bill.overpaymentToAdvance > 0 && (
                  <div className="flex justify-between text-xs font-bold text-emerald-700 pt-0.5">
                    <span>
                      Excess Payment Credited to Room Advance Balance
                    </span>
                    <span className="font-mono-num">
                      +{formatPeso(bill.overpaymentToAdvance)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 6. FORMAL SIGNATURES & ANTI-TAMPER SEAL */}
            <div className="mt-5 pt-3 border-t border-slate-300 grid grid-cols-2 gap-6 text-[10px] text-slate-700">
              <div>
                <div className="border-b border-slate-500 h-6 mb-1" />
                <p className="font-bold text-slate-900 uppercase">
                  {settings.landlordName || 'Authorized Landlord / Admin'}
                </p>
                <p className="text-slate-500">
                  Prepared & Verified By (Signature)
                </p>
              </div>
              <div>
                <div className="border-b border-slate-500 h-6 mb-1" />
                <p className="font-bold text-slate-900 uppercase">
                  {bill.tenantName}
                </p>
                <p className="text-slate-500">
                  Tenant Acknowledgment & Date Received
                </p>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-dashed border-slate-300 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-500 font-mono-num">
              <span>
                Payment Window: Every 1st–10th of the Month • 4Rent Management System v1.0.0
              </span>
              <span className="font-bold text-slate-800">
                Verification Seal: {verificationSeal}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Export, Print & Messenger Integration Bar (Hidden during print) */}
        <div className="no-print px-5 py-3.5 bg-[#18202F] border-t border-[#263147] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleShareToMessenger}
            disabled={isExporting}
            className="flex-1 min-w-[180px] py-2.5 px-4 rounded-xl bg-[#0084FF] hover:bg-[#1890FF] text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition cursor-pointer btn-fluid"
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
              className="py-2.5 px-3.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PNG</span>
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="py-2.5 px-3 rounded-xl bg-[#10151F] hover:bg-[#1E2738] border border-[#28334A] text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
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
              className="py-2.5 px-3 rounded-xl bg-[#10151F] hover:bg-[#1E2738] border border-[#28334A] text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
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
