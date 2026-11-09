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
  RotateCw,
  ShieldCheck,
  Upload,
  X,
  ZoomIn,
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
  generateSimulatedValueCropDataUrl,
  preprocessMeterImage,
  recognizeSubMeterReading,
  SubMeterHardwareInspection,
} from '../../services/ocrService';

interface SubMeterScannerModalProps {
  isOpen: boolean;
  rooms: Room[];
  initialRoom?: Room | null;
  globalElectricRate: number;
  onClose: () => void;
  onGenerateBill: (
    newBill: BillRecord,
    updatedRoomLastReading: number,
    updatedRoomLastPhotoUrl: string,
    updatedRoomUnpaidBalance: number,
    overpaymentAddedToAdvance: number,
    advanceDeductedFromRoom: number,
    updatedRoomLastCropUrl?: string
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

  // Monthly electricity consumption rate (editable per bill cycle)
  const [monthlyElectricRate, setMonthlyElectricRate] = useState<string>(() =>
    String(globalElectricRate || 15.0)
  );

  // Dual Sub-Meter Proofs: Slot 1 = Previous, Slot 2 = Current
  const [targetMeterSlot, setTargetMeterSlot] = useState<'prev' | 'curr'>('curr');
  const [prevMeterSnapshotUrl, setPrevMeterSnapshotUrl] = useState<string>('');
  const [prevMeterCropUrl, setPrevMeterCropUrl] = useState<string>('');
  const [currMeterSnapshotUrl, setCurrMeterSnapshotUrl] = useState<string>('');
  const [currMeterCropUrl, setCurrMeterCropUrl] = useState<string>('');

  // OCR, Inspection & Camera state
  const [scanTab, setScanTab] = useState<'upload' | 'camera'>('upload');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrStatusMsg, setOcrStatusMsg] = useState<string | null>(null);
  const [meterInspection, setMeterInspection] =
    useState<SubMeterHardwareInspection | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

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
      setPrevReading(String(prev));
      // Current reading starts ready for new month's reading
      setCurrReading(String(prev));
      setBaseRent(String(selectedRoom.monthlyRent || 0));
      setCarryOverBalance(String(selectedRoom.unpaidBalance || 0));
      setDepositApplied(String(selectedRoom.advanceRent || 0));
      setDueDayOneToTen(
        String(clampDueDayOneToTen(selectedRoom.tenant?.dueDayOfMonth || 5))
      );

      // Previous slot has previous photo and value crop
      setPrevMeterSnapshotUrl(
        selectedRoom.lastMeterPhotoDataUrl ||
          generateSimulatedSubMeterDataUrl(prev)
      );
      setPrevMeterCropUrl(
        selectedRoom.lastMeterCropDataUrl ||
          generateSimulatedValueCropDataUrl(prev)
      );

      // Current slot is clean and waiting for the new month's photo/reading
      setCurrMeterSnapshotUrl('');
      setCurrMeterCropUrl('');
      setTargetMeterSlot('curr');

