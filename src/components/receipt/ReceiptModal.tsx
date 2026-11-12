import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  CalendarClock,
  Check,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileDown,
  Loader2,
  Lock,
  MessageCircle,
  Printer,
  ShieldCheck,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';
import { AppSettings, BillRecord } from '../../types/rental';
import {
  clampDueDayOneToTen,
  formatMessengerBillSummary,
  formatMonthKeyLabel,
  formatPeso,
  generateReceiptVerificationCode,
  getAdjacentMonthKey,
  getElectricRateForPeriod,
  getScheduledMonthKeys,
  isMobileDevice,
  isRunningInMobileApp,
  maskPhoneNumber,
  normalizeMonthKey,
} from '../../utils/billingCalculator';
import { buildSinglePageReceiptPdfBlob } from '../../utils/pdfReceiptGenerator';
import {
  generateSimulatedSubMeterDataUrl,
  generateSimulatedValueCropDataUrl,
} from '../../services/ocrService';
import { openMessengerAppWithReceipt } from '../../services/notificationService';
import { MeterPhotoLightboxModal } from '../ocr/MeterPhotoLightboxModal';

interface ReceiptModalProps {
  bill: BillRecord | null;
  settings: AppSettings;
  onApplyMonthlyRate?: (monthKeyOrPeriod: string, rate: number) => void;
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
  onApplyMonthlyRate,
  onClose,
}) => {
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const [maskContactsOnReceipt, setMaskContactsOnReceipt] = useState<boolean>(
    () => settings.maskReceiptContacts ?? true
  );
  const [isExporting, setIsExporting] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [quickRateMonthKey, setQuickRateMonthKey] = useState<string>(() =>
    normalizeMonthKey(bill?.billingPeriod || new Date().toISOString())
  );
  const [quickRateValue, setQuickRateValue] = useState<string>(() =>
    String(bill?.electricRate ?? settings.defaultElectricRate ?? 15)
  );

  useEffect(() => {
    if (!bill) return;
    const key = normalizeMonthKey(bill.billingPeriod);
    setQuickRateMonthKey(key);
    const liveRate = bill.isArchived || bill.status === 'paid'
      ? bill.electricRate
      : getElectricRateForPeriod(settings, key);
    setQuickRateValue(String(liveRate));
  }, [bill?.id, bill?.electricRate, bill?.billingPeriod]);

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

  const getSafeReceiptBaseFilename = () => {
    const safeTenant = (bill.tenantName || 'Tenant')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeRoom = bill.roomName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return `Receipt_${safeTenant}_${safeRoom}_${bill.receiptNo}`;
  };

  const handleDownloadPng = async () => {
    setShareFeedback(null);
    const dataUrl = await generateReceiptPngDataUrl();
    if (!dataUrl) {
      setShareFeedback('Could not generate PNG receipt.');
      return;
    }
    const filename = `${getSafeReceiptBaseFilename()}.png`;

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setShareFeedback(`Saved PNG: ${filename}`);
    setTimeout(() => {
      setShareFeedback((prev) => (prev?.startsWith('Saved PNG') ? null : prev));
    }, 4500);
  };

  const handleDownloadPdf = async () => {
    setShareFeedback(null);
    const pngDataUrl = await generateReceiptPngDataUrl();
    if (!pngDataUrl) {
      setShareFeedback('Could not generate PDF receipt.');
      return;
    }

    try {
      setIsExporting(true);
      const { blob, dataUrl } = await buildSinglePageReceiptPdfBlob(pngDataUrl);
      const filename = `${getSafeReceiptBaseFilename()}.pdf`;

      // iOS Safari mobile browsers prefer system Files/Share sheet for PDF blobs
      const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
      if (isIOS && typeof File !== 'undefined' && typeof navigator.share === 'function') {
        try {
          const pdfFile = new File([blob], filename, { type: 'application/pdf' });
          if (navigator.canShare?.({ files: [pdfFile] })) {
            await navigator.share({
              files: [pdfFile],
              title: filename,
            });
            setShareFeedback(`PDF ready: ${filename}`);
            return;
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
        }
      }

      // Direct .pdf file download (works cleanly on Mobile Chrome/Edge & Desktop)
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = blobUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();

      // If running inside Android APK WebView where <a download> isn't intercepted by OS DownloadManager,
      // also offer fallback open of PDF data URL if WebView ignores blob download.
      if (isRunningInMobileApp() && dataUrl) {
        const win = window as any;
        if (win.AndroidNative?.shareToMessenger) {
          setShareFeedback(
            `PDF generated (${filename}). Use "Download PNG" or "Messenger" on Android App if WebView skips Downloads.`
          );
          setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
            setShareFeedback((prev) => (prev?.includes(filename) ? null : prev));
          }, 6000);
          return;
        }
      }

      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      setShareFeedback(`Downloaded PDF: ${filename}`);
      setTimeout(() => {
        setShareFeedback((prev) => (prev?.startsWith('Downloaded PDF') ? null : prev));
      }, 4500);
    } catch {
      setShareFeedback('Could not build PDF file. Try Download PNG instead.');
    } finally {
      setIsExporting(false);
    }
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
      settings.apartmentName || 'Rental Management',
      settings
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

  const isRateLockedReceipt = Boolean(bill.isArchived || bill.status === 'paid');
  const billMonthKey = normalizeMonthKey(bill.billingPeriod);
  const nextMonthKey = getAdjacentMonthKey(billMonthKey, 1);
  const scheduledRateMonthKeys = Array.from(
    new Set([
      billMonthKey,
      nextMonthKey,
      ...getScheduledMonthKeys(new Date(`1 ${bill.billingPeriod}`), 3, settings.monthlyElectricRates),
    ])
  ).sort();
  const nextMonthRate = getElectricRateForPeriod(settings, nextMonthKey);

  return (
    <div className="receipt-print-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="receipt-print-shell w-full max-w-3xl rounded-3xl bg-[#111724] border border-[#243148] shadow-2xl overflow-hidden my-auto flex flex-col max-h-[94vh] animate-modal-pop relative">
        {/* Modal Top Control Header (Hidden when printed) */}
        <div className="no-print flex items-center justify-between gap-2.5 px-4 sm:px-6 py-3 bg-[#162030] border-b border-[#243148] shrink-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="text-xs sm:text-sm font-black text-white">
              Official Statement &amp; Receipt
            </span>
            <span className="font-mono-num text-[11px] sm:text-xs bg-amber-500/15 text-amber-400 font-bold px-2.5 py-0.5 rounded-full border border-amber-500/30">
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

        {/* Non-print Quick Monthly Electric Rate Controls */}
        {onApplyMonthlyRate && (
          <div className="no-print px-4 sm:px-6 py-2.5 bg-[#0F1624] border-b border-[#243148] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            {isRateLockedReceipt ? (
              <div className="flex items-center gap-2 text-[11px] text-slate-300">
                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  Previous applied receipt locked at{' '}
                  <strong className="text-amber-300 font-mono-num">
                    {formatPeso(bill.electricRate)}/kWh
                  </strong>{' '}
                  — future rate updates will not alter this receipt.
                </span>
              </div>
            ) : (
              <>
                <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Apply Monthly Electric Rate (reflects instantly on active receipt):</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <select
                    value={quickRateMonthKey}
                    onChange={(e) => {
                      const nextKey = e.target.value;
                      setQuickRateMonthKey(nextKey);
                      setQuickRateValue(
                        String(getElectricRateForPeriod(settings, nextKey))
                      );
                    }}
                    className="h-8 rounded-lg bg-[#162030] border border-[#2B3B56] px-2.5 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
                  >
                    {scheduledRateMonthKeys.map((mk) => (
                      <option key={mk} value={mk}>
                        {formatMonthKeyLabel(mk, 'long')}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center h-8 rounded-lg bg-[#162030] border border-amber-500/40 px-2">
                    <span className="text-xs font-bold text-amber-400 mr-1">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={quickRateValue}
                      onChange={(e) => setQuickRateValue(e.target.value)}
                      className="w-18 bg-transparent text-xs font-extrabold font-mono-num text-amber-300 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const parsed = parseFloat(quickRateValue);
                      if (!Number.isFinite(parsed) || parsed < 0) return;
                      onApplyMonthlyRate(quickRateMonthKey, parsed);
                    }}
                    className="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs cursor-pointer transition"
                  >
                    Apply Rate
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Floating Notification Toast */}
        {shareFeedback && (
          <div className="no-print absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs shadow-2xl border border-amber-400 flex items-center gap-2 animate-modal-pop max-w-[92%] text-center">
            <Check className="w-4 h-4 text-slate-950 shrink-0" />
            <span>{shareFeedback}</span>
          </div>
        )}

        {/* Scrollable Backdrop Container */}
        <div className="receipt-sheet-container flex-1 overflow-y-auto p-2.5 sm:p-6 bg-[#090D15]">
          <div
            ref={receiptRef}
            id="receipt-printable-sheet"
            className="receipt-white-sheet mx-auto w-full max-w-[680px] bg-white text-slate-900 rounded-2xl p-4 sm:p-7 shadow-2xl font-sans border border-slate-200 relative space-y-4"
          >
            {/* 1. Clean Text-Only Centered Letterhead (No System Logo) */}
            <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1.5">
              <h1 className="text-lg sm:text-xl font-black uppercase tracking-tight text-slate-950 leading-snug break-words">
                {settings.apartmentName || 'Rental Property Statement'}
              </h1>
              <p className="text-[11px] sm:text-xs font-bold text-slate-600 uppercase tracking-widest">
                Official Statement of Account &amp; Sub-Meter Receipt
              </p>
              <p className="text-xs text-slate-600">
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

              {/* Status & Receipt Metadata Bar */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 text-xs">
                <span
                  className={`inline-block px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider border ${
                    bill.status === 'paid'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-600'
                      : bill.status === 'partial'
                      ? 'bg-amber-50 text-amber-800 border-amber-600'
                      : 'bg-red-50 text-red-800 border-red-600'
                  }`}
                >
                  {bill.status === 'paid'
                    ? `PAID FOR ${bill.billingPeriod.toUpperCase()}`
                    : bill.status === 'partial'
                    ? `PARTIAL • ${bill.billingPeriod.toUpperCase()}`
                    : `DUE • ${bill.billingPeriod.toUpperCase()}`}
                </span>
                <span className="font-mono-num font-extrabold text-slate-950">
                  OR #{bill.receiptNo}
                </span>
                <span className="text-slate-400">•</span>
                <span className="font-mono-num text-slate-600">
                  Issued {formattedIssueDate}
                </span>
              </div>
            </div>

            {/* 2. Aligned Unit & Tenant Summary Grid (Flush Mobile 2x2 & Desktop 4x1) */}
            <div className="border border-slate-300 rounded-xl overflow-hidden bg-slate-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px text-center">
                <div className="bg-slate-50 p-3 flex flex-col justify-center">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Unit / Room
                  </span>
                  <strong className="text-xs sm:text-sm font-black text-slate-950 block mt-1 break-words">
                    {bill.roomName}
                  </strong>
                </div>
                <div className="bg-slate-50 p-3 flex flex-col justify-center">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Tenant
                  </span>
                  <strong className="text-xs sm:text-sm font-black text-slate-900 block mt-1 break-words leading-snug">
                    {bill.tenantName}
                  </strong>
                  {bill.tenantPhone && (
                    <span className="text-[11px] font-mono-num text-slate-600 block mt-0.5">
                      {maskPhoneNumber(bill.tenantPhone, maskContactsOnReceipt)}
                    </span>
                  )}
                </div>
                <div className="bg-slate-50 p-3 flex flex-col justify-center">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Billing Month
                  </span>
                  <strong className="text-xs sm:text-sm font-extrabold text-slate-900 block mt-1">
                    {bill.billingPeriod}
                  </strong>
                </div>
                <div className="bg-slate-50 p-3 flex flex-col justify-center">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Due Date (1st–10th)
                  </span>
                  <strong className="text-xs sm:text-sm font-black font-mono-num text-slate-950 block mt-1">
                    {formattedDueDate}
                  </strong>
                </div>
              </div>
            </div>

            {/* 3. Monthly Electric Rate Breakdown & Billing Schedule */}
            <div className="border border-slate-300 rounded-xl p-3.5 sm:p-4 bg-slate-50/70 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-1.5">
                  <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                    Monthly Electric Rate Breakdown
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-700">
                  {isRateLockedReceipt ? 'Locked (Applied Receipt)' : 'Live Rate Schedule'}
                </span>
              </div>

              {/* Clean Aligned Per-Month Electric Rate Table */}
              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                  {scheduledRateMonthKeys.slice(0, 4).map((mk) => {
                    const isBillMonth = mk === billMonthKey;
                    const isNextMonth = mk === nextMonthKey;
                    const displayRate = isBillMonth
                      ? bill.electricRate
                      : getElectricRateForPeriod(settings, mk);
                    return (
                      <div
                        key={mk}
                        className={`px-3 py-2 flex items-center justify-between gap-2 text-xs border-b border-slate-100 last:border-b-0 ${
                          isBillMonth ? 'bg-amber-50/60' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-slate-900">
                            {formatMonthKeyLabel(mk, 'long')}
                          </span>
                          {isBillMonth && (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                              Applied
                            </span>
                          )}
                          {isNextMonth && !isBillMonth && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                              Next
                            </span>
                          )}
                        </div>
                        <span className="font-mono-num font-black text-slate-950 shrink-0">
                          {formatPeso(displayRate)} / kWh
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* This Cycle vs Next Cycle Alignment Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                      This Cycle ({cycleSchedule.currentLabel})
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                      Active
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Coverage</span>
                    <span className="font-mono-num font-semibold text-slate-900">
                      {cycleSchedule.currentRange}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Rent Rate</span>
                    <span className="font-mono-num font-bold text-slate-950">
                      {formatPeso(bill.baseRent)} / mo
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-600">
                      Electric ({bill.consumptionKwh.toFixed(1)} kWh)
                    </span>
                    <span className="font-mono-num font-bold text-slate-950 text-right">
                      {formatPeso(bill.electricRate)}/kWh = {formatPeso(bill.electricTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Due Date</span>
                    <span className="font-mono-num font-bold text-slate-900">
                      {formattedDueDate}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                      Next Cycle ({cycleSchedule.nextLabel})
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      Upcoming
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Coverage</span>
                    <span className="font-mono-num font-semibold text-slate-900">
                      {cycleSchedule.nextRange}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Rent Rate</span>
                    <span className="font-mono-num font-bold text-slate-950">
                      {formatPeso(bill.baseRent)} / mo
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-600">Start Meter &amp; Rate</span>
                    <span className="font-mono-num font-bold text-slate-950 text-right">
                      {bill.currReading.toFixed(1)} kWh (@{formatPeso(nextMonthRate)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">
                      Next Due (Day {cycleSchedule.dueDayNumber})
                    </span>
                    <span className="font-mono-num font-bold text-slate-900">
                      {cycleSchedule.nextDueLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Section I: Sub-Meter Readings & Proof */}
            <div className="border border-slate-300 rounded-xl p-3.5 sm:p-4 bg-slate-50/70 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                    Section I • Electric Sub-Meter Proof
                  </span>
                </div>
                <span className="text-xs font-mono-num font-extrabold text-slate-900 bg-white px-2.5 py-0.5 rounded border border-slate-300">
                  Rate ({bill.billingPeriod}): {formatPeso(bill.electricRate)}/kWh
                </span>
              </div>

              {/* Dual Sub-Meter Columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Previous Reading */}
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 flex flex-col justify-between gap-2">
                  <div className="flex items-center justify-between gap-2 text-xs pb-1.5 border-b border-slate-200">
                    <span className="font-bold uppercase text-slate-600">
                      1. Previous Meter
                    </span>
                    <span className="font-mono-num font-black text-slate-950">
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
                      className="relative group cursor-zoom-in overflow-hidden rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center h-24 p-1"
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
                      className="no-print w-full py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <ZoomIn className="w-3.5 h-3.5 text-amber-600" />
                      <span>Inspect Photo</span>
                    </button>
                  )}
                </div>

                {/* Current Reading */}
                <div className="rounded-lg border border-slate-200 bg-white p-2.5 flex flex-col justify-between gap-2">
                  <div className="flex items-center justify-between gap-2 text-xs pb-1.5 border-b border-slate-200">
                    <span className="font-bold uppercase text-slate-600">
                      2. Current Meter
                    </span>
                    <span className="font-mono-num font-black text-slate-950">
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
                      className="relative group cursor-zoom-in overflow-hidden rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center h-24 p-1"
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
                      className="no-print w-full py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <ZoomIn className="w-3.5 h-3.5 text-amber-600" />
                      <span>Inspect Photo</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Centered Computation Strip */}
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-center text-xs text-slate-800 leading-relaxed">
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

            {/* 5. Section II: Itemized Statement of Charges & Deposit Deductions */}
            <div className="border border-slate-300 rounded-xl overflow-hidden bg-white">
              <div className="bg-slate-100 px-3.5 sm:px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-800">
                <span>Section II • Statement of Charges</span>
                <span>Amount (PHP)</span>
              </div>
              <div className="divide-y divide-slate-200 text-xs sm:text-[13px]">
                <div className="px-3.5 sm:px-4 py-2.5 flex items-start justify-between gap-3 text-slate-800">
                  <span>1. Monthly Base Rent ({bill.billingPeriod})</span>
                  <span className="font-mono-num font-bold text-slate-950 shrink-0 text-right">
                    {formatPeso(bill.baseRent)}
                  </span>
                </div>

                <div className="px-3.5 sm:px-4 py-2.5 flex items-start justify-between gap-3 text-slate-800">
                  <span>
                    2. Sub-Meter Electricity ({bill.consumptionKwh.toFixed(1)} kWh @{' '}
                    {formatPeso(bill.electricRate)}/kWh)
                  </span>
                  <span className="font-mono-num font-bold text-slate-950 shrink-0 text-right">
                    {formatPeso(bill.electricTotal)}
                  </span>
                </div>

                {bill.previousBalanceCarryOver > 0 && (
                  <div className="px-3.5 sm:px-4 py-2.5 flex items-start justify-between gap-3 text-red-700 font-bold bg-red-50/50">
                    <span>3. Unpaid Balance Carried Over</span>
                    <span className="font-mono-num shrink-0 text-right">
                      {formatPeso(bill.previousBalanceCarryOver)}
                    </span>
                  </div>
                )}

                {(bill.securityDepositApplied || 0) > 0 && (
                  <div className="px-3.5 sm:px-4 py-2.5 flex items-start justify-between gap-3 text-emerald-800 font-bold bg-emerald-50/60">
                    <span>
                      Required Deposit Paid Deducted
                      {(bill.securityDepositRemainingAfterBill || 0) > 0
                        ? ` (${formatPeso(bill.securityDepositRemainingAfterBill || 0)} carries to further months)`
                        : ''}
                    </span>
                    <span className="font-mono-num shrink-0 text-right">
                      −{formatPeso(bill.securityDepositApplied || 0)}
                    </span>
                  </div>
                )}

                {(bill.advanceApplied || 0) > 0 && (
                  <div className="px-3.5 sm:px-4 py-2.5 flex items-start justify-between gap-3 text-emerald-800 font-bold bg-emerald-50/40">
                    <span>Advance Credit Applied</span>
                    <span className="font-mono-num shrink-0 text-right">
                      −{formatPeso(bill.advanceApplied || 0)}
                    </span>
                  </div>
                )}

                {bill.depositApplied > 0 &&
                  !(bill.securityDepositApplied || 0) &&
                  !(bill.advanceApplied || 0) && (
                    <div className="px-3.5 sm:px-4 py-2.5 flex items-start justify-between gap-3 text-emerald-800 font-bold bg-emerald-50/50">
                      <span>Deposit / Advance Credit Applied</span>
                      <span className="font-mono-num shrink-0 text-right">
                        −{formatPeso(bill.depositApplied)}
                      </span>
                    </div>
                  )}

                {bill.securityDepositRequired > 0 && (
                  <div className="px-3.5 sm:px-4 py-2.5 flex items-start justify-between gap-3 text-xs text-slate-600 bg-slate-50/60">
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        Required Security Deposit (Deductible When Paid)
                      </span>
                    </span>
                    <span className="font-mono-num font-semibold shrink-0 text-right">
                      {formatPeso(bill.securityDepositRequired)}
                    </span>
                  </div>
                )}
              </div>

              {/* Settlement Summary Box */}
              <div className="bg-slate-50 border-t-2 border-slate-900 px-3.5 sm:px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-black uppercase text-slate-950">
                    Net Total Amount Due
                  </span>
                  <span className="text-lg sm:text-xl font-black font-mono-num text-slate-950">
                    {formatPeso(bill.totalAmountDue)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-xs text-slate-700">
                  <span>
                    Cash / Transfer Paid{bill.paymentMethod ? ` (${bill.paymentMethod})` : ''}
                  </span>
                  <span className="font-mono-num font-bold text-emerald-700">
                    {formatPeso(bill.amountPaid)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-xs font-black text-slate-900">
                  <span>Remaining Balance ({bill.billingPeriod})</span>
                  <span
                    className={`font-mono-num font-black ${
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
                    <span className="font-mono-num">
                      +{formatPeso(bill.overpaymentToAdvance)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 6. Clean Verification Seal & Official Footer */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-1.5">
              <div className="inline-flex items-center justify-center gap-1.5 text-[11px] text-slate-600 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  Payment Window: 1st–10th Monthly • Statement Verification
                </span>
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-mono-num font-black text-emerald-700 tracking-wider">
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

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isExporting}
              className="flex-1 sm:flex-none h-11 py-2.5 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/15 transition cursor-pointer btn-fluid"
            >
              <Download className="w-4 h-4" />
              <span>Download PNG</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="flex-1 sm:flex-none h-11 py-2.5 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/15 transition cursor-pointer btn-fluid"
            >
              <FileDown className="w-4 h-4" />
              <span>Download PDF</span>
            </button>

            {!isMobileDevice() && !isRunningInMobileApp() && (
              <button
                type="button"
                onClick={() => window.print()}
                className="h-11 py-2.5 px-3.5 rounded-xl bg-[#1A2335] hover:bg-[#24314A] border border-[#2A3955] text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Print</span>
              </button>
            )}
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
