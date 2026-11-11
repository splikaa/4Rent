import React, { useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  CalendarClock,
  Check,
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
  ZoomIn,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { AppSettings, BillRecord } from '../../types/rental';
import {
  clampDueDayOneToTen,
  formatMessengerBillSummary,
  formatPeso,
  generateReceiptVerificationCode,
  isMobileDevice,
  isRunningInMobileApp,
  maskPhoneNumber,
} from '../../utils/billingCalculator';
import {
  generateSimulatedSubMeterDataUrl,
  generateSimulatedValueCropDataUrl,
  openMessengerAppWithReceipt,
} from '../../services/ocrService';
import { MeterPhotoLightboxModal } from '../ocr/MeterPhotoLightboxModal';

interface ReceiptModalProps {
  bill: BillRecord | null;
  settings: AppSettings;
  onClose: () => void;
}

/**
 * Derives clean current-month and next-month cycle ranges & due dates from a BillRecord.
 */
function buildMonthlyScheduleBreakdown(billingPeriod: string, dueDateIso: string) {
  const parsedDue = new Date(dueDateIso);
  const validDue = Number.isNaN(parsedDue.getTime()) ? new Date() : parsedDue;

  // Attempt to parse billingPeriod ("Nov 2026"); fall back to created/due month
  const parsedPeriod = new Date(`1 ${billingPeriod}`);
  const startDate = Number.isNaN(parsedPeriod.getTime())
    ? new Date(validDue.getFullYear(), validDue.getMonth(), 1)
    : new Date(parsedPeriod.getFullYear(), parsedPeriod.getMonth(), 1);

  const curYear = startDate.getFullYear();
  const curMonth = startDate.getMonth();
  const curLastDay = new Date(curYear, curMonth + 1, 0).getDate();
  const curMonthShort = startDate.toLocaleDateString('en-US', { month: 'short' });

  const nextStart = new Date(curYear, curMonth + 1, 1);
  const nextYear = nextStart.getFullYear();
  const nextMonth = nextStart.getMonth();
  const nextLastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
  const nextMonthShort = nextStart.toLocaleDateString('en-US', { month: 'short' });

  // Advance the bill's due date by +1 month inside the 1st-10th payment window
  const safeDueDay = clampDueDayOneToTen(validDue.getDate());
  let nextDueYear = validDue.getFullYear();
  let nextDueMonth = validDue.getMonth() + 1;
  if (nextDueMonth > 11) {
    nextDueMonth = 0;
    nextDueYear += 1;
  }
  const nextDueDateObj = new Date(nextDueYear, nextDueMonth, safeDueDay, 12, 0, 0);

  return {
    currentLabel: `${curMonthShort} ${curYear}`,
    currentRange: `${curMonthShort} 1 – ${curLastDay}, ${curYear}`,
    nextLabel: `${nextMonthShort} ${nextYear}`,
    nextRange: `${nextMonthShort} 1 – ${nextLastDay}, ${nextYear}`,
    dueDayNumber: safeDueDay,
    nextDueLabel: nextDueDateObj.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  };
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
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // 1:1 Pixel Inspection Lightbox State
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    imageUrl: string;
    title: string;
    roiCropUrl?: string;
    readingValue?: string;
  }>({
    isOpen: false,
    imageUrl: '',
    title: '',
  });

  const openLightbox = (
    imageUrl: string,
    title: string,
    roiCropUrl?: string,
    readingValue?: string
  ) => {
    setLightboxState({
      isOpen: true,
      imageUrl,
      title,
      roiCropUrl,
      readingValue,
    });
  };

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

  const cycleSchedule = buildMonthlyScheduleBreakdown(
    bill.billingPeriod,
    bill.dueDate
  );

  const generateReceiptPngDataUrl = async (): Promise<string | null> => {
    if (!receiptRef.current) return null;
    try {
      setIsExporting(true);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

      const node = receiptRef.current;
      const rect = node.getBoundingClientRect();
      const fullWidth = Math.ceil(rect.width || node.scrollWidth || 660);
      const fullHeight = Math.ceil(
        Math.max(node.scrollHeight, node.offsetHeight, rect.height || 0)
      );

      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: true,
        fontEmbedCSS: '',
        backgroundColor: '#FFFFFF',
        width: fullWidth,
        height: fullHeight,
        canvasWidth: fullWidth * 2,
        canvasHeight: fullHeight * 2,
        filter: (domNode: HTMLElement) =>
          !(
            domNode instanceof HTMLElement &&
            domNode.classList?.contains('no-print')
          ),
        style: {
          transform: 'none',
          maxHeight: 'none',
          maxWidth: 'none',
          height: `${fullHeight}px`,
          width: `${fullWidth}px`,
          overflow: 'visible',
          position: 'static',
          margin: '0',
        },
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
      setShareFeedback('Could not generate PNG. Use Print / PDF instead.');
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
    setShareFeedback(`Saved PNG: ${filename}`);
    setTimeout(() => {
      setShareFeedback((prev) => (prev?.startsWith('Saved PNG') ? null : prev));
    }, 4500);
  };

  const handleShareToMessenger = async () => {
    setShareFeedback(null);

    // Pre-open desktop tab synchronously inside click gesture to avoid async popup blocking
    const isDesktopWeb = !isMobileDevice() && !isRunningInMobileApp();
    let preOpenedWindow: Window | null = null;
    if (isDesktopWeb) {
      try {
        preOpenedWindow = window.open('', '_blank');
        if (preOpenedWindow && preOpenedWindow.document) {
          preOpenedWindow.document.title = 'Opening Messenger...';
          preOpenedWindow.document.body.innerHTML =
            '<div style="font-family:system-ui,sans-serif;background:#0b111c;color:#f8fafc;height:100vh;display:flex;align-items:center;justify-content:center;margin:0;text-align:center;"><div><h2 style="margin:0 0 8px;">Preparing Official Receipt...</h2><p style="color:#94a3b8;font-size:14px;margin:0;">Copying receipt image and opening Facebook Messenger.</p></div></div>';
        }
      } catch {
        preOpenedWindow = null;
      }
    }

    const pngData = await generateReceiptPngDataUrl();
    const summaryText = formatMessengerBillSummary(
      bill,
      settings.apartmentName || '4Rent Management System'
    );

    const res = await openMessengerAppWithReceipt({
      textSummary: summaryText,
      pngDataUrl: pngData || undefined,
      receiptNo: bill.receiptNo,
      tenantName: bill.tenantName,
      roomName: bill.roomName,
      messengerHandle: bill.tenantMessenger,
      shareUrl: window.location.href,
      autoDownloadPng: true,
      preOpenedWindow,
    });
    setShareFeedback(res.message);
    setTimeout(() => {
      setShareFeedback((prev) => (prev === res.message ? null : prev));
    }, 5500);
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

  const displayLandlordName =
    settings.landlordName && settings.landlordName !== 'Property Administrator'
      ? settings.landlordName
      : 'Authorized Landlord';

  return (
    <div className="receipt-print-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="receipt-print-shell w-full max-w-3xl rounded-3xl bg-[#111724] border border-[#243148] shadow-2xl overflow-hidden my-auto flex flex-col max-h-[94vh] animate-modal-pop relative">
        {/* Modal Top Control Header (Hidden when printed) */}
        <div className="no-print flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-[#162030] border-b border-[#243148] shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <span className="text-xs sm:text-sm font-black text-white whitespace-nowrap">
              Official Statement &amp; Receipt
            </span>
            <span className="font-mono-num text-[11px] sm:text-xs bg-amber-500/15 text-amber-400 font-bold px-2.5 py-0.5 rounded-full border border-amber-500/30 truncate">
              {bill.receiptNo}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setMaskContactsOnReceipt((prev) => !prev)}
              className="px-2.5 py-1.5 rounded-xl bg-[#0F1522] border border-[#25324A] text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer transition btn-fluid"
              title="Toggle contact masking"
            >
              {maskContactsOnReceipt ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Contact Redacted</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Contact Visible</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-xl bg-[#0F1522] text-slate-400 hover:text-white border border-[#25324A] flex items-center justify-center cursor-pointer transition btn-fluid"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Floating Notification Toast */}
        {shareFeedback && (
          <div className="no-print absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs shadow-2xl border border-amber-400 flex items-center gap-2 animate-modal-pop max-w-[92%] text-center">
            <Check className="w-4 h-4 text-slate-950 shrink-0" />
            <span>{shareFeedback}</span>
          </div>
        )}

        {/* Scrollable Backdrop Container — Block flow with mx-auto prevents Flexbox height clipping */}
        <div className="receipt-sheet-container flex-1 overflow-y-auto p-3 sm:p-6 bg-[#090D15]">
          <div
            ref={receiptRef}
            id="receipt-printable-sheet"
            className="receipt-white-sheet mx-auto w-full max-w-[660px] bg-white text-slate-900 rounded-2xl p-5 sm:p-7 shadow-2xl font-sans border border-slate-200 relative space-y-4"
          >
            {/* 1. Perfectly Centered Statement Letterhead */}
            <div className="text-center border-b-2 border-slate-900 pb-4 space-y-2">
              <div className="w-11 h-11 rounded-xl bg-slate-950 flex items-center justify-center mx-auto shadow-sm">
                <BrandLogo size="md" />
              </div>

              <div>
                <h1 className="text-base sm:text-xl font-black uppercase tracking-tight text-slate-950 leading-tight">
                  {settings.apartmentName || '4Rent Management System'}
                </h1>
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                  Official Statement of Account &amp; Sub-Meter Receipt
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {displayLandlordName}
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

              {/* Centered Status & Receipt Metadata Bar */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-[11px]">
                <span
                  className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                    bill.status === 'paid'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-600'
                      : bill.status === 'partial'
                      ? 'bg-amber-50 text-amber-800 border-amber-600'
                      : 'bg-red-50 text-red-800 border-red-600'
                  }`}
                >
                  {bill.status === 'paid'
                    ? 'PAID IN FULL'
                    : bill.status === 'partial'
                    ? 'PARTIAL PAYMENT'
                    : 'STATEMENT DUE'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-mono-num font-extrabold text-slate-900">
                  OR #{bill.receiptNo}
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-mono-num text-slate-600">
                  Issued {formattedIssueDate}
                </span>
              </div>
            </div>

            {/* 2. Centered Unit & Tenant Summary Grid */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-center">
                <div className="p-2.5 sm:p-3">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Unit / Room
                  </span>
                  <strong className="text-xs sm:text-sm font-black text-slate-950 block mt-0.5">
                    {bill.roomName}
                  </strong>
                </div>
                <div className="p-2.5 sm:p-3">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Tenant
                  </span>
                  <strong className="text-xs font-black text-slate-900 block truncate mt-0.5">
                    {bill.tenantName}
                  </strong>
                  {bill.tenantPhone && (
                    <span className="text-[10px] font-mono-num text-slate-500 block">
                      {maskPhoneNumber(bill.tenantPhone, maskContactsOnReceipt)}
                    </span>
                  )}
                </div>
                <div className="p-2.5 sm:p-3">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Active Month
                  </span>
                  <strong className="text-xs font-extrabold text-slate-900 block mt-0.5">
                    {bill.billingPeriod}
                  </strong>
                </div>
                <div className="p-2.5 sm:p-3">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    Due Date (1st–10th)
                  </span>
                  <strong className="text-xs font-black font-mono-num text-slate-950 block mt-0.5">
                    {formattedDueDate}
                  </strong>
                </div>
              </div>
            </div>

            {/* 3. Monthly Schedule & Rate Breakdown (This Month & Next Month) */}
            <div className="border border-slate-200 rounded-xl p-3 sm:p-4 bg-slate-50/60 space-y-2.5">
              <div className="flex items-center justify-center gap-1.5 pb-2 border-b border-slate-200">
                <CalendarClock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-900 text-center">
                  Monthly Rate Breakdown — This Month &amp; Next Cycle
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                {/* Current Billing Month */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                      This Month ({cycleSchedule.currentLabel})
                    </span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                      Active Cycle
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span>Coverage</span>
                    <span className="font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                      {cycleSchedule.currentRange}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span>Rent Rate</span>
                    <span className="font-mono-num font-bold text-slate-950 whitespace-nowrap">
                      {formatPeso(bill.baseRent)} / mo
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span className="truncate">Electric ({bill.consumptionKwh.toFixed(1)} kWh)</span>
                    <span className="font-mono-num font-bold text-slate-950 whitespace-nowrap">
                      {formatPeso(bill.electricRate)}/kWh • {formatPeso(bill.electricTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span>Due Date</span>
                    <span className="font-mono-num font-bold text-slate-900 whitespace-nowrap">
                      {formattedDueDate}
                    </span>
                  </div>
                </div>

                {/* Next Billing Month & Succeeding */}
                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                      Next Month ({cycleSchedule.nextLabel})
                    </span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                      Recurring Rate
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span>Coverage</span>
                    <span className="font-mono-num font-semibold text-slate-900 whitespace-nowrap">
                      {cycleSchedule.nextRange}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span>Rent Rate</span>
                    <span className="font-mono-num font-bold text-slate-950 whitespace-nowrap">
                      {formatPeso(bill.baseRent)} / mo
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span>Start Meter</span>
                    <span className="font-mono-num font-bold text-slate-950 whitespace-nowrap">
                      {bill.currReading.toFixed(1)} kWh (@{formatPeso(bill.electricRate)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span>Next Due (Day {cycleSchedule.dueDayNumber})</span>
                    <span className="font-mono-num font-bold text-slate-900 whitespace-nowrap">
                      {cycleSchedule.nextDueLabel}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-center text-[10px] text-slate-500 pt-0.5">
                Standard monthly billing: {formatPeso(bill.baseRent)}/mo rent + metered electricity ({formatPeso(bill.electricRate)}/kWh), payable every 1st–10th.
              </p>
            </div>

            {/* 4. Section I: Sub-Meter Readings & Proof */}
            <div className="border border-slate-200 rounded-xl p-3 sm:p-4 bg-slate-50/70 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-900">
                    Section I • Electric Sub-Meter Proof
                  </span>
                </div>
                <span className="text-[10px] sm:text-xs font-mono-num font-extrabold text-slate-900 bg-white px-2.5 py-0.5 rounded border border-slate-300 whitespace-nowrap shrink-0">
                  Rate: {formatPeso(bill.electricRate)}/kWh
                </span>
              </div>

              {/* Dual Sub-Meter Columns */}
              <div className="grid grid-cols-2 gap-3">
                {/* Previous Reading */}
                <div className="rounded-lg border border-slate-200 bg-white p-2 sm:p-2.5 flex flex-col justify-between gap-1.5">
                  <div className="flex items-center justify-between gap-1 text-[10px] pb-1 border-b border-slate-200">
                    <span className="font-bold uppercase text-slate-600">
                      1. Previous
                    </span>
                    <span className="font-mono-num font-black text-xs text-slate-950 whitespace-nowrap">
                      {bill.prevReading.toFixed(1)} kWh
                    </span>
                  </div>
                  {prevMeterProofImg && (
                    <div
                      onClick={() =>
                        openLightbox(
                          prevMeterProofImg,
                          `Previous Sub-Meter — ${bill.roomName}`,
                          prevMeterCropImg,
                          `${bill.prevReading.toFixed(1)} kWh`
                        )
                      }
                      className="relative group cursor-zoom-in overflow-hidden rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center h-20 sm:h-24 p-1"
                      title="Click to inspect full 1:1 sub-meter proof"
                    >
                      <img
                        src={prevMeterProofImg}
                        alt="Previous Sub-Meter Proof"
                        className="w-full h-full object-contain group-hover:scale-105 transition duration-150"
                      />
                    </div>
                  )}
                  {prevMeterProofImg && (
                    <button
                      type="button"
                      onClick={() =>
                        openLightbox(
                          prevMeterProofImg,
                          `Previous Sub-Meter — ${bill.roomName}`,
                          prevMeterCropImg,
                          `${bill.prevReading.toFixed(1)} kWh`
                        )
                      }
                      className="no-print w-full py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <ZoomIn className="w-3 h-3 text-amber-600" />
                      <span>Inspect Photo</span>
                    </button>
                  )}
                </div>

                {/* Current Reading */}
                <div className="rounded-lg border border-slate-200 bg-white p-2 sm:p-2.5 flex flex-col justify-between gap-1.5">
                  <div className="flex items-center justify-between gap-1 text-[10px] pb-1 border-b border-slate-200">
                    <span className="font-bold uppercase text-slate-600">
                      2. Current
                    </span>
                    <span className="font-mono-num font-black text-xs text-slate-950 whitespace-nowrap">
                      {bill.currReading.toFixed(1)} kWh
                    </span>
                  </div>
                  {currMeterProofImg && (
                    <div
                      onClick={() =>
                        openLightbox(
                          currMeterProofImg,
                          `Current Sub-Meter — ${bill.roomName}`,
                          currMeterCropImg,
                          `${bill.currReading.toFixed(1)} kWh`
                        )
                      }
                      className="relative group cursor-zoom-in overflow-hidden rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center h-20 sm:h-24 p-1"
                      title="Click to inspect full 1:1 sub-meter proof"
                    >
                      <img
                        src={currMeterProofImg}
                        alt="Current Sub-Meter Proof"
                        className="w-full h-full object-contain group-hover:scale-105 transition duration-150"
                      />
                    </div>
                  )}
                  {currMeterProofImg && (
                    <button
                      type="button"
                      onClick={() =>
                        openLightbox(
                          currMeterProofImg,
                          `Current Sub-Meter — ${bill.roomName}`,
                          currMeterCropImg,
                          `${bill.currReading.toFixed(1)} kWh`
                        )
                      }
                      className="no-print w-full py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <ZoomIn className="w-3 h-3 text-amber-600" />
                      <span>Inspect Photo</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Centered Computation Strip */}
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-center text-[11px] sm:text-xs text-slate-800">
                <span className="font-semibold">Usage: </span>
                <strong className="font-mono-num text-slate-950">
                  {bill.currReading.toFixed(1)} − {bill.prevReading.toFixed(1)} ={' '}
                  {bill.consumptionKwh.toFixed(1)} kWh
                </strong>{' '}
                × {formatPeso(bill.electricRate)}/kWh ={' '}
                <strong className="font-mono-num text-slate-950 font-black">
                  {formatPeso(bill.electricTotal)}
                </strong>
              </div>
            </div>

            {/* 5. Section II: Itemized Statement of Charges & Totals */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-200 flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-700">
                <span>Section II • Statement of Charges</span>
                <span>Amount (PHP)</span>
              </div>
              <div className="divide-y divide-slate-200 text-xs">
                <div className="px-3.5 py-2 flex justify-between gap-2 text-slate-800">
                  <span>1. Monthly Base Rent ({bill.billingPeriod})</span>
                  <span className="font-mono-num font-bold text-slate-950 whitespace-nowrap">
                    {formatPeso(bill.baseRent)}
                  </span>
                </div>

                <div className="px-3.5 py-2 flex justify-between gap-2 text-slate-800">
                  <span>
                    2. Sub-Meter Electricity ({bill.consumptionKwh.toFixed(1)} kWh @{' '}
                    {formatPeso(bill.electricRate)}/kWh)
                  </span>
                  <span className="font-mono-num font-bold text-slate-950 whitespace-nowrap">
                    {formatPeso(bill.electricTotal)}
                  </span>
                </div>

                {bill.previousBalanceCarryOver > 0 && (
                  <div className="px-3.5 py-2 flex justify-between gap-2 text-red-700 font-bold bg-red-50/50">
                    <span>3. Unpaid Balance Carried Over</span>
                    <span className="font-mono-num whitespace-nowrap">
                      {formatPeso(bill.previousBalanceCarryOver)}
                    </span>
                  </div>
                )}

                {bill.depositApplied > 0 && (
                  <div className="px-3.5 py-2 flex justify-between gap-2 text-emerald-700 font-bold bg-emerald-50/50">
                    <span>4. Advance Credit Applied</span>
                    <span className="font-mono-num whitespace-nowrap">
                      −{formatPeso(bill.depositApplied)}
                    </span>
                  </div>
                )}

                {bill.securityDepositRequired > 0 && (
                  <div className="px-3.5 py-2 flex justify-between gap-2 text-[11px] text-slate-600 bg-slate-50/60">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      Security Deposit Held (Non-Deductible)
                    </span>
                    <span className="font-mono-num font-semibold whitespace-nowrap">
                      {formatPeso(bill.securityDepositRequired)}
                    </span>
                  </div>
                )}
              </div>

              {/* Settlement Summary Box */}
              <div className="bg-slate-50 border-t-2 border-slate-900 px-3.5 py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-black uppercase text-slate-950">
                    Total Amount Due
                  </span>
                  <span className="text-lg sm:text-xl font-black font-mono-num text-slate-950 whitespace-nowrap">
                    {formatPeso(bill.totalAmountDue)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-xs text-slate-700">
                  <span>
                    Amount Paid{bill.paymentMethod ? ` (${bill.paymentMethod})` : ''}
                  </span>
                  <span className="font-mono-num font-bold text-emerald-700 whitespace-nowrap">
                    {formatPeso(bill.amountPaid)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-xs font-black text-slate-900">
                  <span>Remaining Balance</span>
                  <span
                    className={`font-mono-num font-black whitespace-nowrap ${
                      bill.remainingBalance > 0
                        ? 'text-red-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {formatPeso(bill.remainingBalance)}
                  </span>
                </div>
                {bill.overpaymentToAdvance > 0 && (
                  <div className="flex justify-between gap-2 text-xs font-bold text-emerald-700 pt-0.5">
                    <span>
                      Advance Credit ({cycleSchedule.nextLabel})
                    </span>
                    <span className="font-mono-num whitespace-nowrap">
                      +{formatPeso(bill.overpaymentToAdvance)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 6. Centered Verification Seal & Official Footer */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-1.5">
              <div className="inline-flex items-center justify-center gap-1.5 text-[10px] text-slate-600 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  Payment Window: 1st–10th Monthly • 4Rent Management System v1.0.0
                </span>
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-mono-num font-black text-emerald-700 tracking-wider">
                  <span className="text-slate-500 uppercase font-bold">Seal:</span>
                  <span>{verificationSeal}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Action Toolbar (Hidden when printed) */}
        <div className="no-print px-4 sm:px-6 py-3.5 bg-[#141C2B] border-t border-[#243148] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleShareToMessenger}
            disabled={isExporting}
            className="flex-1 min-w-[200px] h-11 py-2.5 px-4 rounded-xl bg-[#0084FF] hover:bg-[#1890FF] text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition cursor-pointer btn-fluid"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageCircle className="w-4 h-4 fill-white" />
            )}
            <span>Share Receipt to Messenger</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isExporting}
              className="h-11 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/15 transition cursor-pointer btn-fluid"
            >
              <Download className="w-4 h-4" />
              <span>Download PNG</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="h-11 py-2.5 px-4 rounded-xl bg-[#1A2335] hover:bg-[#24314A] border border-[#2A3955] text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1:1 Pixel Inspection Lightbox Modal */}
      <MeterPhotoLightboxModal
        isOpen={lightboxState.isOpen}
        onClose={() => setLightboxState((prev) => ({ ...prev, isOpen: false }))}
        imageUrl={lightboxState.imageUrl}
        title={lightboxState.title}
        roiCropUrl={lightboxState.roiCropUrl}
        readingValue={lightboxState.readingValue}
      />
    </div>
  );
};