      setOcrStatusMsg(null);
      setMeterInspection(null);
    }
  }, [selectedRoom?.id]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraActive, scanTab]);

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
        'Live stream unavailable in this browser. Please use Device Camera App below.'
      );
      return;
    }
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
      }
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      setIsCameraActive(false);
      setOcrStatusMsg(
        'Camera permission was denied or device camera is busy. You can snap a photo with your device camera app.'
      );
    }
  };

  /**
   * Reads photo, automatically inserts value into the target slot,
   * crops the register value screenshot, and verifies hardware specifications.
   */
  const runOcrOnDataUrl = async (
    dataUrl: string,
    slot: 'prev' | 'curr'
  ): Promise<void> => {
    setIsOcrRunning(true);
    setOcrProgress(15);
    setOcrStatusMsg(
      `Reading & enhancing sub-meter value for ${
        slot === 'prev' ? 'Slot #1 (Previous)' : 'Slot #2 (Current)'
      }...`
    );

    try {
      const result = await recognizeSubMeterReading(dataUrl, (pct) =>
        setOcrProgress(pct)
      );

      const detectedVal =
        result.reading !== null && !Number.isNaN(result.reading)
          ? result.reading
          : 0.0;

      if (slot === 'prev') {
        setPrevMeterSnapshotUrl(result.processedImageDataUrl);
        setPrevMeterCropUrl(result.registerCropDataUrl);
        setPrevReading(String(detectedVal));
        // Automatically switch focus to Current slot for convenient next step
        setTargetMeterSlot('curr');
      } else {
        setCurrMeterSnapshotUrl(result.processedImageDataUrl);
        setCurrMeterCropUrl(result.registerCropDataUrl);
        setCurrReading(String(detectedVal));
      }

      setOcrConfidence(result.confidence);
      setMeterInspection(result.inspection || null);

      setOcrStatusMsg(
        `✓ Enhanced & auto-inserted ${detectedVal.toFixed(1)} kWh into ${
          slot === 'prev' ? 'Previous Sub-Meter (#1)' : 'Current Sub-Meter (#2)'
        }! Bill calculations updated.`
      );
    } catch {
      setOcrStatusMsg('Photo attached. Please verify the kWh value below.');
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(100);
    }
  };

  /**
   * Next-Month Rollover:
   * Current Sub-Meter reading, photo, and value crop become the Previous Sub-Meter (#1),
   * while Current Sub-Meter (#2) is ready for the new consumption reading.
   */
  const handleRolloverNextMonth = () => {
    const currVal = parseFloat(currReading) || 0;
    const finalPhoto =
      currMeterSnapshotUrl ||
      selectedRoom?.lastMeterPhotoDataUrl ||
      generateSimulatedSubMeterDataUrl(currVal);
    const finalCrop =
      currMeterCropUrl ||
      selectedRoom?.lastMeterCropDataUrl ||
      generateSimulatedValueCropDataUrl(currVal);

    setPrevReading(String(currVal));
    setPrevMeterSnapshotUrl(finalPhoto);
    setPrevMeterCropUrl(finalCrop);

    // Prepare Current for new consumption
    setCurrReading(String(currVal));
    setCurrMeterSnapshotUrl('');
    setCurrMeterCropUrl('');
    setTargetMeterSlot('curr');
    setOcrStatusMsg(
      `✓ Rolled over! Previous meter set to ${currVal.toFixed(1)} kWh. Slot #2 ready for new month.`
    );
  };

  const handleCaptureFromCamera = async () => {
    if (!videoRef.current) return;
    const capturedDataUrl = preprocessMeterImage(videoRef.current, {
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
    stopCamera();
    await runOcrOnDataUrl(capturedDataUrl, targetMeterSlot);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const originalDataUrl = reader.result as string;
      await runOcrOnDataUrl(originalDataUrl, targetMeterSlot);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!isOpen || !selectedRoom) return null;

  const prevNum = parseFloat(prevReading) || 0;
  const currNum = parseFloat(currReading) || 0;
  const rateNum = Math.max(0, parseFloat(monthlyElectricRate) || 0);
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
    const finalPrevCrop =
      prevMeterCropUrl || generateSimulatedValueCropDataUrl(prevNum);
    const finalCurrCrop =
      currMeterCropUrl || generateSimulatedValueCropDataUrl(currNum);

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
      prevMeterCropDataUrl: finalPrevCrop,
      currMeterCropDataUrl: finalCurrCrop,
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
                      )} credited to Advance)`
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
      depNum,
      finalCurrCrop
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-3xl bg-[#141A25] border border-[#263147] shadow-2xl overflow-hidden my-auto max-h-[95vh] flex flex-col animate-modal-pop">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#192130] border-b border-[#263147] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Sub-Meter OCR & Bill Generator
              </h2>
              <p className="text-xs text-slate-400">
                Auto-reads meter drums & LCD • Rate: {formatPeso(rateNum)}/kWh
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
          {/* Left Column: Dual Sub-Meter Scanner & Photo Proofs */}
          <div className="lg:col-span-7 p-4 sm:p-6 border-b lg:border-b-0 lg:border-r border-[#222C3F] space-y-4">
            {/* Room, Billing Period & Due Date Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
              <div className="flex flex-col">
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Room
                </label>
                <select
                  value={selectedRoom.id}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#0D1119] border border-[#252F42] px-3 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
                >
                  {activeRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} • {r.tenant?.fullName || 'Vacant'} ({r.lastMeterReading.toFixed(1)} kWh)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="block text-xs font-bold text-slate-300 mb-1">
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
                <label className="block text-xs font-bold text-amber-400 mb-1">
                  Due Day (1–10)
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

            {/* Sub-Meter Slots & Next-Month Rollover Action */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  Select Sub-Meter Slot to Scan
                </span>
                <button
                  type="button"
                  onClick={handleRolloverNextMonth}
                  title="Make Current Sub-Meter the Previous Sub-Meter for the next cycle"
                  className="px-2.5 py-1 rounded-lg bg-[#1B2333] hover:bg-[#25324A] border border-[#2B3A54] text-[11px] font-bold text-amber-300 flex items-center gap-1 cursor-pointer transition"
                >
                  <RotateCw className="w-3 h-3 text-amber-400" />
                  <span>Rollover to Next Month</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                {/* Slot 1: Previous */}
                <div
                  onClick={() => {
                    setTargetMeterSlot('prev');
                    if (!prevMeterSnapshotUrl) {
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer relative ${
                    targetMeterSlot === 'prev'
                      ? 'bg-amber-500/15 border-amber-500 text-white'
                      : 'bg-[#0D1119] border-[#252F42] text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span>1. Previous Sub-Meter</span>
                    <span className="font-mono-num text-amber-400">
                      {prevNum.toFixed(1)} kWh
                    </span>
                  </div>
                  {prevMeterSnapshotUrl ? (
                    <div className="space-y-1">
                      <img
                        src={prevMeterSnapshotUrl}
                        alt="Previous Meter"
                        className="h-16 w-full object-contain rounded-lg bg-[#090C12]"
                      />
                      {prevMeterCropUrl && (
                        <div className="relative">
                          <img
                            src={prevMeterCropUrl}
                            alt="Previous Value Crop"
                            className="h-8 w-full object-contain rounded border border-emerald-500/50 bg-[#090C12]"
                          />
                          <span className="absolute bottom-0.5 right-1 text-[8px] bg-emerald-950/80 text-emerald-300 px-1 rounded">
                            Crop
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTargetMeterSlot('prev');
                          fileInputRef.current?.click();
                        }}
                        className="w-full text-center text-[10px] text-amber-400/90 hover:text-amber-300 py-0.5"
                      >
                        Change Photo
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-full rounded-lg bg-[#090C12] border border-dashed border-slate-700 flex flex-col items-center justify-center text-[10px] text-slate-400 hover:text-amber-300 transition">
                      <ImagePlus className="w-3.5 h-3.5 mb-0.5" />
                      <span>Tap to attach photo</span>
                    </div>
                  )}
                </div>

                {/* Slot 2: Current */}
                <div
                  onClick={() => {
                    setTargetMeterSlot('curr');
                    if (!currMeterSnapshotUrl) {
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer relative ${
                    targetMeterSlot === 'curr'
                      ? 'bg-amber-500/15 border-amber-500 text-white ring-1 ring-amber-500/50'
                      : 'bg-[#0D1119] border-[#252F42] text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold mb-1">
                    <span>2. Current Sub-Meter</span>
                    <span className="font-mono-num text-amber-400">
                      {currNum.toFixed(1)} kWh
                    </span>
                  </div>
                  {currMeterSnapshotUrl ? (
                    <div className="space-y-1">
                      <img
                        src={currMeterSnapshotUrl}
                        alt="Current Meter"
                        className="h-16 w-full object-contain rounded-lg bg-[#090C12]"
                      />
                      {currMeterCropUrl && (
                        <div className="relative">
                          <img
                            src={currMeterCropUrl}
                            alt="Current Value Crop"
                            className="h-8 w-full object-contain rounded border border-amber-500/50 bg-[#090C12]"
                          />
                          <span className="absolute bottom-0.5 right-1 text-[8px] bg-amber-950/80 text-amber-300 px-1 rounded">
                            Crop
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTargetMeterSlot('curr');
                          fileInputRef.current?.click();
                        }}
                        className="w-full text-center text-[10px] text-amber-400/90 hover:text-amber-300 py-0.5"
                      >
                        Change Photo
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-full rounded-lg bg-[#090C12] border border-dashed border-amber-500/40 flex flex-col items-center justify-center text-[10px] text-amber-300 hover:text-amber-200 transition">
                      <ImagePlus className="w-4 h-4 mb-0.5" />
                      <span>Tap to attach photo</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Mode Tabs */}
              <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setScanTab('upload');
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
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
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    scanTab === 'camera'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-[#0E131C] text-slate-300 border-[#252F42]'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Live Camera Capture</span>
                </button>
              </div>

              {/* Scanner Viewport */}
              <div className="rounded-2xl bg-[#0A0D13] border border-[#252F42] p-4 flex flex-col items-center justify-center">
                {/* Hidden native file inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <input
                  ref={nativeCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {scanTab === 'camera' ? (
                  isCameraActive ? (
                    <div className="relative w-full">
                      <div className="relative w-full h-48 sm:h-56 bg-black rounded-xl overflow-hidden border border-amber-500/40">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                        {/* Live Viewfinder Reticle */}
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-3">
                          <div className="w-11/12 max-w-[340px] h-24 border-2 border-dashed border-amber-400 rounded-xl relative flex items-center justify-center bg-black/25 backdrop-blur-[0.5px]">
                            <span className="text-[10px] font-extrabold text-amber-300 bg-slate-950/85 px-2 py-0.5 rounded shadow border border-amber-500/30">
                              Align Sub-Meter Register (5 Black + 1 Red Tenths)
                            </span>
                            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-amber-400" />
                            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-amber-400" />
                            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-amber-400" />
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-amber-400" />
                          </div>
                          <span className="text-[9px] text-slate-300 bg-slate-950/70 px-2 py-0.5 rounded mt-2">
                            Auto-enhances blurry or dim sub-meter photos
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2.5">
                        <button
                          type="button"
                          onClick={handleCaptureFromCamera}
                          disabled={isOcrRunning}
                          className="flex-1 min-w-[200px] py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20 transition"
                        >
                          {isOcrRunning ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Reading & Enhancing...</span>
                            </>
                          ) : (
                            <>
                              <Camera className="w-4 h-4" />
                              <span>
                                Snap & Insert into{' '}
                                {targetMeterSlot === 'prev' ? 'Slot #1 (Previous)' : 'Slot #2 (Current)'}
                              </span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => nativeCameraInputRef.current?.click()}
                          className="px-3 py-2.5 rounded-xl bg-[#1B2333] hover:bg-[#25324A] border border-[#28364F] text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                          title="Open device native camera app"
                        >
                          <Camera className="w-3.5 h-3.5 text-amber-400" />
                          <span>Device App</span>
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-3 py-2.5 rounded-xl bg-[#141A25] hover:bg-[#1E2738] border border-slate-700 text-slate-400 hover:text-white text-xs font-bold cursor-pointer transition"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
                        <Camera className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-white">
                        Live Camera Capture for{' '}
                        {targetMeterSlot === 'prev'
                          ? 'Sub-Meter #1 (Previous)'
                          : 'Sub-Meter #2 (Current)'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
                        Viewfinder auto-sharpens blurry or dim sub-meter drums and digital LCD displays.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-3.5">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-lg shadow-amber-500/20 transition"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Start Live Camera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => nativeCameraInputRef.current?.click()}
                          className="px-3.5 py-2 rounded-xl bg-[#182132] hover:bg-[#202C42] border border-[#28364F] text-slate-200 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
                        >
                          <Camera className="w-3.5 h-3.5 text-amber-400" />
                          <span>Snap via Device Camera App</span>
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center py-2">
                    <ImagePlus className="w-8 h-8 text-amber-400 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-white">
                      Upload Photo for{' '}
                      {targetMeterSlot === 'prev'
                        ? 'Sub-Meter #1 (Previous)'
                        : 'Sub-Meter #2 (Current)'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Accurately reads 5 black + 1 red drums and digital displays
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isOcrRunning}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
                      >
                        {isOcrRunning ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Reading Meter ({ocrProgress}%)...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Choose Sub-Meter Image</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => nativeCameraInputRef.current?.click()}
                        disabled={isOcrRunning}
                        className="px-3.5 py-2 rounded-xl bg-[#182132] hover:bg-[#202C42] border border-[#28364F] text-slate-200 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
                      >
                        <Camera className="w-3.5 h-3.5 text-amber-400" />
                        <span>Snap Photo</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {ocrStatusMsg && (
                <div className="mt-2.5 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{ocrStatusMsg}</span>
                </div>
              )}

              {/* Hardware & Register Inspection */}
              {meterInspection && (
                <div className="mt-2.5 rounded-2xl bg-[#0D121C] border border-[#23304A] p-3 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-white flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      {meterInspection.brandModel}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                      Register Verified
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-300 font-semibold font-mono-num">
                    {meterInspection.registerBreakdown}
                  </p>
                </div>
              )}
            </div>

            {/* Readings Inputs Row */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2">
                <Calculator className="w-3.5 h-3.5" />
                Readings (kWh) & Electric Rate
              </span>

              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                <div className="rounded-xl bg-[#0D1119] border border-[#252F42] p-2.5">
                  <label className="block text-[10px] font-semibold text-slate-400">
                    1. Prev (kWh)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={prevReading}
                    onChange={(e) => setPrevReading(e.target.value)}
                    className="mt-0.5 w-full bg-transparent text-sm sm:text-base font-extrabold text-slate-200 font-mono-num focus:outline-none"
                  />
                </div>

                <div className="rounded-xl bg-[#1A1812] border-2 border-amber-500/60 p-2.5">
                  <label className="block text-[10px] font-bold text-amber-400">
                    2. Curr (kWh) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={currReading}
                    onChange={(e) => setCurrReading(e.target.value)}
                    className="mt-0.5 w-full bg-transparent text-sm sm:text-base font-extrabold text-amber-400 font-mono-num focus:outline-none"
                  />
                </div>

                <div className="rounded-xl bg-[#0D1119] border border-amber-500/50 p-2.5">
                  <label className="block text-[10px] font-bold text-amber-400">
                    3. Rate (₱/kWh) *
                  </label>
                  <div className="flex items-center mt-0.5">
                    <span className="text-xs font-bold text-amber-400 mr-0.5">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={monthlyElectricRate}
                      onChange={(e) => setMonthlyElectricRate(e.target.value)}
                      className="w-full bg-transparent text-sm sm:text-base font-extrabold text-amber-400 font-mono-num focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {!subMeterCheck.isValid && (
                <div className="mt-2 rounded-xl bg-red-500/15 border border-red-500/30 p-2 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{subMeterCheck.errorMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Calculation & Receipt Generation */}
          <div className="lg:col-span-5 p-4 sm:p-6 bg-[#10151F] flex flex-col justify-between space-y-4">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
                  Receipt Breakdown
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono-num font-bold text-xs">
                  Δ {billBreakdown.consumptionKwh.toFixed(1)} kWh
                </span>
              </div>

              <div className="rounded-2xl bg-[#161D2B] border border-[#263248] p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Current Reading</span>
                  <span className="font-mono-num font-bold text-white">
                    {currNum.toFixed(1)} kWh
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Less Previous Reading</span>
                  <span className="font-mono-num font-bold text-slate-300">
                    - {prevNum.toFixed(1)} kWh
                  </span>
                </div>
                <div className="pt-1.5 border-t border-[#263248] flex justify-between text-amber-400 font-bold">
                  <span>Consumption × Rate</span>
                  <span className="font-mono-num">
                    {billBreakdown.consumptionKwh.toFixed(1)} kWh × {formatPeso(rateNum)}
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
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Base Rent
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={baseRent}
                    onChange={(e) => setBaseRent(e.target.value)}
                    className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-2 text-xs font-bold text-white font-mono-num"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                    Prev Unpaid
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={carryOverBalance}
                    onChange={(e) => setCarryOverBalance(e.target.value)}
                    className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-2 text-xs font-bold text-red-400 font-mono-num"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block text-[10px] font-semibold text-emerald-400 mb-1 truncate">
                    Adv ({formatPeso(selectedRoom.advanceRent || 0)})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    max={selectedRoom.advanceRent || 0}
                    value={depositApplied}
                    onChange={(e) => setDepositApplied(e.target.value)}
                    className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-2 text-xs font-bold text-emerald-400 font-mono-num"
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
                    Total Amount Due
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Due: Day {safeDueDay} ({computedDueDateLabel})
                  </span>
                </div>
                <div className="text-xl font-black text-white font-mono-num">
                  {formatPeso(billBreakdown.totalAmountDue)}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Payment Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'unpaid', label: 'Unpaid' },
                      { id: 'partial', label: 'Partial' },
                      { id: 'paid', label: 'Paid in Full' },
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
                      className={`py-2 px-1 text-xs font-bold border rounded-xl transition cursor-pointer ${
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
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        Amount Paid (₱)
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
                        Payment Method
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
                        className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-2 text-xs font-bold text-white"
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
              <span>Save & Generate Receipt</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
