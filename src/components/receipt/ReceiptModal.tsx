import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileDown,
  Loader2,
  Lock,
  Printer,
  Share2,
  X,
  Zap,
} from 'lucide-react';
import { AppSettings, BillRecord } from '../../types/rental';
import {
  formatMessengerBillSummary,
  formatMonthKeyLabel,
  formatPeso,
  getElectricRateForPeriod,
  getScheduledMonthKeys,
  isRunningInMobileApp,
  normalizeMonthKey,
} from '../../utils/billingCalculator';
import {
  buildA4ReceiptPdfFromElement,
  buildReceiptDocumentMeta,
  captureReceiptPngFromElement,
  copyReceiptElementAsPng,
} from '../../utils/pdfReceiptGenerator';
import {
  generateSimulatedSubMeterDataUrl,
  generateSimulatedValueCropDataUrl,
} from '../../services/ocrService';
import { useResolvedMeterImage } from '../../utils/resolveMeterImage';
import { shareReceiptDocument } from '../../services/notificationService';
import { MeterPhotoLightboxModal } from '../ocr/MeterPhotoLightboxModal';
import { PrintableA4Receipt } from './PrintableA4Receipt';

interface ReceiptModalProps {
  bill: BillRecord | null;
  roomAdvanceBalance?: number;
  settings: AppSettings;
  onApplyMonthlyRate?: (monthKeyOrPeriod: string, rate: number) => void;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  bill,
  roomAdvanceBalance,
  settings,
  onApplyMonthlyRate,
  onClose,
}) => {
  const printableRef = useRef<HTMLDivElement | null>(null);
  const [maskContactsOnReceipt, setMaskContactsOnReceipt] = useState<boolean>(
    () => settings.maskReceiptContacts ?? true
  );
  const [isExporting, setIsExporting] = useState(false);
  const [isCopyingPng, setIsCopyingPng] = useState(false);
  const [copiedPngSuccess, setCopiedPngSuccess] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [quickRateError, setQuickRateError] = useState<string | null>(null);
  const [showYtdSchedule, setShowYtdSchedule] = useState(false);
  const [quickRateMonthKey, setQuickRateMonthKey] = useState<string>(() =>
    normalizeMonthKey(bill?.billingPeriod)
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

  useEffect(() => {
    if (!bill) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bill, onClose]);

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

  // Sub-meter photos and zoomed register value crops (async-resolved from IndexedDB when offloaded)
  const resolvedPrevPhoto = useResolvedMeterImage(bill?.prevMeterPhotoDataUrl);
  const resolvedPrevCrop = useResolvedMeterImage(bill?.prevMeterCropDataUrl);
  const resolvedCurrPhoto = useResolvedMeterImage(bill?.meterPhotoDataUrl);
  const resolvedCurrCrop = useResolvedMeterImage(bill?.currMeterCropDataUrl);

  const prevMeterProofImg = useMemo(() => {
    if (!bill) return '';
    return resolvedPrevPhoto || generateSimulatedSubMeterDataUrl(bill.prevReading);
  }, [bill?.prevReading, resolvedPrevPhoto]);

  const prevMeterCropImg = useMemo(() => {
    if (!bill) return '';
    return resolvedPrevCrop || generateSimulatedValueCropDataUrl(bill.prevReading);
  }, [bill?.prevReading, resolvedPrevCrop]);

  const currMeterProofImg = useMemo(() => {
    if (!bill) return '';
    return resolvedCurrPhoto || generateSimulatedSubMeterDataUrl(bill.currReading);
  }, [bill?.currReading, resolvedCurrPhoto]);

  const currMeterCropImg = useMemo(() => {
    if (!bill) return '';
    return resolvedCurrCrop || generateSimulatedValueCropDataUrl(bill.currReading);
  }, [bill?.currReading, resolvedCurrCrop]);

  if (!bill) return null;

  const receiptMeta = buildReceiptDocumentMeta(bill);
  const resolvedRemainingAdvance = Math.max(
    0,
    typeof bill.advanceBalanceAfter === 'number'
      ? bill.advanceBalanceAfter
      : roomAdvanceBalance ?? 0
  );

  const capturePrintablePngDataUrl = async (): Promise<string | null> => {
    if (!printableRef.current) return null;
    try {
      setIsExporting(true);
      const result = await captureReceiptPngFromElement(printableRef.current, {
        pixelRatio: 2.5,
      });
      return result.dataUrl;
    } catch {
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  const captureA4PdfBundle = async () => {
    if (!printableRef.current) return null;
    try {
      setIsExporting(true);
      return await buildA4ReceiptPdfFromElement(printableRef.current, {
        pixelRatio: 2,
        jpegQuality: 0.92,
      });
    } catch {
      return null;
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPng = async () => {
    setShareFeedback(null);
    const dataUrl = await capturePrintablePngDataUrl();
    if (!dataUrl) {
      setShareFeedback('Could not generate PNG receipt.');
      return;
    }
    const filename = receiptMeta.pngFilename;
    const win = window as unknown as {
      AndroidNative?: {
        savePngReceipt?: (pngBase64: string, fileName: string) => boolean;
      };
    };

    if (
      isRunningInMobileApp() &&
      win.AndroidNative &&
      typeof win.AndroidNative.savePngReceipt === 'function'
    ) {
      try {
        if (win.AndroidNative.savePngReceipt(dataUrl, filename)) {
          setShareFeedback(`Saved PNG to Downloads: ${filename}`);
          setTimeout(() => {
            setShareFeedback((prev) => (prev?.includes(filename) ? null : prev));
          }, 4500);
          return;
        }
      } catch {
        // fall through to anchor download
      }
    }

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
    const pdfBundle = await captureA4PdfBundle();
    if (!pdfBundle) {
      setShareFeedback('Could not generate A4 PDF receipt.');
      return;
    }

    try {
      const { blob, dataUrl, pageCount } = pdfBundle;
      const filename = receiptMeta.pdfFilename;
      const win = window as unknown as {
        AndroidNative?: {
          savePdfReceipt?: (pdfBase64: string, fileName: string) => boolean;
          sharePdfReceipt?: (
            pdfBase64: string,
            fileName: string,
            summaryText: string,
            preferMessenger: boolean
          ) => boolean;
        };
      };

      // Native Android APK: write real PDF directly into Downloads/4Rent or Share chooser
      if (isRunningInMobileApp() && win.AndroidNative) {
        if (typeof win.AndroidNative.savePdfReceipt === 'function') {
          const saved = win.AndroidNative.savePdfReceipt(dataUrl, filename);
          if (saved) {
            setShareFeedback(`Saved A4 PDF (${pageCount}p): ${filename}`);
            setTimeout(() => {
              setShareFeedback((prev) => (prev?.includes(filename) ? null : prev));
            }, 5000);
            return;
          }
        }
        if (typeof win.AndroidNative.sharePdfReceipt === 'function') {
          win.AndroidNative.sharePdfReceipt(dataUrl, filename, receiptMeta.shareTitle, false);
          setShareFeedback(`PDF ready (${pageCount}p): ${filename}`);
          return;
        }
      }

      // iOS Safari mobile browsers prefer system Files/Share sheet for PDF blobs
      const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
      if (isIOS && typeof File !== 'undefined' && typeof navigator.share === 'function') {
        try {
          const pdfFile = new File([blob], filename, { type: 'application/pdf' });
          if (navigator.canShare?.({ files: [pdfFile] })) {
            await navigator.share({
              files: [pdfFile],
              title: receiptMeta.shareTitle,
            });
            setShareFeedback(`A4 PDF ready (${pageCount}p): ${filename}`);
            return;
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
        }
      }

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = blobUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      setShareFeedback(`Downloaded A4 PDF (${pageCount}p): ${filename}`);
      setTimeout(() => {
        setShareFeedback((prev) => (prev?.startsWith('Downloaded A4 PDF') ? null : prev));
      }, 4500);
    } catch {
      setShareFeedback('Could not save PDF file. Try Share Receipt instead.');
    }
  };

  const handlePrintReceipt = () => {
    setShareFeedback(null);
    const win = window as unknown as {
      AndroidNative?: {
        printCurrentPage?: (jobName: string) => boolean;
      };
    };
    if (
      isRunningInMobileApp() &&
      win.AndroidNative &&
      typeof win.AndroidNative.printCurrentPage === 'function'
    ) {
      try {
        if (win.AndroidNative.printCurrentPage(receiptMeta.shareTitle)) {
          return;
        }
      } catch {
        // fall through to browser print
      }
    }
    window.print();
  };

  const handleShareReceipt = async () => {
    setShareFeedback(null);
    const pdfBundle = await captureA4PdfBundle();
    const summaryText = formatMessengerBillSummary(
      bill,
      settings.apartmentName || '4Rent Management System',
      settings
    );

    const res = await shareReceiptDocument({
      mode: 'share',
      textSummary: summaryText,
      pdfBlob: pdfBundle?.blob,
      pdfDataUrl: pdfBundle?.dataUrl,
      pngDataUrl: pdfBundle?.pngDataUrl,
      receiptNo: bill.receiptNo,
      tenantName: bill.tenantName,
      roomName: bill.roomName,
      messengerHandle: bill.tenantMessenger,
      shareUrl: window.location.href,
    });
    setShareFeedback(res.message);
    setTimeout(() => {
      setShareFeedback((prev) => (prev === res.message ? null : prev));
    }, 5500);
  };

  const handleCopyReceiptAsPng = async () => {
    if (!printableRef.current) return;
    setShareFeedback(null);
    setCopiedPngSuccess(false);
    setIsCopyingPng(true);
    try {
      const res = await copyReceiptElementAsPng(printableRef.current, {
        filename: receiptMeta.pngFilename,
        shareTitle: receiptMeta.shareTitle,
        pixelRatio: 2.5,
      });
      setShareFeedback(res.message);
      if (res.ok && (res.method === 'electron_clipboard' || res.method === 'clipboard_api')) {
        setCopiedPngSuccess(true);
        setTimeout(() => setCopiedPngSuccess(false), 3000);
      }
      setTimeout(() => {
        setShareFeedback((prev) => (prev === res.message ? null : prev));
      }, 5500);
    } finally {
      setIsCopyingPng(false);
    }
  };

  const isRateLockedReceipt = Boolean(bill.isArchived || bill.status === 'paid');
  const billMonthKey = normalizeMonthKey(bill.billingPeriod);
  const scheduledRateMonthKeys = getScheduledMonthKeys(
    billMonthKey,
    0,
    settings.monthlyElectricRates
  );

  return (
    <div
      className="receipt-print-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Official Statement and Receipt"
    >
      <div className="receipt-print-shell w-full max-w-3xl rounded-2xl sm:rounded-3xl bg-[#111724] border border-[#243148] shadow-2xl overflow-hidden my-auto flex flex-col max-h-[94dvh] animate-modal-pop relative">
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
                  </strong>
                  : future rate updates will not alter this receipt.
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
                      type="text"
                      inputMode="decimal"
                      placeholder="12.50"
                      value={quickRateValue}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '');
                        if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                        setQuickRateValue(raw);
                        setQuickRateError(null);
                      }}
                      className="w-18 bg-transparent text-xs font-extrabold font-mono-num text-amber-300 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = quickRateValue.trim();
                      const parsed = trimmed === '' ? Number.NaN : Number(trimmed);
                      if (!Number.isFinite(parsed) || parsed < 0) {
                        setQuickRateError('Enter a valid non-negative rate (e.g., 12.50).');
                        return;
                      }
                      setQuickRateError(null);
                      onApplyMonthlyRate(quickRateMonthKey, parsed);
                    }}
                    className="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs cursor-pointer transition"
                  >
                    Apply Rate
                  </button>
                  {quickRateError && (
                    <span className="w-full text-[11px] text-red-400">
                      {quickRateError}
                    </span>
                  )}
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

        {/* Canonical Interactive Receipt Preview (Identical to Exported PDF/PNG/Print Document) */}
        <div className="receipt-mobile-interactive receipt-sheet-container flex-1 overflow-y-auto p-2.5 sm:p-5 bg-[#090D15] space-y-3">
          {/* Optional Non-Print YTD Monthly Electric Rate Lookup Drawer */}
          <div className="no-print max-w-[794px] mx-auto rounded-xl border border-[#243148] bg-[#141C2B] p-2.5 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                <CalendarClock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Monthly Electric Rate Schedule ({billMonthKey.split('-')[0]})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowYtdSchedule((prev) => !prev)}
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-[#0F1522] border border-[#2B3B56] text-slate-200 hover:border-amber-500/40 cursor-pointer transition"
              >
                <span>{showYtdSchedule ? 'Hide YTD Table' : 'View YTD Rate Table'}</span>
                {showYtdSchedule ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            </div>

            {showYtdSchedule && (
              <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                {scheduledRateMonthKeys.map((mk) => {
                  const isBillMonth = mk === billMonthKey;
                  const hasCustomOverride =
                    settings.monthlyElectricRates?.[mk] !== undefined;
                  const displayRate = isBillMonth
                    ? bill.electricRate
                    : getElectricRateForPeriod(settings, mk);
                  return (
                    <div
                      key={mk}
                      className={`rounded-lg border px-2 py-1.5 text-xs ${
                        isBillMonth
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                          : 'bg-[#0F1522] border-[#25324A] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 text-[10px]">
                        <span className="font-bold truncate">
                          {formatMonthKeyLabel(mk, 'short')}
                        </span>
                        {isBillMonth ? (
                          <span className="text-[8.5px] font-extrabold text-amber-400">
                            Applied
                          </span>
                        ) : hasCustomOverride ? (
                          <span className="text-[8.5px] font-bold text-sky-400">
                            Custom
                          </span>
                        ) : null}
                      </div>
                      <div className="font-mono-num font-extrabold text-[11px] text-white mt-0.5">
                        {formatPeso(displayRate)}/kWh
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <PrintableA4Receipt
            interactiveMode
            bill={bill}
            settings={settings}
            maskContactsOnReceipt={maskContactsOnReceipt}
            prevMeterProofImg={prevMeterProofImg}
            prevMeterCropImg={prevMeterCropImg}
            currMeterProofImg={currMeterProofImg}
            currMeterCropImg={currMeterCropImg}
            remainingAdvanceCredit={resolvedRemainingAdvance}
            onInspectPhoto={openLightbox}
          />
        </div>

        {/* Dedicated Offscreen A4 Portrait Document Used for PDF Export, PNG Export, Sharing & Print */}
        <div
          aria-hidden="true"
          className="printable-a4-stage fixed -left-[9999px] top-0 w-[794px] bg-white pointer-events-none z-[-1]"
        >
          <PrintableA4Receipt
            ref={printableRef}
            bill={bill}
            settings={settings}
            maskContactsOnReceipt={maskContactsOnReceipt}
            prevMeterProofImg={prevMeterProofImg}
            prevMeterCropImg={prevMeterCropImg}
            currMeterProofImg={currMeterProofImg}
            currMeterCropImg={currMeterCropImg}
            remainingAdvanceCredit={resolvedRemainingAdvance}
          />
        </div>

        {/* Modal Bottom Action Toolbar (Hidden when printed) */}
        <div className="no-print px-3 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#141C2B] border-t border-[#243148] flex flex-col gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyReceiptAsPng}
              disabled={isExporting || isCopyingPng}
              className={`flex-1 min-w-[180px] h-11 py-2 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition cursor-pointer btn-fluid ${
                copiedPngSuccess
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                  : 'bg-[#0084FF] hover:bg-[#1890FF] text-white shadow-blue-500/20'
              }`}
              title="Copy high-resolution PNG receipt to clipboard for pasting into Messenger or any chat app"
            >
              {isCopyingPng ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : copiedPngSuccess ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>
                {isCopyingPng
                  ? 'Copying PNG Receipt...'
                  : copiedPngSuccess
                  ? 'Copied PNG! Paste in Messenger'
                  : 'Copy Receipt as PNG'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleShareReceipt}
              disabled={isExporting || isCopyingPng}
              className="h-11 py-2 px-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-500/20 transition cursor-pointer btn-fluid"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Receipt</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="h-10 py-2 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] sm:text-xs flex items-center justify-center gap-1 shadow-md shadow-emerald-500/15 transition cursor-pointer btn-fluid"
            >
              <FileDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isExporting}
              className="h-10 py-2 px-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] sm:text-xs flex items-center justify-center gap-1 shadow-md shadow-amber-500/15 transition cursor-pointer btn-fluid"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Download PNG</span>
            </button>

            <button
              type="button"
              onClick={handlePrintReceipt}
              className="h-10 py-2 px-2 rounded-xl bg-[#1A2335] hover:bg-[#24314A] border border-[#2A3955] text-white font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1 transition cursor-pointer btn-fluid"
            >
              <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
              <span>Print Receipt</span>
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
