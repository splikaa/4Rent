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
import {
  generateSimulatedSubMeterDataUrl,
  generateSimulatedValueCropDataUrl,
  openMessengerAppWithReceipt,
} from '../../services/ocrService';

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

  // Sub-meter photos and zoomed register value crops
  const prevMeterProofImg = useMemo(() => {
    if (!bill) return '';
    return (
      bill.prevMeterPhotoDataUrl ||
      generateSimulatedSubMeterDataUrl(bill.prevReading)
    );
  }, [bill?.prevMeterPhotoDataUrl, bill?.prevReading]);

  const prevMeterCropImg = useMemo(() => {
    if (!bill) return '';
    return (
      bill.prevMeterCropDataUrl ||
      generateSimulatedValueCropDataUrl(bill.prevReading)
    );
  }, [bill?.prevMeterCropDataUrl, bill?.prevReading]);

  const currMeterProofImg = useMemo(() => {
    if (!bill) return '';
    return (
      bill.meterPhotoDataUrl ||
      generateSimulatedSubMeterDataUrl(bill.currReading)
    );
  }, [bill?.meterPhotoDataUrl, bill?.currReading]);

  const currMeterCropImg = useMemo(() => {
    if (!bill) return '';
    return (
      bill.currMeterCropDataUrl ||
      generateSimulatedValueCropDataUrl(bill.currReading)
    );
  }, [bill?.currMeterCropDataUrl, bill?.currReading]);

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
    const safeTenant = (bill.tenantName || 'Tenant')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeRoom = bill.roomName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Receipt_${safeTenant}_${safeRoom}_${bill.receiptNo}.png`;

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
    setShareFeedback(`Receipt PNG downloaded: ${filename}`);
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
    setShareFeedback('Bill summary copied! Ready to paste into Messenger.');
    setTimeout(() => setCopiedText(false), 3000);
  };

  const handleShareToMessenger = async () => {
    setShareFeedback(null);
    const summary = formatMessengerBillSummary(bill, settings.apartmentName);

    // Open Messenger directly without auto-downloading files
    const res = await openMessengerAppWithReceipt({
      textSummary: summary,
      receiptNo: bill.receiptNo,
      tenantName: bill.tenantName,
      roomName: bill.roomName,
      messengerHandle: bill.tenantMessenger,
      autoDownloadPng: false,
    });
    setShareFeedback(res.message);
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
        {/* Top Action Header */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-[#18202F] border-b border-[#263147] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-extrabold text-white">
              Official Receipt
            </span>
            <span className="font-mono-num text-xs bg-amber-500/15 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
              {bill.receiptNo}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMaskContactsOnReceipt((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-xl bg-[#10151F] border border-[#28334A] text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer btn-fluid"
              title="Toggle Privacy Masking for phone numbers"
            >
              {maskContactsOnReceipt ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Unmask Contacts</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                  <span className="hidden sm:inline">Mask Contacts</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-xl bg-[#10151F] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer btn-fluid"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {shareFeedback && (
          <div className="no-print px-5 py-2 bg-amber-500/15 border-b border-amber-500/30 text-xs font-semibold text-amber-300 text-center animate-view-enter">
            {shareFeedback}
          </div>
        )}

        {/* Printable White-Paper Sheet */}
        <div className="receipt-sheet-container flex-1 overflow-y-auto p-3 sm:p-5 bg-[#0B0F17] flex justify-center">
          <div
            ref={receiptRef}
            id="receipt-printable-sheet"
            className="receipt-white-sheet w-full max-w-xl bg-white text-slate-900 rounded-xl p-5 sm:p-7 shadow-2xl font-sans"
          >
            {/* Header: Brand & OR Number */}
            <div className="flex items-start justify-between gap-3 border-b-2 border-slate-900 pb-3">
              <div className="flex items-start gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center shrink-0">
                  <BrandLogo size="md" />
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-black uppercase tracking-tight text-slate-950 leading-tight">
                    {settings.apartmentName || '4Rent Management System'}
                  </h1>
                  <p className="text-[10px] sm:text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Official Statement of Account & Billing Receipt
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {settings.landlordName || 'Property Admin'}
                    {settings.landlordPhone && (
                      <>
                        {' • '}
                        {maskPhoneNumber(
                          settings.landlordPhone,
                          maskContactsOnReceipt
                        )}
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                    bill.status === 'paid'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-700'
                      : bill.status === 'partial'
                      ? 'bg-amber-50 text-amber-800 border-amber-700'
                      : 'bg-red-50 text-red-800 border-red-700'
                  }`}
                >
                  {bill.status === 'paid'
                    ? 'PAID'
                    : bill.status === 'partial'
                    ? 'PARTIAL PAYMENT'
                    : 'STATEMENT DUE'}
                </span>
                <div className="text-[11px] font-mono-num font-bold text-slate-800 mt-1">
                  OR No: {bill.receiptNo}
                </div>
                <div className="text-[10px] font-mono-num text-slate-500">
                  Issued: {formattedIssueDate}
                </div>
              </div>
            </div>

            {/* Tenant & Room Table */}
            <div className="mt-3 border border-slate-400 rounded-lg overflow-hidden text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-300 bg-slate-50">
                <div className="p-2 sm:p-2.5">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Unit / Room
                  </span>
                  <strong className="text-sm font-black text-slate-950">
                    {bill.roomName}
                  </strong>
                </div>
                <div className="p-2 sm:p-2.5">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Tenant
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
                <div className="p-2 sm:p-2.5">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Billing Cycle
                  </span>
                  <strong className="text-xs font-extrabold text-slate-900">
                    {bill.billingPeriod}
                  </strong>
                </div>
                <div className="p-2 sm:p-2.5 sm:text-right">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Due Date
                  </span>
                  <strong className="text-xs font-black font-mono-num text-slate-950">
                    {formattedDueDate}
                  </strong>
                </div>
              </div>
            </div>

            {/* Sub-Meter Photo Proofs & Zoomed Value Crops */}
            <div className="mt-3 border border-slate-400 rounded-lg p-2.5 sm:p-3 bg-slate-50/70">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-300">
                <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  Section I • Sub-Meter Readings & Photo Verification
                </span>
                <span className="text-[10px] sm:text-[11px] font-mono-num font-bold text-slate-800">
                  Rate: {formatPeso(bill.electricRate)}/kWh
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mb-2">
                {/* Previous Reading */}
                <div className="rounded border border-slate-300 bg-white p-2">
                  <div className="flex items-center justify-between text-[10px] mb-1 pb-1 border-b border-slate-200">
                    <span className="font-bold uppercase text-slate-600">
                      1. Previous
                    </span>
                    <span className="font-mono-num font-black text-xs text-slate-900">
                      {bill.prevReading.toFixed(1)} kWh
                    </span>
                  </div>
                  <div className="space-y-1">
                    {prevMeterProofImg && (
                      <img
                        src={prevMeterProofImg}
                        alt="Previous Sub-Meter Proof"
                        className="w-full h-14 object-contain rounded bg-slate-100 border border-slate-200"
                      />
                    )}
                    {prevMeterCropImg && (
                      <img
                        src={prevMeterCropImg}
                        alt="Previous Value Crop"
                        className="w-full h-7 object-contain rounded bg-slate-900 border border-emerald-600/40"
                      />
                    )}
                  </div>
                </div>

                {/* Current Reading */}
                <div className="rounded border border-slate-400 bg-white p-2">
                  <div className="flex items-center justify-between text-[10px] mb-1 pb-1 border-b border-slate-200">
                    <span className="font-bold uppercase text-slate-800">
                      2. Current
                    </span>
                    <span className="font-mono-num font-black text-xs text-slate-950">
                      {bill.currReading.toFixed(1)} kWh
                    </span>
                  </div>
                  <div className="space-y-1">
                    {currMeterProofImg && (
                      <img
                        src={currMeterProofImg}
                        alt="Current Sub-Meter Proof"
                        className="w-full h-14 object-contain rounded bg-slate-100 border border-slate-200"
                      />
                    )}
                    {currMeterCropImg && (
                      <img
                        src={currMeterCropImg}
                        alt="Current Value Crop"
                        className="w-full h-7 object-contain rounded bg-slate-900 border border-amber-600/40"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-1.5 border-t border-slate-300 flex flex-wrap items-center justify-between gap-1 text-xs text-slate-800">
                <span>
                  Computation:{' '}
                  <strong className="font-mono-num text-slate-950">
                    {bill.currReading.toFixed(1)} − {bill.prevReading.toFixed(1)} ={' '}
                    {bill.consumptionKwh.toFixed(1)} kWh
                  </strong>{' '}
                  × {formatPeso(bill.electricRate)}
                </span>
                <span className="font-mono-num text-sm font-black text-slate-950">
                  = {formatPeso(bill.electricTotal)}
                </span>
              </div>
            </div>

            {/* Particular Description of Charges */}
            <div className="mt-3 border border-slate-400 rounded-lg overflow-hidden">
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
                  <div className="px-3 py-2 flex justify-between text-emerald-700 font-semibold">
                    <span>4. Advance Balance Deducted / Applied</span>
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

              {/* Settlement Summary */}
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
                    <span>Excess Payment Credited to Advance Balance</span>
                    <span className="font-mono-num">
                      +{formatPeso(bill.overpaymentToAdvance)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Anti-Tamper Verification Seal & Payment Window (Signature lines removed) */}
            <div className="mt-4 pt-2.5 border-t border-dashed border-slate-300 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-500 font-mono-num">
              <span>
                Payment Window: Every 1st–10th of the Month • 4Rent Management System v1.0.0
              </span>
              <span className="font-bold text-slate-800">
                Verification Seal: {verificationSeal}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="no-print px-5 py-3 bg-[#18202F] border-t border-[#263147] flex flex-wrap items-center justify-between gap-2 shrink-0">
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
