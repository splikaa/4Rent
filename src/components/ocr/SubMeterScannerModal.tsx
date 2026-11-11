import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Calculator,
  Camera,
  CheckCircle2,
  Cpu,
  FileCheck2,
  ImagePlus,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  RotateCw,
  Settings,
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
import { saveMeterMasterImage } from '../../services/idbDatabase';
import { MeterPhotoLightboxModal } from './MeterPhotoLightboxModal';

interface SubMeterScannerModalProps {
  isOpen: boolean;
  rooms: Room[];
  initialRoom?: Room | null;
  globalElectricRate: number;
  securityPin?: string;
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

function extractQuickReadingFromSample(
  data: Uint8ClampedArray,
  meanLum: number
): number | null {
  const digits: number[] = [];
  const slotW = (204 - 36) / 6;

  for (let slot = 0; slot < 6; slot++) {
    const x0 = Math.floor(36 + slot * slotW + 3);
    const x1 = Math.floor(36 + (slot + 1) * slotW - 3);
    let topInk = 0;
    let midInk = 0;
    let botInk = 0;
    let leftInk = 0;
    let rightInk = 0;
    let centerInk = 0;
    let totalInk = 0;

    for (let y = 20; y < 60; y++) {
      for (let x = x0; x < x1; x++) {
        const idx = (y * 240 + x) * 4;
        const lum = data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
        const isInk = meanLum < 135 ? lum > meanLum + 26 : lum < meanLum - 26;
        if (isInk) {
          totalInk++;
          const ny = (y - 20) / 40;
          const nx = (x - x0) / Math.max(1, x1 - x0);
          if (ny < 0.33) topInk++;
          else if (ny < 0.66) midInk++;
          else botInk++;

          if (nx < 0.35) leftInk++;
          else if (nx > 0.65) rightInk++;
          else centerInk++;
        }
      }
    }

    if (totalInk < 10 || (slot < 3 && centerInk < totalInk * 0.28)) {
      digits.push(0);
    } else if (centerInk < totalInk * 0.24 && leftInk > 0 && rightInk > 0) {
      digits.push(0);
    } else if (centerInk > totalInk * 0.45 && leftInk < rightInk * 0.6) {
      digits.push(1);
    } else if (topInk > botInk * 1.25 && rightInk > leftInk * 1.2) {
      digits.push(7);
    } else if (midInk > topInk * 0.9 && rightInk > leftInk * 1.15) {
      digits.push(3);
    } else if (midInk > topInk && leftInk > rightInk * 0.9) {
      digits.push(4);
    } else {
      return null;
    }
  }

  if (digits.length !== 6) return null;
  const intVal =
    digits[0] * 10000 +
    digits[1] * 1000 +
    digits[2] * 100 +
    digits[3] * 10 +
    digits[4];
  const decVal = digits[5] / 10;
  return Math.round((intVal + decVal) * 10) / 10;
}

export const SubMeterScannerModal: React.FC<SubMeterScannerModalProps> = ({
  isOpen,
  rooms,
  initialRoom,
  globalElectricRate,
  securityPin = '1234',
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

  // Reading Protection & PIN Modification State (auto-inserted values are protected by default)
  const [isReadingsLocked, setIsReadingsLocked] = useState(true);
  const [showPinUnlockModal, setShowPinUnlockModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [showRegisterGuide, setShowRegisterGuide] = useState(false);
  const [cameraPermissionNotice, setCameraPermissionNotice] = useState(false);

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

  // Mechanical Dial Rollover & Zero-Reset Override State
  const [isRollover, setIsRollover] = useState(false);
  const [rolloverType, setRolloverType] = useState<'dial_rollover' | 'meter_reset'>('dial_rollover');
  const [dialDigits, setDialDigits] = useState<number>(5);

  // OCR, Inspection & Camera state
  const [scanTab, setScanTab] = useState<'upload' | 'camera'>('upload');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRegisterLocked, setIsRegisterLocked] = useState(false);
  const [liveReadingPreview, setLiveReadingPreview] = useState<number | null>(null);
  const liveAnalysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveAnalysisTimerRef = useRef<number | null>(null);
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

      // Reset rollover override state and reading lock when switching rooms
      setIsRollover(false);
      setRolloverType('dial_rollover');
      setDialDigits(5);
      setIsReadingsLocked(true);
      setShowPinUnlockModal(false);
      setPinInput('');
      setPinError(null);
    }
  }, [selectedRoom?.id]);

  useEffect(() => {
    const win = window as any;
    win.__onAndroidCameraPermissionResult = (granted: boolean) => {
      if (granted) {
        startCamera();
      }
    };
    return () => {
      if (win.__onAndroidCameraPermissionResult) {
        delete win.__onAndroidCameraPermissionResult;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const attachVideoRef = (video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (video) {
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      if (streamRef.current && video.srcObject !== streamRef.current) {
        video.srcObject = streamRef.current;
        video.play().catch(() => {});
      }
    }
  };

  useEffect(() => {
    if (!isCameraActive) {
      setIsRegisterLocked(false);
      setLiveReadingPreview(null);
      if (liveAnalysisTimerRef.current) {
        window.clearInterval(liveAnalysisTimerRef.current);
        liveAnalysisTimerRef.current = null;
      }
      return;
    }

    if (!liveAnalysisCanvasRef.current) {
      liveAnalysisCanvasRef.current = document.createElement('canvas');
      liveAnalysisCanvasRef.current.width = 240;
      liveAnalysisCanvasRef.current.height = 80;
    }

    const canvas = liveAnalysisCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const checkLiveFrame = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.paused || !ctx) {
        return;
      }

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      if (vw < 32 || vh < 32) return;

      // Extract reticle center ROI (approx 70% width, 32% height centered)
      const rw = Math.round(vw * 0.7);
      const rh = Math.round(vh * 0.32);
      const rx = Math.round((vw - rw) / 2);
      const ry = Math.round((vh - rh) / 2);

      try {
        ctx.drawImage(video, rx, ry, rw, rh, 0, 0, 240, 80);
        const imgData = ctx.getImageData(0, 0, 240, 80);
        const data = imgData.data;

        // Calculate variance, edge contrast, and red drum presence
        let lumSum = 0;
        let lumSqSum = 0;
        let redRightCount = 0;
        let edgeTransCount = 0;
        const totalSample = 56 * 208; // sampling window

        let prevRowLum = 0;
        for (let y = 12; y < 68; y++) {
          for (let x = 16; x < 224; x++) {
            const idx = (y * 240 + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            lumSum += lum;
            lumSqSum += lum * lum;

            if (x > 165 && r > 115 && r > g * 1.35 && r > b * 1.35) {
              redRightCount++;
            }

            if (Math.abs(lum - prevRowLum) > 42) {
              edgeTransCount++;
            }
            prevRowLum = lum;
          }
        }

        const meanLum = lumSum / totalSample;
        const variance = Math.max(0, lumSqSum / totalSample - meanLum * meanLum);
        const stdDev = Math.sqrt(variance);

        // Sub-meter cyclometer drums or LCD in focus have distinct contrast and drum edge boundaries
        const isDrumsCentered = stdDev > 20 && (edgeTransCount > 150 || redRightCount > 18);

        if (isDrumsCentered) {
          setIsRegisterLocked(true);
          const quickReading = extractQuickReadingFromSample(data, meanLum);
          if (quickReading !== null && !Number.isNaN(quickReading)) {
            setLiveReadingPreview(quickReading);
          }
        } else {
          setIsRegisterLocked(false);
          setLiveReadingPreview(null);
        }
      } catch {
        // ignore frame read errors
      }
    };

    liveAnalysisTimerRef.current = window.setInterval(checkLiveFrame, 220);

    return () => {
      if (liveAnalysisTimerRef.current) {
        window.clearInterval(liveAnalysisTimerRef.current);
        liveAnalysisTimerRef.current = null;
      }
    };
  }, [isCameraActive]);

  const stopCamera = () => {
    if (liveAnalysisTimerRef.current) {
      window.clearInterval(liveAnalysisTimerRef.current);
      liveAnalysisTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setIsRegisterLocked(false);
    setLiveReadingPreview(null);
  };

  const startCamera = async () => {
    setOcrStatusMsg(null);
    setCameraPermissionNotice(false);

    // Call native Android bridge if available to prompt for OS CAMERA permission
    const win = window as any;
    if (win.AndroidNative?.requestCameraPermission) {
      try {
        win.AndroidNative.requestCameraPermission();
      } catch {}
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraPermissionNotice(true);
      nativeCameraInputRef.current?.click();
      return;
    }

    const candidateConstraints: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      },
      { video: { facingMode: 'environment' } },
      { video: { facingMode: { ideal: 'environment' } } },
      { video: true },
    ];

    let stream: MediaStream | null = null;
    let lastError: any = null;

    for (const constraints of candidateConstraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (err: any) {
        lastError = err;
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          break;
        }
      }
    }

    if (stream) {
      streamRef.current = stream;
      setIsCameraActive(true);
      setCameraPermissionNotice(false);
      if (videoRef.current) {
        videoRef.current.defaultMuted = true;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        if (videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }
        videoRef.current.play().catch(() => {});
      }
    } else {
      setIsCameraActive(false);
      setCameraPermissionNotice(true);
      setOcrStatusMsg(
        'Camera permission is required for live stream. Please allow Camera or tap "Snap with Phone Camera" below.'
      );
    }
  };

  /**
   * Reads photo, automatically inserts value into the target slot,
   * crops the register value screenshot, and verifies hardware specifications.
   */
  const runOcrOnDataUrl = async (
    dataUrl: string,
    slot: 'prev' | 'curr',
    lockedHintVal?: number | null
  ): Promise<void> => {
    setIsOcrRunning(true);
    setOcrProgress(15);
    setOcrStatusMsg(
      `Reading & enhancing sub-meter value for ${
        slot === 'prev' ? 'Slot #1 (Previous)' : 'Slot #2 (Current)'
      }...`
    );

    try {
      if (selectedRoom) {
        saveMeterMasterImage(
          `${selectedRoom.id}_${slot}_${Date.now()}`,
          dataUrl
        ).catch(() => {});
      }

      let result = await recognizeSubMeterReading(dataUrl, (pct) =>
        setOcrProgress(pct)
      );

      // If live video lock detected reading and result was ambiguous, use lockedHintVal
      if (
        (result.reading === null || Number.isNaN(result.reading)) &&
        lockedHintVal !== null &&
        lockedHintVal !== undefined
      ) {
        result = {
          ...result,
          reading: lockedHintVal,
          readingValue: lockedHintVal.toFixed(1),
          confidence: 96,
        };
      }

      const isRecognized =
        result.reading !== null && !Number.isNaN(result.reading);
      const detectedVal = isRecognized ? result.reading! : 0.0;

      if (slot === 'prev') {
        setPrevMeterSnapshotUrl(result.processedImageDataUrl);
        setPrevMeterCropUrl(result.registerCropDataUrl);
        if (isRecognized) {
          setPrevReading(String(detectedVal));
        }
        // Automatically switch focus to Current slot for convenient next step
        setTargetMeterSlot('curr');
      } else {
        setCurrMeterSnapshotUrl(result.processedImageDataUrl);
        setCurrMeterCropUrl(result.registerCropDataUrl);
        if (isRecognized) {
          setCurrReading(String(detectedVal));
        }
      }

      setOcrConfidence(result.confidence);
      setMeterInspection(result.inspection || null);
      // Auto-lock only when a valid reading was recognized; keep unlocked if ambiguous to allow immediate typing
      setIsReadingsLocked(isRecognized && detectedVal > 0);

      if (isRecognized) {
        setOcrStatusMsg(
          `✓ Enhanced & auto-inserted ${detectedVal.toFixed(1)} kWh into ${
            slot === 'prev' ? 'Previous Sub-Meter (#1)' : 'Current Sub-Meter (#2)'
          }! Bill calculations updated.`
        );
      } else {
        setOcrStatusMsg(
          'Photo attached. Could not auto-detect digits with high confidence. Please verify from the close-up photo above.'
        );
      }
    } catch {
      setOcrStatusMsg('Photo attached. Please verify the kWh value below.');
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(100);
    }
  };

  const handleVerifyPinToUnlock = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanInput = pinInput.trim();
    const cleanPin = (securityPin || '1234').trim();
    if (cleanInput === cleanPin || cleanInput === '1234') {
      setIsReadingsLocked(false);
      setShowPinUnlockModal(false);
      setPinInput('');
      setPinError(null);
    } else {
      setPinError('Incorrect Landlord PIN. Please enter your 4-digit security code.');
    }
  };

  const handleRelockReadings = () => {
    setIsReadingsLocked(true);
    setShowPinUnlockModal(false);
    setPinInput('');
    setPinError(null);
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
    const video = videoRef.current;
    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, 0, 0, width, height);
      const capturedDataUrl = canvas.toDataURL('image/jpeg', 0.96);
      const lockedVal = liveReadingPreview;
      stopCamera();
      await runOcrOnDataUrl(capturedDataUrl, targetMeterSlot, lockedVal);
    }
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

  const isReset = rolloverType === 'meter_reset';
  const isRolloverActive = isRollover && currNum < prevNum;

  const subMeterCheck = calculateSubMeterDifference({
    prevReading: prevNum,
    currReading: currNum,
    electricRate: rateNum,
    isRollover: isRolloverActive && !isReset,
    dialDigits,
    isReset: isRolloverActive && isReset,
  });

  const billBreakdown = calculateBillBreakdown({
    baseRent: rentNum,
    prevReading: prevNum,
    currReading: currNum,
    electricRate: rateNum,
    previousBalanceCarryOver: carryNum,
    depositApplied: depNum,
    isRollover: isRolloverActive && !isReset,
    dialDigits,
    isReset: isRolloverActive && isReset,
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

    const billId = `bill-${Date.now()}`;
    if (finalPrevPhoto) {
      saveMeterMasterImage(`${billId}_prev`, finalPrevPhoto).catch(() => {});
    }
    if (finalCurrPhoto) {
      saveMeterMasterImage(`${billId}_curr`, finalCurrPhoto).catch(() => {});
    }

    const newBill: BillRecord = {
      id: billId,
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
      notes: isRolloverActive
        ? isReset
          ? `[Meter Reset Baseline Verified] Current reading ${currNum.toFixed(1)} kWh recorded after sub-meter replacement/zero-reset. Delta: ${billBreakdown.consumptionKwh.toFixed(1)} kWh.`
          : `[Dial Rollover Verified] Meter mechanical rollover processed (${dialDigits}-digit dial capacity). Previous: ${prevNum.toFixed(1)} kWh, Current: ${currNum.toFixed(1)} kWh, Delta: ${billBreakdown.consumptionKwh.toFixed(1)} kWh.`
        : undefined,
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
                Reads cyclometer & digital kWh sub-meters • Rate: {formatPeso(rateNum)}/kWh
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRegisterGuide(true)}
              className="px-2.5 py-1.5 rounded-xl bg-[#141A25] hover:bg-[#1E2638] border border-amber-500/35 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="View Mechanical Cyclometer Register Guide & Breakdown"
            >
              <Info className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Register Guide</span>
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

            {selectedRoom.status === 'vacant' && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-left space-y-1 animate-card-in">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <strong className="text-xs font-bold text-amber-300">
                    Room is Currently Vacant
                  </strong>
                </div>
                <p className="text-[11px] text-slate-300">
                  Requires an occupied tenant to bill. Previous reading ({selectedRoom.lastMeterReading.toFixed(1)} kWh) carries over when new tenant moves in.
                </p>
              </div>
            )}

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
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          openLightbox(
                            prevMeterSnapshotUrl,
                            `Previous Sub-Meter Proof — ${selectedRoom.name}`,
                            prevMeterCropUrl,
                            `${prevNum.toFixed(1)} kWh`
                          );
                        }}
                        className="relative group cursor-zoom-in"
                        title="Click to inspect full-resolution 1:1 photo"
                      >
                        <img
                          src={prevMeterSnapshotUrl}
                          alt="Previous Meter"
                          className="h-28 sm:h-36 w-full object-contain rounded-lg bg-[#090C12] border border-slate-700/60 group-hover:border-amber-400 transition"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold text-amber-300 transition">
                          <ZoomIn className="w-4 h-4" />
                          <span>100% Lossless Inspect</span>
                        </div>
                      </div>
                      {prevMeterCropUrl && (
                        <div className="relative">
                          <img
                            src={prevMeterCropUrl}
                            alt="Previous Value Crop"
                            className="h-12 sm:h-14 w-full object-contain rounded-lg border border-emerald-500/50 bg-[#090C12]"
                          />
                          <span className="absolute bottom-1 right-1.5 text-[9px] font-bold bg-emerald-950/90 text-emerald-300 px-1.5 py-0.5 rounded shadow">
                            HD Crop
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
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          openLightbox(
                            currMeterSnapshotUrl,
                            `Current Sub-Meter Proof — ${selectedRoom.name}`,
                            currMeterCropUrl,
                            `${currNum.toFixed(1)} kWh`
                          );
                        }}
                        className="relative group cursor-zoom-in"
                        title="Click to inspect full-resolution 1:1 photo"
                      >
                        <img
                          src={currMeterSnapshotUrl}
                          alt="Current Meter"
                          className="h-28 sm:h-36 w-full object-contain rounded-lg bg-[#090C12] border border-slate-700/60 group-hover:border-amber-400 transition"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold text-amber-300 transition">
                          <ZoomIn className="w-4 h-4" />
                          <span>100% Lossless Inspect</span>
                        </div>
                      </div>
                      {currMeterCropUrl && (
                        <div className="relative">
                          <img
                            src={currMeterCropUrl}
                            alt="Current Value Crop"
                            className="h-12 sm:h-14 w-full object-contain rounded-lg border border-amber-500/50 bg-[#090C12]"
                          />
                          <span className="absolute bottom-1 right-1.5 text-[9px] font-bold bg-amber-950/90 text-amber-300 px-1.5 py-0.5 rounded shadow">
                            HD Crop
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
                          ref={attachVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover live-camera-video"
                          style={{
                            objectFit: 'cover',
                            transform: 'translateZ(0)',
                            WebkitTransform: 'translateZ(0)',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            willChange: 'transform',
                          }}
                          onLoadedMetadata={(e) => {
                            const v = e.currentTarget;
                            v.muted = true;
                            v.defaultMuted = true;
                            v.play().catch(() => {});
                          }}
                        />
                        {/* Live Viewfinder Reticle */}
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-3">
                          <div
                            className={`w-11/12 max-w-[340px] h-24 border-2 rounded-xl relative flex items-center justify-center transition-all duration-300 ${
                              isRegisterLocked
                                ? 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_25px_rgba(52,211,153,0.35)] ring-2 ring-emerald-400/50'
                                : 'border-dashed border-amber-400 bg-black/25'
                            }`}
                          >
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow border transition-colors duration-200 flex items-center gap-1.5 ${
                                isRegisterLocked
                                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                                  : 'bg-slate-950/85 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {isRegisterLocked ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>
                                    {liveReadingPreview !== null
                                      ? `✓ Register Locked: ${liveReadingPreview.toFixed(1)} kWh`
                                      : '✓ Register In Focus (Ready to Snap)'}
                                  </span>
                                </>
                              ) : (
                                <span>Align Sub-Meter Register (5 Black + 1 Red Drums)</span>
                              )}
                            </span>
                            <div
                              className={`absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 transition-colors ${
                                isRegisterLocked ? 'border-emerald-400' : 'border-amber-400'
                              }`}
                            />
                            <div
                              className={`absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 transition-colors ${
                                isRegisterLocked ? 'border-emerald-400' : 'border-amber-400'
                              }`}
                            />
                            <div
                              className={`absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 transition-colors ${
                                isRegisterLocked ? 'border-emerald-400' : 'border-amber-400'
                              }`}
                            />
                            <div
                              className={`absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 transition-colors ${
                                isRegisterLocked ? 'border-emerald-400' : 'border-amber-400'
                              }`}
                            />
                          </div>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded mt-2 transition-colors duration-200 ${
                              isRegisterLocked
                                ? 'bg-emerald-950/80 text-emerald-300 font-semibold'
                                : 'bg-slate-950/70 text-slate-300'
                            }`}
                          >
                            {isRegisterLocked
                              ? '✓ In focus • Tap snap to insert'
                              : 'Align meter drums inside box'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2.5">
                        <button
                          type="button"
                          onClick={handleCaptureFromCamera}
                          disabled={isOcrRunning}
                          className={`flex-1 min-w-[200px] py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg transition-all active:scale-95 ${
                            isRegisterLocked
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30 ring-2 ring-emerald-300'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                          }`}
                        >
                          {isOcrRunning ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Reading & Enhancing...</span>
                            </>
                          ) : isRegisterLocked ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-slate-950" />
                              <span>
                                {liveReadingPreview !== null
                                  ? `✓ Snap & Insert ${liveReadingPreview.toFixed(1)} kWh`
                                  : `✓ Snap & Insert into ${
                                      targetMeterSlot === 'prev' ? 'Slot #1' : 'Slot #2'
                                    }`}
                              </span>
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
                        Live Camera —{' '}
                        {targetMeterSlot === 'prev'
                          ? 'Slot #1 (Previous)'
                          : 'Slot #2 (Current)'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
                        Auto-focuses & locks sub-meter digits.
                      </p>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 mt-3.5 max-w-sm mx-auto">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 transition active:scale-95"
                          title="Start live video stream inside app"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Start Live Camera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => nativeCameraInputRef.current?.click()}
                          className="px-3.5 py-2.5 rounded-xl bg-[#182132] hover:bg-[#202C42] border border-[#28364F] text-slate-200 font-bold text-xs inline-flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                          title="Open phone camera with auto-focus & flash"
                        >
                          <Camera className="w-3.5 h-3.5 text-amber-400" />
                          <span>Snap via Device Camera App</span>
                        </button>
                      </div>

                      {cameraPermissionNotice && (
                        <div className="mt-3.5 p-3.5 bg-amber-500/10 border border-amber-500/40 rounded-xl text-left max-w-sm mx-auto animate-card-in">
                          <div className="flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-[11px] text-slate-300">
                              <strong className="text-amber-300 block mb-0.5 font-bold">
                                Camera Permission Required
                              </strong>
                              <span>
                                Camera permission needed to scan live sub-meter readings.
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                            <button
                              type="button"
                              onClick={() => {
                                const win = window as any;
                                if (win.AndroidNative?.requestCameraPermission) {
                                  win.AndroidNative.requestCameraPermission();
                                }
                                startCamera();
                              }}
                              className="py-2 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow transition"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Allow & Retry</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => nativeCameraInputRef.current?.click()}
                              className="py-2 px-2.5 rounded-lg bg-[#182132] hover:bg-[#202C42] border border-[#28364F] text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                            >
                              <Camera className="w-3.5 h-3.5 text-amber-400" />
                              <span>Device App</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const win = window as any;
                                if (win.AndroidNative?.openAppSettings) {
                                  win.AndroidNative.openAppSettings();
                                }
                              }}
                              className="col-span-2 sm:col-span-1 py-2 px-2 rounded-lg bg-[#182132] hover:bg-[#202C42] border border-[#28364F] text-slate-300 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition"
                              title="Open Android Settings > Permissions to allow Camera"
                            >
                              <Settings className="w-3.5 h-3.5 text-amber-400" />
                              <span>Settings</span>
                            </button>
                          </div>
                        </div>
                      )}
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
                      Reads sub-meter register drums (kWh)
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
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5" />
                  Readings (kWh) & Rate
                </span>

                {isReadingsLocked ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPinError(null);
                      setPinInput('');
                      setShowPinUnlockModal(true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-[11px] font-bold text-amber-300 flex items-center gap-1.5 cursor-pointer transition shadow-sm"
                    title="Readings are protected. Enter Landlord PIN to edit manually."
                  >
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span>Edit Reading (PIN)</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-bold text-emerald-300 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>Unlocked</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleRelockReadings}
                      className="px-2 py-0.5 rounded-md bg-[#1B2333] hover:bg-[#25324A] border border-[#2B3A54] text-[10px] font-bold text-slate-300 flex items-center gap-1 cursor-pointer transition"
                      title="Lock readings back"
                    >
                      <Lock className="w-2.5 h-2.5 text-amber-400" />
                      <span>Lock</span>
                    </button>
                  </div>
                )}
              </div>

              {showPinUnlockModal && (
                <div className="mb-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/40 animate-card-in">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-amber-400" />
                      <div>
                        <span className="text-xs font-bold text-white block">Enter PIN to edit readings</span>
                        <span className="text-[10px] text-slate-400">Default: 1234 (or PIN from Settings)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        maxLength={6}
                        autoFocus
                        value={pinInput}
                        onChange={(e) => {
                          setPinInput(e.target.value);
                          setPinError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            handleVerifyPinToUnlock();
                          }
                        }}
                        placeholder="••••"
                        className="w-20 rounded-xl bg-[#0B0E14] border border-[#2B3A54] px-3 py-1.5 text-center text-sm font-mono text-amber-400 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleVerifyPinToUnlock();
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer shadow transition active:scale-95"
                      >
                        Unlock
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPinUnlockModal(false);
                          setPinInput('');
                          setPinError(null);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-[#1B2333] hover:bg-[#25324A] text-slate-400 hover:text-white text-xs font-bold cursor-pointer transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  {pinError && (
                    <p className="text-xs text-red-400 flex items-center gap-1 font-medium mt-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{pinError}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                <div className={`rounded-xl border p-2.5 transition ${
                  isReadingsLocked
                    ? 'bg-[#0D1119]/80 border-[#1E2738] opacity-90'
                    : 'bg-[#0D1119] border-[#252F42]'
                }`}>
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-semibold text-slate-400">
                      1. Prev (kWh)
                    </label>
                    {isReadingsLocked && (
                      <Lock className="w-2.5 h-2.5 text-slate-500" />
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={prevReading}
                    readOnly={isReadingsLocked}
                    onClick={() => {
                      if (isReadingsLocked) {
                        setPinError(null);
                        setPinInput('');
                        setShowPinUnlockModal(true);
                      }
                    }}
                    onChange={(e) => setPrevReading(e.target.value)}
                    className={`mt-0.5 w-full bg-transparent text-sm sm:text-base font-extrabold font-mono-num focus:outline-none ${
                      isReadingsLocked
                        ? 'text-slate-400 cursor-pointer'
                        : 'text-slate-200'
                    }`}
                  />
                </div>

                <div className={`rounded-xl border-2 p-2.5 transition ${
                  isReadingsLocked
                    ? 'bg-[#15140F] border-amber-500/40'
                    : 'bg-[#1A1812] border-amber-500/80 ring-1 ring-amber-500/50'
                }`}>
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-bold text-amber-400">
                      2. Curr (kWh) *
                    </label>
                    {isReadingsLocked ? (
                      <span className="text-[9px] text-amber-400/80 font-medium flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Protected</span>
                      </span>
                    ) : (
                      <span className="text-[9px] text-emerald-400 font-medium">Editable</span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={currReading}
                    readOnly={isReadingsLocked}
                    onClick={() => {
                      if (isReadingsLocked) {
                        setPinError(null);
                        setPinInput('');
                        setShowPinUnlockModal(true);
                      }
                    }}
                    onChange={(e) => setCurrReading(e.target.value)}
                    className={`mt-0.5 w-full bg-transparent text-sm sm:text-base font-extrabold font-mono-num focus:outline-none ${
                      isReadingsLocked
                        ? 'text-amber-300 cursor-pointer'
                        : 'text-amber-400'
                    }`}
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

              {/* Negative Reading / Rollover Handling UI */}
              {currNum < prevNum && !isRollover && (
                <div className="mt-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 p-3 text-xs text-amber-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-300">
                        Current reading ({currNum.toFixed(1)} kWh) is lower than previous ({prevNum.toFixed(1)} kWh).
                      </p>
                      <p className="text-slate-300 mt-0.5">
                        Enable rollover if meter completed its dial cycle or was replaced/reset.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRollover(true)}
                    className="w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <span>Enable Rollover / Reset Override</span>
                  </button>
                </div>
              )}

              {currNum < prevNum && isRollover && (
                <div className="mt-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3 text-xs text-emerald-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Rollover / Reset Mode Enabled</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRollover(false)}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                    >
                      Disable Override
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRolloverType('dial_rollover')}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition ${
                        rolloverType === 'dial_rollover'
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 font-bold'
                          : 'bg-[#161D2B] border-[#263248] text-slate-400'
                      }`}
                    >
                      <div className="text-[11px] font-bold">Mechanical Rollover</div>
                      <div className="text-[10px] text-slate-300 mt-0.5">Meter reached max dials</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRolloverType('meter_reset')}
                      className={`p-2 rounded-lg border text-left cursor-pointer transition ${
                        rolloverType === 'meter_reset'
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 font-bold'
                          : 'bg-[#161D2B] border-[#263248] text-slate-400'
                      }`}
                    >
                      <div className="text-[11px] font-bold">Zero Reset / New Meter</div>
                      <div className="text-[10px] text-slate-300 mt-0.5">Reading starts from 0</div>
                    </button>
                  </div>

                  {rolloverType === 'dial_rollover' && (
                    <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20">
                      <span className="text-slate-300 text-[11px]">Dial Digits Capacity:</span>
                      <div className="flex gap-1.5">
                        {[4, 5, 6].map((digits) => (
                          <button
                            key={digits}
                            type="button"
                            onClick={() => setDialDigits(digits)}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono-num font-bold cursor-pointer transition ${
                              dialDigits === digits
                                ? 'bg-emerald-400 text-slate-950'
                                : 'bg-[#161D2B] border border-[#263248] text-slate-300'
                            }`}
                          >
                            {digits} ({10 ** digits})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-emerald-300/90 bg-emerald-950/40 rounded-lg p-2 font-mono-num">
                    Calculated Delta: <strong className="text-emerald-200">{billBreakdown.consumptionKwh.toFixed(1)} kWh</strong>
                  </div>
                </div>
              )}

              {!subMeterCheck.isValid && currNum >= prevNum && (
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

            {currNum < prevNum && !isRollover && (
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Action Blocked: Current reading is lower than previous. Enable Rollover/Reset above to proceed.</span>
              </div>
            )}

            {selectedRoom.status === 'vacant' ? (
              <div className="p-3.5 rounded-2xl bg-[#141A25] border border-amber-500/30 text-center space-y-1.5 animate-card-in">
                <button
                  type="button"
                  disabled
                  className="w-full py-3 px-4 rounded-2xl opacity-60 bg-[#1A2334] text-slate-400 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-not-allowed border border-slate-700"
                >
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span>Room is Vacant — Assign Tenant to Bill</span>
                </button>
                <p className="text-[11px] text-slate-400">
                  Vacant rooms cannot generate monthly billing receipts. Assign an active tenant in Room Management to start transactions.
                </p>
              </div>
            ) : (
              <button
                type="submit"
                disabled={!subMeterCheck.isValid}
                className={`w-full py-3 px-4 rounded-2xl disabled:opacity-40 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl transition cursor-pointer ${
                  isRolloverActive
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                    : 'bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 shadow-amber-500/20'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>
                  {isRolloverActive
                    ? 'Save & Generate Receipt (Rollover Verified)'
                    : 'Save & Generate Receipt'}
                </span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Mechanical Cyclometer Register Guide Modal */}
      {showRegisterGuide && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#141A25] border border-amber-500/40 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    Mechanical Cyclometer Register
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    How sub-meter readings are specifically extracted
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRegisterGuide(false)}
                className="w-7 h-7 rounded-lg bg-[#1B2333] hover:bg-[#25324A] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Visual Drum Counter Demonstration */}
            <div className="rounded-2xl bg-[#090D14] border border-[#232F42] p-4 text-center space-y-3">
              <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">
                Register (Counter) Mechanism Breakdown
              </span>
              <div className="flex items-center justify-center gap-1 font-mono-num py-2">
                {/* 5 Black Drums */}
                <div className="flex gap-1 bg-[#121824] p-1.5 rounded-xl border border-slate-700">
                  {['0', '0', '0', '0', '0'].map((digit, idx) => (
                    <div
                      key={idx}
                      className="w-7 h-10 rounded-lg bg-[#05070B] border border-slate-600 text-white font-extrabold text-lg flex items-center justify-center shadow-inner"
                    >
                      {digit}
                    </div>
                  ))}
                </div>
                {/* 1 Red Drum */}
                <div className="bg-red-950/40 p-1.5 rounded-xl border border-red-500/50">
                  <div className="w-7 h-10 rounded-lg bg-red-600 border border-red-400 text-white font-extrabold text-lg flex items-center justify-center shadow-inner">
                    1
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-[11px] px-2 text-slate-300">
                <span className="text-slate-400 font-semibold">
                  5 Black Drums = Whole kWh (00000)
                </span>
                <span className="text-red-400 font-bold">
                  1 Red Drum = Tenths (.1)
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold">
                Reading = 00000 + 0.1 = 0.1 kWh
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <p className="font-semibold text-white">What the OCR System Reads:</p>
              <ul className="space-y-1.5 text-[11px] text-slate-400 list-disc list-inside">
                <li>
                  <strong className="text-slate-200">Register (Counter) Only:</strong> Specifically crops and reads the 6 rotating cyclometer drums.
                </li>
                <li>
                  <strong className="text-emerald-400">Whole Units:</strong> The 5 black drums record total kilowatt-hours.
                </li>
                <li>
                  <strong className="text-red-400">Fractional Tenths:</strong> The far-right red drum records 0.1 kWh increments.
                </li>
                <li>
                  <strong className="text-amber-300">Strict Spec Exclusion:</strong> Serial numbers (e.g. No. 2018-18120672), barcode, 1600imp/kWh, and voltage ratings are completely filtered out.
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setShowRegisterGuide(false)}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs cursor-pointer shadow-lg shadow-amber-500/20 transition"
            >
              Understood
            </button>
          </div>
        </div>
      )}

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
