import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  Camera,
  CheckCircle2,
  Cpu,
  FileCheck2,
  ImagePlus,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { BillRecord, Room } from '../../types/rental';
import {
  calculateBillBreakdown,
  calculateSubMeterDifference,
  formatPeso,
} from '../../utils/billingCalculator';
import {
  generateSimulatedSubMeterDataUrl,
  preprocessMeterImage,
  recognizeSubMeterReading,
} from '../../services/ocrService';

interface SubMeterScannerModalProps {
  isOpen: boolean;
  rooms: Room[];
  initialRoom?: Room | null;
  onClose: () => void;
  onGenerateBill: (
    newBill: BillRecord,
    updatedRoomLastReading: number,
    updatedRoomUnpaidBalance: number
  ) => void;
}

export const SubMeterScannerModal: React.FC<SubMeterScannerModalProps> = ({
  isOpen,
  rooms,
  initialRoom,
  onClose,
  onGenerateBill,
}) => {
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const selectedRoom =
    rooms.find((r) => r.id === selectedRoomId) || initialRoom || rooms[0];

  // Sub-meter & billing fields
  const [prevReading, setPrevReading] = useState('0');
  const [currReading, setCurrReading] = useState('0');
  const [electricRate, setElectricRate] = useState('15');
  const [baseRent, setBaseRent] = useState('4500');
  const [carryOverBalance, setCarryOverBalance] = useState('0');
  const [depositApplied, setDepositApplied] = useState('0');
  const [billingPeriod, setBillingPeriod] = useState(() =>
    new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  );
  const [dueDate, setDueDate] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [initialPayStatus, setInitialPayStatus] = useState<
    'unpaid' | 'paid' | 'partial'
  >('unpaid');
  const [initialAmountPaid, setInitialAmountPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<
    'Cash' | 'GCash' | 'Maya' | 'Bank Transfer'
  >('GCash');

  // OCR & Camera state
  const [scanTab, setScanTab] = useState<'upload' | 'camera' | 'simulate'>(
    'simulate'
  );
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrRawText, setOcrRawText] = useState<string>('');
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [meterSnapshotUrl, setMeterSnapshotUrl] = useState<string>('');
  const [ocrStatusMsg, setOcrStatusMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialRoom) {
      setSelectedRoomId(initialRoom.id);
    } else if (rooms.length > 0 && !selectedRoomId) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [initialRoom, rooms, selectedRoomId]);

  useEffect(() => {
    if (selectedRoom) {
      const prev = selectedRoom.lastMeterReading || 0;
      setPrevReading(String(prev));
      // Default simulated reading to prev + 48.5 kWh so the user immediately sees the difference
      setCurrReading(String(Math.round((prev + 48.5) * 10) / 10));
      setElectricRate(String(selectedRoom.electricRatePerKwh || 15));
      setBaseRent(String(selectedRoom.monthlyRent || 0));
      setCarryOverBalance(String(selectedRoom.unpaidBalance || 0));
      setDepositApplied('0');
      setMeterSnapshotUrl('');
      setOcrStatusMsg(null);
    }
  }, [selectedRoom?.id]);

  // Stop camera stream on close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    setOcrStatusMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setOcrStatusMsg(
        'Camera permission denied or no camera detected. Use Photo Upload or Simulated Sub-Meter OCR instead.'
      );
      setScanTab('simulate');
    }
  };

  const runOcrOnDataUrl = async (dataUrl: string) => {
    setIsOcrRunning(true);
    setOcrProgress(5);
    setOcrStatusMsg('Running Tesseract OCR on sub-meter digit window...');

    try {
      const result = await recognizeSubMeterReading(dataUrl, (pct) =>
        setOcrProgress(pct)
      );
      setMeterSnapshotUrl(result.processedImageDataUrl);
      setOcrRawText(result.rawText);
      setOcrConfidence(result.confidence);

      if (result.reading !== null) {
        setCurrReading(String(result.reading));
        setOcrStatusMsg(
          `OCR Extracted: ${result.reading.toFixed(1)} kWh (${
            result.confidence
          }% confidence)`
        );
      } else {
        setOcrStatusMsg(
          'OCR processed image, but digits were unclear. Please verify or enter reading below.'
        );
      }
    } catch {
      setOcrStatusMsg(
        'Could not run OCR automatically. You can still enter the reading manually.'
      );
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(100);
    }
  };

  const handleCaptureFromCamera = async () => {
    if (!videoRef.current) return;
    const croppedDataUrl = preprocessMeterImage(
      videoRef.current,
      { x: 0.1, y: 0.3, w: 0.8, h: 0.4 },
      true
    );
    stopCamera();
    await runOcrOnDataUrl(croppedDataUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const processed = preprocessMeterImage(
          img,
          { x: 0.05, y: 0.15, w: 0.9, h: 0.7 },
          true
        );
        await runOcrOnDataUrl(processed);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSimulateMeterOcr = async () => {
    const basePrev = parseFloat(prevReading) || 1000;
    const randomUsage = Math.round((35 + Math.random() * 55) * 10) / 10;
    const simulatedTarget = Math.round((basePrev + randomUsage) * 10) / 10;

    const fullMeterDataUrl = generateSimulatedSubMeterDataUrl(simulatedTarget);
    const img = new Image();
    img.onload = async () => {
      const cropped = preprocessMeterImage(
        img,
        { x: 0.14, y: 0.32, w: 0.72, h: 0.34 },
        false
      );
      await runOcrOnDataUrl(cropped);
    };
    img.src = fullMeterDataUrl;
  };

  if (!isOpen || !selectedRoom) return null;

  const prevNum = parseFloat(prevReading) || 0;
  const currNum = parseFloat(currReading) || 0;
  const rateNum = parseFloat(electricRate) || 0;
  const rentNum = parseFloat(baseRent) || 0;
  const carryNum = parseFloat(carryOverBalance) || 0;
  const depNum = parseFloat(depositApplied) || 0;

  const subMeterCheck = calculateSubMeterDifference({
    prevReading: prevNum,
    currReading: currNum,
    electricRate: rateNum,
  });

  const billBreakdown = calculateBillBreakdown({
    baseRent: rentNum,
    prevReading: prevNum,
    currReading: currNum,
    electricRate: rateNum,
    previousBalanceCarryOver: carryNum,
    depositApplied: depNum,
  });

  const handleConfirmGenerateBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subMeterCheck.isValid) return;

    const nowIso = new Date().toISOString();
    const totalDue = billBreakdown.totalAmountDue;

    let paidAmount = 0;
    if (initialPayStatus === 'paid') {
      paidAmount = totalDue;
    } else if (initialPayStatus === 'partial') {
      paidAmount = Math.min(
        totalDue,
        Math.max(0, parseFloat(initialAmountPaid) || 0)
      );
    }

    const remainingBalance = Math.max(
      0,
      Math.round((totalDue - paidAmount) * 100) / 100
    );
    const finalStatus: 'paid' | 'partial' | 'unpaid' =
      remainingBalance <= 0.009
        ? 'paid'
        : paidAmount > 0
        ? 'partial'
        : 'unpaid';

    const receiptCode = `4R-${new Date()
      .toISOString()
      .slice(0, 7)
      .replace('-', '')}-${String(Math.floor(100 + Math.random() * 900))}`;

    const newBill: BillRecord = {
      id: `bill-${Date.now()}`,
      receiptNo: receiptCode,
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      tenantName: selectedRoom.tenant?.fullName || 'Walk-in / Current Tenant',
      tenantPhone: selectedRoom.tenant?.phone,
      tenantMessenger: selectedRoom.tenant?.messengerUsername,
      billingPeriod,
      createdAt: nowIso,
      dueDate: new Date(dueDate).toISOString(),
      prevReading: prevNum,
      currReading: currNum,
      consumptionKwh: billBreakdown.consumptionKwh,
      electricRate: rateNum,
      electricTotal: billBreakdown.electricTotal,
      meterPhotoDataUrl: meterSnapshotUrl || undefined,
      ocrConfidence: ocrConfidence ?? undefined,
      baseRent: rentNum,
      previousBalanceCarryOver: carryNum,
      depositApplied: depNum,
      totalAmountDue: totalDue,
      amountPaid: paidAmount,
      remainingBalance,
      status: finalStatus,
      paymentMethod: paidAmount > 0 ? paymentMethod : undefined,
      paidAt: paidAmount > 0 ? nowIso : undefined,
      paymentHistory:
        paidAmount > 0
          ? [
              {
                id: `tx-${Date.now()}`,
                amount: paidAmount,
                method: paymentMethod,
                paidAt: nowIso,
                note:
                  finalStatus === 'paid'
                    ? 'Full payment upon billing'
                    : 'Initial partial payment',
              },
            ]
          : [],
      updatedAt: nowIso,
    };

    onGenerateBill(newBill, currNum, remainingBalance);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-3xl bg-[#141A25] border border-[#263147] shadow-2xl overflow-hidden my-6">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 bg-[#192130] border-b border-[#263147]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                OCR Sub-Meter Reader & Bill Calculator
              </h2>
              <p className="text-xs text-slate-400">
                Scan or upload electric sub-meter reading to compute kWh
                difference & generate printable receipt
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-[#10151F] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleConfirmGenerateBill}
          className="grid grid-cols-1 lg:grid-cols-12 max-h-[84vh] overflow-y-auto"
        >
          {/* Left Column: OCR Scanner & Sub-Meter Image Capture (7 cols) */}
          <div className="lg:col-span-7 p-5 sm:p-6 border-b lg:border-b-0 lg:border-r border-[#222C3F] space-y-5">
            {/* Room Selector & Billing Period */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Select Room / Unit
                </label>
                <select
                  value={selectedRoom.id}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="w-full rounded-xl bg-[#0D1119] border border-[#252F42] px-3.5 py-2.5 text-sm font-bold text-white focus:border-amber-500 focus:outline-none"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.tenant?.fullName || 'Vacant'} (Prev:{' '}
                      {r.lastMeterReading.toFixed(1)} kWh)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Billing Period
                  </label>
                  <input
                    type="text"
                    value={billingPeriod}
                    onChange={(e) => setBillingPeriod(e.target.value)}
                    className="w-full rounded-xl bg-[#0D1119] border border-[#252F42] px-3 py-2.5 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-xl bg-[#0D1119] border border-[#252F42] px-3 py-2.5 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Scanner Mode Switcher */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  Step 1: Capture or Scan Electric Sub-Meter (OCR)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setScanTab('simulate');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    scanTab === 'simulate'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-[#0E131C] text-slate-300 border-[#252F42] hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Simulate Meter OCR</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setScanTab('upload');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    scanTab === 'upload'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-[#0E131C] text-slate-300 border-[#252F42] hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Photo</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setScanTab('camera');
                    startCamera();
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    scanTab === 'camera'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-[#0E131C] text-slate-300 border-[#252F42] hover:text-white'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Live Camera</span>
                </button>
              </div>

              {/* Scanner Viewport */}
              <div className="relative rounded-2xl bg-[#0A0D13] border-2 border-[#252F42] overflow-hidden min-h-[210px] flex flex-col items-center justify-center p-4">
                {scanTab === 'camera' && isCameraActive ? (
                  <div className="relative w-full">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-56 object-cover rounded-xl"
                    />
                    {/* Sub-Meter Crop Guide Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-4/5 h-2/5 border-2 border-amber-400 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] flex items-start justify-between p-1.5">
                        <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-extrabold text-[10px]">
                          ALIGN SUB-METER DIGITS HERE
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCaptureFromCamera}
                      className="mt-3 w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      Capture & Extract Digits via OCR
                    </button>
                  </div>
                ) : scanTab === 'upload' ? (
                  <div className="text-center py-6">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <ImagePlus className="w-10 h-10 text-amber-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-white">
                      Upload or Take a Photo of the Sub-Meter
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      4Rent automatically crops the digit window, enhances
                      contrast, and extracts the kWh reading.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isOcrRunning}
                      className="mt-4 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      Select Meter Image
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-4 w-full">
                    <p className="text-xs text-slate-300 mb-3 max-w-md mx-auto">
                      Test the real <strong>Tesseract.js OCR</strong> engine by
                      generating a realistic kilowatt-hour sub-meter drum image
                      and scanning its digits:
                    </p>
                    <button
                      type="button"
                      onClick={handleSimulateMeterOcr}
                      disabled={isOcrRunning}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs inline-flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
                    >
                      {isOcrRunning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Scanning OCR ({ocrProgress}%)...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          <span>
                            Generate & Auto-Scan Sample Sub-Meter Image
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Cropped Meter Preview */}
                {meterSnapshotUrl && (
                  <div className="mt-4 w-full pt-3 border-t border-[#1E2636] flex flex-col sm:flex-row items-center gap-3">
                    <img
                      src={meterSnapshotUrl}
                      alt="Cropped Sub-Meter Snapshot"
                      className="h-16 rounded-lg border border-amber-500/40 object-contain bg-white px-2"
                    />
                    <div className="text-left flex-1">
                      <div className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Sub-Meter Snapshot Attached to Receipt</span>
                      </div>
                      {ocrRawText && (
                        <p className="text-[11px] text-slate-400 font-mono-num mt-0.5">
                          OCR Raw Text: "{ocrRawText}"{' '}
                          {ocrConfidence !== null &&
                            `• Confidence: ${ocrConfidence}%`}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {ocrStatusMsg && (
                <div className="mt-2.5 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{ocrStatusMsg}</span>
                </div>
              )}
            </div>

            {/* Step 2: Sub-Meter Difference Inputs */}
            <div className="pt-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-3">
                <Calculator className="w-3.5 h-3.5" />
                Step 2: Verify Sub-Meter Readings & Rate
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#0D1119] border border-[#252F42] p-3">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    Previous Reading (kWh)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={prevReading}
                    onChange={(e) => setPrevReading(e.target.value)}
                    className="mt-1 w-full bg-transparent text-lg font-extrabold text-slate-200 font-mono-num focus:outline-none"
                  />
                </div>

                <div className="rounded-xl bg-[#1A1812] border-2 border-amber-500/60 p-3">
                  <label className="block text-[11px] font-bold text-amber-400">
                    Current Reading (kWh) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={currReading}
                    onChange={(e) => setCurrReading(e.target.value)}
                    className="mt-1 w-full bg-transparent text-lg font-extrabold text-amber-400 font-mono-num focus:outline-none"
                  />
                </div>

                <div className="rounded-xl bg-[#0D1119] border border-[#252F42] p-3">
                  <label className="block text-[11px] font-semibold text-slate-400">
                    Rate per kWh (₱)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={electricRate}
                    onChange={(e) => setElectricRate(e.target.value)}
                    className="mt-1 w-full bg-transparent text-lg font-extrabold text-white font-mono-num focus:outline-none"
                  />
                </div>
              </div>

              {!subMeterCheck.isValid && (
                <div className="mt-3 rounded-xl bg-red-500/15 border border-red-500/30 p-3 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{subMeterCheck.errorMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Calculation & Receipt Generator (5 cols) */}
          <div className="lg:col-span-5 p-5 sm:p-6 bg-[#10151F] flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">
                  Live Bill Computation
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono-num font-bold text-xs">
                  Δ {billBreakdown.consumptionKwh.toFixed(1)} kWh
                </span>
              </div>

              {/* Sub-Meter Formula Highlight Box */}
              <div className="rounded-2xl bg-[#161D2B] border border-[#263248] p-4 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Current Sub-Meter Reading</span>
                  <span className="font-mono-num font-bold text-white">
                    {currNum.toFixed(1)} kWh
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Less: Previous Reading</span>
                  <span className="font-mono-num font-bold text-slate-300">
                    − {prevNum.toFixed(1)} kWh
                  </span>
                </div>
                <div className="pt-2 border-t border-[#263248] flex justify-between text-amber-400 font-bold">
                  <span>Sub-Meter Difference (Consumption)</span>
                  <span className="font-mono-num">
                    {billBreakdown.consumptionKwh.toFixed(1)} kWh ×{' '}
                    {formatPeso(rateNum)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-white pt-1">
                  <span>Total Electric Sub-Meter Cost</span>
                  <span className="font-mono-num text-amber-400">
                    {formatPeso(billBreakdown.electricTotal)}
                  </span>
                </div>
              </div>

              {/* Additional Rent & Carry-Over Adjustments */}
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Base Rent (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={baseRent}
                      onChange={(e) => setBaseRent(e.target.value)}
                      className="w-full rounded-xl bg-[#161D2B] border border-[#263248] px-3 py-2 text-xs font-bold text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Prev Unpaid (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={carryOverBalance}
                      onChange={(e) => setCarryOverBalance(e.target.value)}
                      className="w-full rounded-xl bg-[#161D2B] border border-[#263248] px-3 py-2 text-xs font-bold text-red-400 font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Less Deposit (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={depositApplied}
                      onChange={(e) => setDepositApplied(e.target.value)}
                      className="w-full rounded-xl bg-[#161D2B] border border-[#263248] px-3 py-2 text-xs font-bold text-emerald-400 font-mono-num"
                    />
                  </div>
                </div>

                {/* Grand Total Box */}
                <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 block">
                      Total Amount Due
                    </span>
                    <span className="text-xs text-slate-400">
                      Rent + Electric + Carry-Over
                    </span>
                  </div>
                  <div className="text-2xl font-black text-white font-mono-num">
                    {formatPeso(billBreakdown.totalAmountDue)}
                  </div>
                </div>

                {/* Payment Status Option */}
                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    Payment Status Upon Bill Generation
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'unpaid', label: 'Unpaid (Due)' },
                        { id: 'partial', label: 'Partial Pay' },
                        { id: 'paid', label: 'Paid in Full' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setInitialPayStatus(opt.id)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          initialPayStatus === opt.id
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-[#161D2B] text-slate-300 border-[#263248]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {initialPayStatus !== 'unpaid' && (
                    <div className="grid grid-cols-2 gap-2.5 mt-3">
                      {initialPayStatus === 'partial' && (
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Amount Paid Now (₱)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={initialAmountPaid}
                            onChange={(e) =>
                              setInitialAmountPaid(e.target.value)
                            }
                            className="w-full rounded-xl bg-[#161D2B] border border-[#263248] px-3 py-2 text-xs font-bold text-emerald-400 font-mono-num"
                          />
                        </div>
                      )}
                      <div
                        className={
                          initialPayStatus === 'paid' ? 'col-span-2' : ''
                        }
                      >
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Payment Channel
                        </label>
                        <select
                          value={paymentMethod}
                          onChange={(e) =>
                            setPaymentMethod(
                              e.target.value as
                                | 'Cash'
                                | 'GCash'
                                | 'Maya'
                                | 'Bank Transfer'
                            )
                          }
                          className="w-full rounded-xl bg-[#161D2B] border border-[#263248] px-3 py-2 text-xs font-bold text-white"
                        >
                          <option value="GCash">GCash</option>
                          <option value="Cash">Cash</option>
                          <option value="Maya">Maya</option>
                          <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={!subMeterCheck.isValid}
              className="w-full py-3.5 px-5 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] disabled:opacity-40 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 transition cursor-pointer"
            >
              <FileCheck2 className="w-5 h-5" />
              <span>Generate Official Receipt & Save Reading</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

