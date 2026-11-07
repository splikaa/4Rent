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
  Lock,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { BillRecord, Room } from '../../types/rental';
import {
  calculateBillBreakdown,
  calculateSubMeterDifference,
  clampDueDayOneToTen,
  formatPeso,
  getBillingPeriodOptions,
  getNextDueDateInOneToTenWindow,
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
  globalElectricRate: number; // Strictly controlled from Settings
  onClose: () => void;
  onGenerateBill: (
    newBill: BillRecord,
    updatedRoomLastReading: number,
    updatedRoomLastPhotoUrl: string,
    updatedRoomUnpaidBalance: number,
    overpaymentAddedToAdvance: number,
    advanceDeductedFromRoom: number
  ) => void;
}

export const SubMeterScannerModal: React.FC<SubMeterScannerModalProps> = ({
  isOpen,
  rooms,
  initialRoom,
  globalElectricRate,
  onClose,
  onGenerateBill,
}) => {
  const activeRooms = rooms.filter((r) => !r.isArchived);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const selectedRoom =
    activeRooms.find((r) => r.id === selectedRoomId) ||
    initialRoom ||
    activeRooms[0];

  const billingPeriodOptions = getBillingPeriodOptions();

  // Sub-meter & billing fields
  const [prevReading, setPrevReading] = useState('0');
  const [currReading, setCurrReading] = useState('0');
  const [baseRent, setBaseRent] = useState('4500');
  const [carryOverBalance, setCarryOverBalance] = useState('0');
  const [depositApplied, setDepositApplied] = useState('0');
  const [billingPeriod, setBillingPeriod] = useState(() =>
    new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  );
  const [dueDayOneToTen, setDueDayOneToTen] = useState('5');
  const [initialPayStatus, setInitialPayStatus] = useState<
    'unpaid' | 'paid' | 'partial'
  >('unpaid');
  const [initialAmountPaid, setInitialAmountPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<
    'Cash' | 'GCash' | 'Maya' | 'Bank Transfer'
  >('GCash');

  // Dual Sub-Meter Proof Photos (Meter #1: Previous, Meter #2: Current)
  const [targetMeterSlot, setTargetMeterSlot] = useState<'prev' | 'curr'>(
    'curr'
  );
  const [prevMeterSnapshotUrl, setPrevMeterSnapshotUrl] = useState<string>('');
  const [currMeterSnapshotUrl, setCurrMeterSnapshotUrl] = useState<string>('');

  // OCR & Camera state
  const [scanTab, setScanTab] = useState<'upload' | 'camera' | 'simulate'>(
    'upload'
  );
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrStatusMsg, setOcrStatusMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialRoom) {
      setSelectedRoomId(initialRoom.id);
    } else if (activeRooms.length > 0 && !selectedRoomId) {
      setSelectedRoomId(activeRooms[0].id);
    }
  }, [initialRoom, activeRooms.length]);

  useEffect(() => {
    if (selectedRoom) {
      const prev = selectedRoom.lastMeterReading || 0;
      const defaultCurr = Math.round((prev + 48.5) * 10) / 10;
      setPrevReading(String(prev));
      setCurrReading(String(defaultCurr));
      setBaseRent(String(selectedRoom.monthlyRent || 0));
      setCarryOverBalance(String(selectedRoom.unpaidBalance || 0));
      setDepositApplied('0');
      setDueDayOneToTen(
        String(clampDueDayOneToTen(selectedRoom.tenant?.dueDayOfMonth || 5))
      );

      // Initialize Both Sub-Meter Proof Images so the Official Receipt always has 2 Sub-Meter Proofs
      setPrevMeterSnapshotUrl(
        selectedRoom.lastMeterPhotoDataUrl ||
          generateSimulatedSubMeterDataUrl(prev)
      );
      setCurrMeterSnapshotUrl(generateSimulatedSubMeterDataUrl(defaultCurr));
      setOcrStatusMsg(null);
    }
  }, [selectedRoom?.id]);

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
    if (!navigator.mediaDevices?.getUserMedia) {
      setOcrStatusMsg(
        'Camera access is not available in this browser context (requires HTTPS or localhost). Please use Photo Upload.'
      );
      setScanTab('upload');
      return;
    }
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
        'Camera permission was denied or device camera is busy. Please use Photo Upload instead.'
      );
      setScanTab('upload');
    }
  };

  const runOcrOnDataUrl = async (
    dataUrl: string,
    slot: 'prev' | 'curr'
  ): Promise<void> => {
    setIsOcrRunning(true);
    setOcrProgress(5);
    setOcrStatusMsg(
      `Enhancing blurry image (2x Super-Resolution + Unsharp Filter) & scanning ${
        slot === 'prev' ? 'Previous Sub-Meter #1' : 'Current Sub-Meter #2'
      }...`
    );

    try {
      const result = await recognizeSubMeterReading(dataUrl, (pct) =>
        setOcrProgress(pct)
      );
      if (slot === 'prev') {
        setPrevMeterSnapshotUrl(result.processedImageDataUrl);
      } else {
        setCurrMeterSnapshotUrl(result.processedImageDataUrl);
      }
      setOcrConfidence(result.confidence);

      if (result.reading !== null) {
        if (slot === 'prev') {
          setPrevReading(String(result.reading));
        } else {
          setCurrReading(String(result.reading));
        }
        setOcrStatusMsg(
          `${
            slot === 'prev' ? 'Sub-Meter #1 (Prev)' : 'Sub-Meter #2 (Curr)'
          } Enhanced OCR Extracted: ${result.reading.toFixed(1)} kWh (${
            result.confidence
          }% confidence)`
        );
      } else {
        setOcrStatusMsg(
          'Photo attached and enhanced! Please verify or type the exact kWh digits below.'
        );
      }
    } catch {
      setOcrStatusMsg('Photo attached! Verify the kWh reading below.');
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
    await runOcrOnDataUrl(croppedDataUrl, targetMeterSlot);
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
        await runOcrOnDataUrl(processed, targetMeterSlot);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSimulateMeterOcr = async () => {
    const basePrev = parseFloat(prevReading) || 1000;
    const targetVal =
      targetMeterSlot === 'prev'
        ? basePrev
        : Math.round((basePrev + 35 + Math.random() * 50) * 10) / 10;

    const fullMeterDataUrl = generateSimulatedSubMeterDataUrl(targetVal);
    const img = new Image();
    img.onload = async () => {
      const cropped = preprocessMeterImage(
        img,
        { x: 0.14, y: 0.32, w: 0.72, h: 0.34 },
        false
      );
      await runOcrOnDataUrl(cropped, targetMeterSlot);
    };
    img.src = fullMeterDataUrl;
  };

  if (!isOpen || !selectedRoom) return null;

  const prevNum = parseFloat(prevReading) || 0;
  const currNum = parseFloat(currReading) || 0;
  const rateNum = globalElectricRate; // Strictly from Settings
  const rentNum = parseFloat(baseRent) || 0;
  const carryNum = parseFloat(carryOverBalance) || 0;
  const depNum = Math.min(
    selectedRoom.advanceRent || 0,
    Math.max(0, parseFloat(depositApplied) || 0)
  );

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

  const safeDueDay = clampDueDayOneToTen(parseInt(dueDayOneToTen, 10) || 5);
  const computedDueDateIso = getNextDueDateInOneToTenWindow(safeDueDay);
  const computedDueDateLabel = new Date(computedDueDateIso).toLocaleDateString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  );

  const handleConfirmGenerateBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subMeterCheck.isValid) return;

    const nowIso = new Date().toISOString();
    const totalDue = billBreakdown.totalAmountDue;

    let paidAmount = 0;
    if (initialPayStatus === 'paid') {
      const customEntered = parseFloat(initialAmountPaid) || 0;
      paidAmount = customEntered >= totalDue ? customEntered : totalDue;
    } else if (initialPayStatus === 'partial') {
      paidAmount = Math.max(0, parseFloat(initialAmountPaid) || 0);
    }

    const overpaymentAddedToAdvance =
      paidAmount > totalDue
        ? Math.round((paidAmount - totalDue) * 100) / 100
        : 0;

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
      .replace('-', '')}-${selectedRoom.name.replace(/\D/g, '') || '101'}`;

    const finalPrevPhoto =
      prevMeterSnapshotUrl || generateSimulatedSubMeterDataUrl(prevNum);
    const finalCurrPhoto =
      currMeterSnapshotUrl || generateSimulatedSubMeterDataUrl(currNum);

    const newBill: BillRecord = {
      id: `bill-${Date.now()}`,
      receiptNo: receiptCode,
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      tenantName: selectedRoom.tenant?.fullName || 'Current Room Tenant',
      tenantPhone: selectedRoom.tenant?.phone,
      tenantMessenger: selectedRoom.tenant?.messengerUsername,
      billingPeriod,
      createdAt: nowIso,
      dueDate: new Date(computedDueDateIso).toISOString(),
      paymentWindowLabel: `Every 1st to 10th of the Month (Day ${safeDueDay})`,
      prevReading: prevNum,
      currReading: currNum,
      consumptionKwh: billBreakdown.consumptionKwh,
      electricRate: rateNum,
      electricTotal: billBreakdown.electricTotal,
      prevMeterPhotoDataUrl: finalPrevPhoto,
      meterPhotoDataUrl: finalCurrPhoto,
      ocrConfidence: ocrConfidence ?? undefined,
      baseRent: rentNum,
      securityDepositRequired: selectedRoom.securityDeposit || rentNum,
      previousBalanceCarryOver: carryNum,
      depositApplied: depNum,
      totalAmountDue: totalDue,
      amountPaid: paidAmount,
      overpaymentToAdvance: overpaymentAddedToAdvance,
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
                overpaymentCredited:
                  overpaymentAddedToAdvance > 0
                    ? overpaymentAddedToAdvance
                    : undefined,
                method: paymentMethod,
                paidAt: nowIso,
                note:
                  overpaymentAddedToAdvance > 0
                    ? `Paid ${formatPeso(paidAmount)} (Excess ${formatPeso(
                        overpaymentAddedToAdvance
                      )} credited to Advance Balance)`
                    : finalStatus === 'paid'
                    ? 'Full payment upon billing'
                    : 'Initial partial payment',
              },
            ]
          : [],
      updatedAt: nowIso,
    };

    onGenerateBill(
      newBill,
      currNum,
      finalCurrPhoto,
      remainingBalance,
      overpaymentAddedToAdvance,
      depNum
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-3xl bg-[#141A25] border border-[#263147] shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col animate-modal-pop">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#192130] border-b border-[#263147] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Dual Sub-Meter Enhanced OCR Reader & Receipt Generator
              </h2>
              <p className="text-xs text-slate-400">
                2x Super-Resolution De-Blur OCR • 2 Sub-Meter Proofs • Global Rate:{' '}
                {formatPeso(globalElectricRate)}/kWh
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
          className="grid grid-cols-1 lg:grid-cols-12 overflow-y-auto flex-1"
        >
          {/* Left Column: Dual Sub-Meter Scanner & Photo Proofs (7 cols) */}
          <div className="lg:col-span-7 p-5 border-b lg:border-b-0 lg:border-r border-[#222C3F] space-y-4">
            {/* Room, Selectable Billing Period & Auto Next-Month Due Day (1-10) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
              <div className="flex flex-col">
                <label className="block text-xs font-bold text-slate-300 mb-1.5 whitespace-nowrap">
                  Select Room
                </label>
                <select
                  value={selectedRoom.id}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#0D1119] border border-[#252F42] px-3 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
                >
                  {activeRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} • {r.tenant?.fullName || 'Vacant'} (
                      {r.lastMeterReading.toFixed(1)} kWh)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="block text-xs font-bold text-slate-300 mb-1.5 whitespace-nowrap">
                  Billing Period
                </label>
                <select
                  value={billingPeriod}
                  onChange={(e) => setBillingPeriod(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#0D1119] border border-[#252F42] px-3 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
                >
                  {!billingPeriodOptions.includes(billingPeriod) && (
                    <option value={billingPeriod}>{billingPeriod}</option>
                  )}
                  {billingPeriodOptions.map((period) => (
                    <option key={period} value={period}>
                      {period}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="block text-xs font-bold text-amber-400 mb-1.5 whitespace-nowrap">
                  Next Month Due (1 to 10) *
                </label>
                <select
                  value={dueDayOneToTen}
                  onChange={(e) => setDueDayOneToTen(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#0D1119] border border-amber-500/40 px-3 text-xs font-bold text-amber-400 focus:border-amber-500 focus:outline-none"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                    <option key={d} value={d}>
                      Day {d} ({computedDueDateLabel})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dual Sub-Meter Slot Selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  Select Which Sub-Meter Proof to Scan / Update
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setTargetMeterSlot('prev')}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                    targetMeterSlot === 'prev'
                      ? 'bg-amber-500/15 border-amber-500 text-white'
                      : 'bg-[#0D1119] border-[#252F42] text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>1. Previous Sub-Meter</span>
                    <span className="font-mono-num text-amber-400">
                      {prevNum.toFixed(1)} kWh
                    </span>
                  </div>
                  {prevMeterSnapshotUrl && (
                    <img
                      src={prevMeterSnapshotUrl}
                      alt="Previous Meter Proof"
                      className="mt-2 h-11 w-full object-contain rounded bg-white px-1"
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setTargetMeterSlot('curr')}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                    targetMeterSlot === 'curr'
                      ? 'bg-amber-500/15 border-amber-500 text-white'
                      : 'bg-[#0D1119] border-[#252F42] text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>2. Current Sub-Meter</span>
                    <span className="font-mono-num text-amber-400">
                      {currNum.toFixed(1)} kWh
                    </span>
                  </div>
                  {currMeterSnapshotUrl && (
                    <img
                      src={currMeterSnapshotUrl}
                      alt="Current Meter Proof"
                      className="mt-2 h-11 w-full object-contain rounded bg-white px-1"
                    />
                  )}
                </button>
              </div>

              {/* Scanner Mode Switcher */}
              <div className="grid grid-cols-3 gap-2 mb-2.5">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setScanTab('simulate');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    scanTab === 'simulate'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-[#0E131C] text-slate-300 border-[#252F42]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Simulate OCR</span>
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
                      : 'bg-[#0E131C] text-slate-300 border-[#252F42]'
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
                      : 'bg-[#0E131C] text-slate-300 border-[#252F42]'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Live Camera</span>
                </button>
              </div>

              {/* Scanner Box */}
              <div className="rounded-2xl bg-[#0A0D13] border border-[#252F42] p-3.5 flex flex-col items-center justify-center">
                {scanTab === 'camera' && isCameraActive ? (
                  <div className="relative w-full">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-44 object-cover rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={handleCaptureFromCamera}
                      className="mt-2.5 w-full py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      Capture & De-Blur Extract{' '}
                      {targetMeterSlot === 'prev'
                        ? 'Previous Meter #1'
                        : 'Current Meter #2'}
                    </button>
                  </div>
                ) : scanTab === 'upload' ? (
                  <div className="text-center py-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <ImagePlus className="w-8 h-8 text-amber-400 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-white">
                      Upload Photo Proof for{' '}
                      {targetMeterSlot === 'prev'
                        ? 'Sub-Meter #1 (Previous)'
                        : 'Sub-Meter #2 (Current)'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Automatically sharpens blurry sub-meter digits via 2x Super-Resolution
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isOcrRunning}
                      className="mt-2.5 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Choose Sub-Meter Photo
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-xs text-slate-300 mb-2">
                      Generate & OCR-scan a high-contrast kWh sub-meter proof for{' '}
                      <strong className="text-amber-400">
                        {targetMeterSlot === 'prev'
                          ? 'Sub-Meter #1 (Previous)'
                          : 'Sub-Meter #2 (Current)'}
                      </strong>
                      :
                    </p>
                    <button
                      type="button"
                      onClick={handleSimulateMeterOcr}
                      disabled={isOcrRunning}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {isOcrRunning ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Enhancing & Scanning ({ocrProgress}%)...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Scan Sample Sub-Meter via OCR</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {ocrStatusMsg && (
                <div className="mt-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{ocrStatusMsg}</span>
                </div>
              )}
            </div>

            {/* Readings & Global Rate Row */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2">
                <Calculator className="w-3.5 h-3.5" />
                Verify Readings & Global Settings Electric Rate
              </span>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-xl bg-[#0D1119] border border-[#252F42] p-2.5">
                  <label className="block text-[10px] font-semibold text-slate-400">
                    1. Previous (kWh)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={prevReading}
                    onChange={(e) => {
                      setPrevReading(e.target.value);
                      const v = parseFloat(e.target.value) || 0;
                      setPrevMeterSnapshotUrl(
                        generateSimulatedSubMeterDataUrl(v)
                      );
                    }}
                    className="mt-0.5 w-full bg-transparent text-base font-extrabold text-slate-200 font-mono-num focus:outline-none"
                  />
                </div>

                <div className="rounded-xl bg-[#1A1812] border-2 border-amber-500/60 p-2.5">
                  <label className="block text-[10px] font-bold text-amber-400">
                    2. Current (kWh) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={currReading}
                    onChange={(e) => {
                      setCurrReading(e.target.value);
                      const v = parseFloat(e.target.value) || 0;
                      setCurrMeterSnapshotUrl(
                        generateSimulatedSubMeterDataUrl(v)
                      );
                    }}
                    className="mt-0.5 w-full bg-transparent text-base font-extrabold text-amber-400 font-mono-num focus:outline-none"
                  />
                </div>

                <div
                  className="rounded-xl bg-[#0D1119]/80 border border-[#252F42] p-2.5"
                  title="Electric Sub-Meter Rate is managed centrally in Settings"
                >
                  <label className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-amber-400" />
                    Settings Rate
                  </label>
                  <div className="mt-0.5 text-base font-extrabold text-white font-mono-num">
                    {formatPeso(globalElectricRate)}/kWh
                  </div>
                </div>
              </div>

              {!subMeterCheck.isValid && (
                <div className="mt-2 rounded-xl bg-red-500/15 border border-red-500/30 p-2.5 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{subMeterCheck.errorMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Calculation & Receipt Generator (5 cols) */}
          <div className="lg:col-span-5 p-5 bg-[#10151F] flex flex-col justify-between space-y-4">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                  Official Receipt Computation
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono-num font-bold text-xs">
                  Δ {billBreakdown.consumptionKwh.toFixed(1)} kWh
                </span>
              </div>

              <div className="rounded-2xl bg-[#161D2B] border border-[#263248] p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Sub-Meter #2 (Current)</span>
                  <span className="font-mono-num font-bold text-white">
                    {currNum.toFixed(1)} kWh
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Less Sub-Meter #1 (Previous)</span>
                  <span className="font-mono-num font-bold text-slate-300">
                    - {prevNum.toFixed(1)} kWh
                  </span>
                </div>
                <div className="pt-1.5 border-t border-[#263248] flex justify-between text-amber-400 font-bold">
                  <span>Consumption × Global Rate</span>
                  <span className="font-mono-num">
                    {billBreakdown.consumptionKwh.toFixed(1)} kWh ×{' '}
                    {formatPeso(rateNum)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-white pt-0.5">
                  <span>Electric Sub-Total</span>
                  <span className="font-mono-num text-amber-400">
                    {formatPeso(billBreakdown.electricTotal)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 items-start">
                <div className="flex flex-col">
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1 whitespace-nowrap">
                    Base Rent (₱)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={baseRent}
                    onChange={(e) => setBaseRent(e.target.value)}
                    className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-2.5 text-xs font-bold text-white font-mono-num"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1 whitespace-nowrap">
                    Prev Unpaid (₱)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={carryOverBalance}
                    onChange={(e) => setCarryOverBalance(e.target.value)}
                    className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-2.5 text-xs font-bold text-red-400 font-mono-num"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block text-[10px] font-semibold text-emerald-400 mb-1 whitespace-nowrap">
                    Advance ({formatPeso(selectedRoom.advanceRent || 0)})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    max={selectedRoom.advanceRent || 0}
                    value={depositApplied}
                    onChange={(e) => setDepositApplied(e.target.value)}
                    className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-2.5 text-xs font-bold text-emerald-400 font-mono-num"
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
                    Total Amount Due
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Next Due: {computedDueDateLabel} (Day {safeDueDay})
                  </span>
                </div>
                <div className="text-xl font-black text-white font-mono-num">
                  {formatPeso(billBreakdown.totalAmountDue)}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Payment Status (Overpayments Auto-Credit to Advance Balance)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'unpaid', label: 'Unpaid (Due)' },
                      { id: 'partial', label: 'Partial Pay' },
                      { id: 'paid', label: 'Paid / Overpay' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setInitialPayStatus(opt.id);
                        if (opt.id === 'paid') {
                          setInitialAmountPaid(
                            String(billBreakdown.totalAmountDue)
                          );
                        }
                      }}
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
                  <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Amount Tendered (₱)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={initialAmountPaid}
                        onChange={(e) => setInitialAmountPaid(e.target.value)}
                        className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-3 text-xs font-bold text-emerald-400 font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
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
                        className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-3 text-xs font-bold text-white"
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

            <button
              type="submit"
              disabled={!subMeterCheck.isValid}
              className="w-full py-3 px-4 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] disabled:opacity-40 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 transition cursor-pointer"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Save Room Receipt (With 2 Sub-Meter Proofs)</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
