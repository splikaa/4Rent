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
import {
  AdvanceCapPolicyMode,
  BillRecord,
  ComponentPaymentAllocation,
  LatePenaltyConfig,
  MonthlyMeterReading,
  PaymentAllocationTarget,
  Room,
} from '../../types/rental';
import {
  calculateBillBreakdown,
  calculateSubMeterDifference,
  formatPeso,
  getBillingPeriodOptions,
  getElectricRateForPeriod,
  isMobileDevice,
  isRunningInMobileApp,
  roundCurrency,
} from '../../utils/billingCalculator';
import {
  calculateMonthlyRentSummary,
  getBillingMonthSchedule,
  normalizeBillingMonthKey,
  validateMonthlyMeterReading,
} from '../../utils/rentSchedule';
import {
  formatKwhReading,
  fromCentavos,
  getAdvancePolicyAllowance,
  resolveCarryOverUnpaidBalance,
  toCentavos,
} from '../../utils/financialEngine';
import {
  formatPrimaryRoomLabel,
  getSelectedRoomInfoSummary,
  sortAndDeduplicateActiveRooms,
} from '../../utils/roomSelection';
import {
  generateSimulatedSubMeterDataUrl,
  generateSimulatedValueCropDataUrl,
  preprocessMeterImage,
  recognizeSubMeterReading,
  SubMeterHardwareInspection,
} from '../../services/ocrService';
import { saveMeterMasterImage } from '../../services/idbDatabase';
import { computeLandscapeFrameProjection } from '../../utils/cameraGeometry';
import { peekCachedMeterImage, resolveMeterImageSrc } from '../../utils/resolveMeterImage';
import { MeterPhotoLightboxModal } from './MeterPhotoLightboxModal';

interface SubMeterScannerModalProps {
  isOpen: boolean;
  rooms: Room[];
  existingBills?: BillRecord[];
  monthlyReadings?: MonthlyMeterReading[];
  initialRoom?: Room | null;
  advanceCapMode?: AdvanceCapPolicyMode;
  globalElectricRate: number;
  monthlyElectricRates?: Record<string, number>;
  latePenaltyConfig?: LatePenaltyConfig;
  securityPin?: string;
  onClose: () => void;
  onSaveVerifiedReading?: (
    reading: MonthlyMeterReading
  ) => { ok: boolean; error?: string; saved?: MonthlyMeterReading } | void;
  onOpenExistingReceipt?: (bill: BillRecord) => void;
  onGenerateBill: (
    newBill: BillRecord,
    options?: {
      meterReading?: MonthlyMeterReading;
      initialAllocationTarget?: PaymentAllocationTarget;
      initialCustomAllocation?: Partial<ComponentPaymentAllocation>;
    }
  ) => boolean | Promise<boolean> | void;
}

export const SubMeterScannerModal: React.FC<SubMeterScannerModalProps> = ({
  isOpen,
  rooms,
  existingBills = [],
  monthlyReadings = [],
  initialRoom,
  advanceCapMode = 'unlimited',
  globalElectricRate,
  monthlyElectricRates,
  latePenaltyConfig,
  securityPin = '',
  onClose,
  onSaveVerifiedReading,
  onOpenExistingReceipt,
  onGenerateBill,
}) => {
  const activeRooms = sortAndDeduplicateActiveRooms(rooms);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const selectedRoom =
    activeRooms.find((r) => r.id === selectedRoomId) ||
    (initialRoom && activeRooms.find((r) => r.id === initialRoom.id)) ||
    activeRooms[0];
  const selectedRoomInfo = getSelectedRoomInfoSummary(selectedRoom);
  const isSubmittingBillRef = useRef(false);
  const [billSessionKey, setBillSessionKey] = useState<string>('');

  const billingPeriodOptions = getBillingPeriodOptions();

  // Sub-meter & billing fields
  const [prevReading, setPrevReading] = useState('0');
  const [currReading, setCurrReading] = useState('');
  const [baseRent, setBaseRent] = useState('4500');
  const [isCustomRentOverride, setIsCustomRentOverride] = useState(false);
  const [occupancyStartDate, setOccupancyStartDate] = useState<string>('');
  const [occupancyEndDate, setOccupancyEndDate] = useState<string>('');
  const [carryOverBalance, setCarryOverBalance] = useState('0');
  const [reqDepositApplied, setReqDepositApplied] = useState('0');
  const [depositApplied, setDepositApplied] = useState('0');
  const [billingPeriod, setBillingPeriod] = useState(() =>
    new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  );
  const [initialPayStatus, setInitialPayStatus] = useState<
    'unpaid' | 'paid' | 'partial'
  >('unpaid');
  const [initialAllocationTarget, setInitialAllocationTarget] =
    useState<PaymentAllocationTarget>('auto');
  const [initialAmountPaid, setInitialAmountPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<
    'Cash' | 'GCash' | 'Maya' | 'Bank Transfer'
  >('GCash');

  // Mandatory OCR Verification & Authorized Correction State
  const [ocrExtractedCurrKwh, setOcrExtractedCurrKwh] = useState<number | null>(
    null
  );
  const [isCurrentReadingVerified, setIsCurrentReadingVerified] =
    useState(false);
  const [verifiedAtIso, setVerifiedAtIso] = useState<string | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [pinAuthorizedCorrection, setPinAuthorizedCorrection] = useState(false);
  const [savedMonthlyReadingId, setSavedMonthlyReadingId] = useState<
    string | null
  >(null);
  const [meterResetReason, setMeterResetReason] = useState('');

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

  // Allow live snapshot camera on ALL mobile devices (Android APK, iOS Home Screen PWA, mobile browsers)
  const isMobileApp = isRunningInMobileApp() || isMobileDevice();

  // OCR, Inspection & Snapshot Camera state
  const [scanTab, setScanTab] = useState<'upload' | 'camera'>('upload');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isLandscapeLocked, setIsLandscapeLocked] = useState(false);
  const [isRegisterLocked, setIsRegisterLocked] = useState(false);
  const [autoSnapEnabled, setAutoSnapEnabled] = useState(false);
  const [showShutterFlash, setShowShutterFlash] = useState(false);
  const [collectedSnapshots, setCollectedSnapshots] = useState<
    Array<{
      id: string;
      dataUrl: string;
      slot: 'prev' | 'curr';
      reading: number | null;
      isAuthentic: boolean;
      statusLabel: string;
      capturedAt: string;
    }>
  >([]);
  const isLockedRef = useRef(false);
  const autoSnapRef = useRef(false);
  const autoSnapCooldownRef = useRef(false);
  const isOcrRunningRef = useRef(false);
  const pendingPermissionRetryRef = useRef(false);
  const isStartingCameraRef = useRef(false);
  const imageCaptureRef = useRef<any>(null);
  const viewfinderCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewfinderTimerRef = useRef<number | null>(null);
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
    autoSnapRef.current = autoSnapEnabled;
  }, [autoSnapEnabled]);

  useEffect(() => {
    isOcrRunningRef.current = isOcrRunning;
  }, [isOcrRunning]);

  const unlockScreenOrientation = () => {
    try {
      const orientation = (screen as any)?.orientation;
      if (orientation && typeof orientation.unlock === 'function') {
        orientation.unlock();
      }
    } catch {
      // Ignore unsupported orientation API
    }
    setIsLandscapeLocked(false);
  };

  const toggleLandscapeOrientationLock = async () => {
    const orientation = (screen as any)?.orientation;
    if (isLandscapeLocked) {
      unlockScreenOrientation();
      return;
    }
    try {
      if (orientation && typeof orientation.lock === 'function') {
        await orientation.lock('landscape');
        setIsLandscapeLocked(true);
        return;
      }
      setOcrStatusMsg(
        'Landscape 16:9 viewfinder crop active (rotate phone sideways if screen lock is unavailable).'
      );
    } catch {
      setOcrStatusMsg(
        'Landscape 16:9 viewfinder crop active (rotate phone sideways for horizontal view).'
      );
    }
  };

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
    if (!isOpen || !selectedRoom) return;
    const monthKey = normalizeBillingMonthKey(billingPeriod);
    const existingVerifiedReading = monthlyReadings.find(
      (r) =>
        r.roomId === selectedRoom.id &&
        normalizeBillingMonthKey(r.billingMonthKey || r.billingPeriod) ===
          monthKey &&
        r.isVerified
    );

    const prev = existingVerifiedReading
      ? existingVerifiedReading.previousReadingKwh
      : selectedRoom.lastMeterReading || 0;
    setPrevReading(String(prev));

    if (existingVerifiedReading) {
      setCurrReading(String(existingVerifiedReading.currentReadingKwh));
      setOcrExtractedCurrKwh(
        existingVerifiedReading.ocrExtractedReadingKwh ?? null
      );
      setIsCurrentReadingVerified(true);
      setVerifiedAtIso(existingVerifiedReading.verifiedAt);
      setSavedMonthlyReadingId(existingVerifiedReading.id);
      setCorrectionNote(existingVerifiedReading.correctionNote || '');
      setPinAuthorizedCorrection(
        Boolean(existingVerifiedReading.correctionAuthorized)
      );
      setCurrMeterSnapshotUrl(
        peekCachedMeterImage(existingVerifiedReading.currPhotoDataUrl) || ''
      );
      setCurrMeterCropUrl(
        peekCachedMeterImage(existingVerifiedReading.currCropDataUrl) || ''
      );
      if (existingVerifiedReading.currPhotoDataUrl?.startsWith('idb:meter:')) {
        void resolveMeterImageSrc(existingVerifiedReading.currPhotoDataUrl).then(
          (resolved) => {
            if (resolved) setCurrMeterSnapshotUrl(resolved);
          }
        );
      }
      if (existingVerifiedReading.currCropDataUrl?.startsWith('idb:meter:')) {
        void resolveMeterImageSrc(existingVerifiedReading.currCropDataUrl).then(
          (resolved) => {
            if (resolved) setCurrMeterCropUrl(resolved);
          }
        );
      }
    } else {
      // Leave current reading blank until OCR extraction or PIN-authorized entry is verified
      setCurrReading('');
      setOcrExtractedCurrKwh(null);
      setIsCurrentReadingVerified(false);
      setVerifiedAtIso(null);
      setSavedMonthlyReadingId(null);
      setCorrectionNote('');
      setPinAuthorizedCorrection(false);
      setCurrMeterSnapshotUrl('');
      setCurrMeterCropUrl('');
    }

    setOccupancyStartDate(selectedRoom.tenant?.moveInDate || '');
    setOccupancyEndDate(selectedRoom.tenant?.moveOutDate || '');
    setIsCustomRentOverride(false);
    const resolvedCarryOver = resolveCarryOverUnpaidBalance(
      selectedRoom,
      existingBills,
      monthKey
    );
    setCarryOverBalance(String(resolvedCarryOver));
    // Hold paid Required Security Deposit intact by default; landlord can click "Apply Held" to deduct on final bill
    setReqDepositApplied('0');
    setDepositApplied(String(selectedRoom.advanceRent || 0));

    // Previous slot has previous photo and value crop (resolve cached IDB references cleanly)
    const cachedPrevSnap = peekCachedMeterImage(selectedRoom.lastMeterPhotoDataUrl);
    const cachedPrevCrop = peekCachedMeterImage(selectedRoom.lastMeterCropDataUrl);
    setPrevMeterSnapshotUrl(
      cachedPrevSnap || generateSimulatedSubMeterDataUrl(prev)
    );
    setPrevMeterCropUrl(
      cachedPrevCrop || generateSimulatedValueCropDataUrl(prev)
    );

    setTargetMeterSlot('curr');
    setOcrStatusMsg(
      existingVerifiedReading
        ? `Verified monthly reading loaded for ${billingPeriod}: ${formatKwhReading(existingVerifiedReading.currentReadingKwh)} kWh.`
        : null
    );
    setOcrConfidence(existingVerifiedReading?.ocrConfidence ?? null);
    setMeterInspection(null);
    setCollectedSnapshots([]);
    setInitialPayStatus('unpaid');
    setInitialAllocationTarget('auto');
    setInitialAmountPaid('0');
    setBillSessionKey(`gen-${selectedRoom.id}-${monthKey}-${Date.now()}`);
    isSubmittingBillRef.current = false;

    // Reset rollover override state and reading lock when switching rooms or billing periods
    setIsRollover(Boolean(existingVerifiedReading?.meterResetOrReplacement));
    setRolloverType(existingVerifiedReading?.meterResetType || 'dial_rollover');
    setDialDigits(existingVerifiedReading?.dialDigits || 5);
    setMeterResetReason(existingVerifiedReading?.meterResetDocumentedReason || '');
    setIsReadingsLocked(true);
    setShowPinUnlockModal(false);
    setPinInput('');
    setPinError(null);
  }, [isOpen, selectedRoom?.id, billingPeriod]);

  // Keep financial balance pre-fills fresh if a background payment/sync updates room balances
  // without wiping in-progress OCR scan readings, captured photos, or manual overrides.
  useEffect(() => {
    if (!isOpen || !selectedRoom) return;
    const monthKey = normalizeBillingMonthKey(billingPeriod);
    const resolvedCarryOver = resolveCarryOverUnpaidBalance(
      selectedRoom,
      existingBills,
      monthKey
    );
    setCarryOverBalance(String(resolvedCarryOver));
    setDepositApplied(String(selectedRoom.advanceRent || 0));
  }, [
    isOpen,
    selectedRoom?.id,
    selectedRoom?.unpaidBalance,
    selectedRoom?.advanceRent,
    billingPeriod,
    existingBills,
  ]);

  useEffect(() => {
    const win = window as any;
    win.__onAndroidCameraPermissionResult = (granted: boolean) => {
      // Only resume camera once when an explicit native permission prompt just resolved
      if (!pendingPermissionRetryRef.current) return;
      pendingPermissionRetryRef.current = false;
      if (granted) {
        startCamera();
      } else {
        setCameraPermissionNotice(true);
      }
    };
    return () => {
      pendingPermissionRetryRef.current = false;
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

  useEffect(() => {
    if (!isOpen) {
      unlockScreenOrientation();
      return;
    }
    if (!selectedRoom) return;
    let cancelled = false;
    const photoRef = selectedRoom.lastMeterPhotoDataUrl;
    const cropRef = selectedRoom.lastMeterCropDataUrl;

    if (photoRef && photoRef.startsWith('idb:meter:')) {
      void resolveMeterImageSrc(photoRef).then((resolved) => {
        if (!cancelled && resolved) {
          setPrevMeterSnapshotUrl(resolved);
        }
      });
    }
    if (cropRef && cropRef.startsWith('idb:meter:')) {
      void resolveMeterImageSrc(cropRef).then((resolved) => {
        if (!cancelled && resolved) {
          setPrevMeterCropUrl(resolved);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    selectedRoom?.id,
    selectedRoom?.lastMeterPhotoDataUrl,
    selectedRoom?.lastMeterCropDataUrl,
  ]);

  const attachOffscreenVideoRef = (video: HTMLVideoElement | null) => {
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
      isLockedRef.current = false;
      autoSnapCooldownRef.current = false;
      setIsRegisterLocked(false);
      if (viewfinderTimerRef.current) {
        window.clearInterval(viewfinderTimerRef.current);
        viewfinderTimerRef.current = null;
      }
      return;
    }

    let frameCounter = 0;
    let lockStreak = 0;
    let unlockStreak = 0;

    // Render steady still snapshots onto a 2D <canvas> (~110ms cadence) instead of exposing a WebView <video> layer.
    const tickSnapshotViewfinder = () => {
      const video = videoRef.current;
      const canvas = viewfinderCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.paused) {
        return;
      }

      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      if (vw < 32 || vh < 32) return;

      // Always enforce true 16:9 landscape framing (center-cropping mobile portrait streams)
      const proj = computeLandscapeFrameProjection(vw, vh, {
        targetAspect: 16 / 9,
        maxEdge: 800,
      });
      if (canvas.width !== proj.outWidth || canvas.height !== proj.outHeight) {
        canvas.width = proj.outWidth;
        canvas.height = proj.outHeight;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const cw = canvas.width;
      const ch = canvas.height;

      try {
        ctx.drawImage(
          video,
          proj.sx,
          proj.sy,
          proj.sw,
          proj.sh,
          0,
          0,
          cw,
          ch
        );
      } catch {
        return;
      }

      frameCounter++;
      // Inspect alignment every ~440ms using ROI directly from the drawn canvas
      if (frameCounter % 4 !== 0) return;

      try {
        const roiW = 240;
        const roiH = 80;
        const roiX = Math.max(0, Math.round((cw - roiW) / 2));
        const roiY = Math.max(0, Math.round((ch - roiH) / 2));
        const imgData = ctx.getImageData(roiX, roiY, roiW, roiH);
        const data = imgData.data;

        let lumSum = 0;
        let lumSqSum = 0;
        let redRightCount = 0;
        let redLeftCount = 0;
        let darkDrumsCount = 0;
        let neonRgbCount = 0;
        let edgeTransCount = 0;
        const totalSample = 56 * 208;

        let prevRowLum = 0;
        for (let y = 12; y < 68; y++) {
          for (let x = 16; x < 224; x++) {
            const idx = (y * roiW + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            lumSum += lum;
            lumSqSum += lum * lum;

            const isRed = r > 115 && r > g * 1.35 && r > b * 1.35;
            if (isRed) {
              if (x > 170) {
                redRightCount++;
              } else if (x < 155) {
                redLeftCount++;
              }
            } else if (x < 165 && lum < 80) {
              darkDrumsCount++;
            }

            if ((b > 155 && b > g * 1.3 && b > r * 1.1) || (r > 155 && b > 140 && g < 90)) {
              neonRgbCount++;
            }

            if (Math.abs(lum - prevRowLum) > 38) {
              edgeTransCount++;
            }
            prevRowLum = lum;
          }
        }

        const meanLum = lumSum / totalSample;
        const variance = Math.max(0, lumSqSum / totalSample - meanLum * meanLum);
        const stdDev = Math.sqrt(variance);
        const neonRatio = neonRgbCount / totalSample;

        const isCyclometerAligned =
          redRightCount >= 28 &&
          redRightCount > redLeftCount * 2.2 &&
          darkDrumsCount > 220 &&
          edgeTransCount > 65;

        const isLcdAligned =
          stdDev > 24 &&
          edgeTransCount > 210 &&
          meanLum > 55 &&
          meanLum < 185 &&
          redLeftCount === 0 &&
          neonRatio < 0.12;

        const isMeterAligned = isCyclometerAligned || isLcdAligned;

        if (isMeterAligned) {
          unlockStreak = 0;
          lockStreak++;
          if (lockStreak >= 2 && !isLockedRef.current) {
            isLockedRef.current = true;
            setIsRegisterLocked(true);
          }
          // Optional hands-free Auto-Snap once meter stays stably locked (~1.3s)
          if (
            autoSnapRef.current &&
            lockStreak >= 3 &&
            !isOcrRunningRef.current &&
            !autoSnapCooldownRef.current
          ) {
            autoSnapCooldownRef.current = true;
            void captureHighResSnapshotAndScan(false);
          }
        } else {
          lockStreak = 0;
          unlockStreak++;
          if (unlockStreak >= 3 && isLockedRef.current) {
            isLockedRef.current = false;
            autoSnapCooldownRef.current = false;
            setIsRegisterLocked(false);
          }
        }
      } catch {
        // Ignore transient frame read error
      }
    };

    viewfinderTimerRef.current = window.setInterval(tickSnapshotViewfinder, 110);

    return () => {
      if (viewfinderTimerRef.current) {
        window.clearInterval(viewfinderTimerRef.current);
        viewfinderTimerRef.current = null;
      }
    };
  }, [isCameraActive]);

  const stopCamera = () => {
    pendingPermissionRetryRef.current = false;
    imageCaptureRef.current = null;
    if (viewfinderTimerRef.current) {
      window.clearInterval(viewfinderTimerRef.current);
      viewfinderTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    isLockedRef.current = false;
    autoSnapCooldownRef.current = false;
    setIsCameraActive(false);
    setIsRegisterLocked(false);
    unlockScreenOrientation();
  };

  const startCamera = async () => {
    if (isStartingCameraRef.current) return;
    isStartingCameraRef.current = true;
    setOcrStatusMsg(null);
    setCameraPermissionNotice(false);

    try {
      const win = window as any;
      if (win.AndroidNative?.hasCameraPermission && !win.AndroidNative.hasCameraPermission()) {
        pendingPermissionRetryRef.current = true;
        win.AndroidNative.requestCameraPermission();
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraPermissionNotice(true);
        nativeCameraInputRef.current?.click();
        return;
      }

      // Stop any existing stream before opening a fresh rear-camera snapshot feed
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const candidateConstraints: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            aspectRatio: { ideal: 16 / 9 },
          },
          audio: false,
        },
        {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            aspectRatio: { ideal: 16 / 9 },
          },
          audio: false,
        },
        { video: { facingMode: 'environment' }, audio: false },
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        { video: true, audio: false },
      ];

      let stream: MediaStream | null = null;
      for (const constraints of candidateConstraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) break;
        } catch (err: any) {
          if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
            break;
          }
        }
      }

      if (stream) {
        streamRef.current = stream;
        const [videoTrack] = stream.getVideoTracks();
        if (videoTrack?.applyConstraints) {
          try {
            await videoTrack.applyConstraints({
              aspectRatio: { ideal: 16 / 9 },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            });
          } catch {
            // Device hardware may lock portrait sensor dimensions; 16:9 crop projection still enforces landscape output.
          }
        }
        if (videoTrack && 'ImageCapture' in window) {
          try {
            imageCaptureRef.current = new (window as any).ImageCapture(videoTrack);
          } catch {
            imageCaptureRef.current = null;
          }
        } else {
          imageCaptureRef.current = null;
        }

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
          'Camera permission is required for snapshots. Please allow Camera or tap "Phone Camera App".'
        );
      }
    } finally {
      isStartingCameraRef.current = false;
    }
  };

  /**
   * Reads photo, validates authentic electric sub-meter hardware,
   * records it in the Collected Snapshots list, and inserts kWh into the target slot.
   */
  const runOcrOnDataUrl = async (
    dataUrl: string,
    slot: 'prev' | 'curr',
    existingSnapshotId?: string
  ): Promise<void> => {
    setIsOcrRunning(true);
    setOcrProgress(15);
    setOcrStatusMsg(
      `Inspecting sub-meter screenshot for ${
        slot === 'prev' ? 'Slot #1 (Previous)' : 'Slot #2 (Current)'
      }...`
    );

    const snapshotId = existingSnapshotId || `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const timeLabel = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    try {
      if (selectedRoom) {
        saveMeterMasterImage(
          `${selectedRoom.id}_${slot}_${Date.now()}`,
          dataUrl
        ).catch(() => {});
      }

      const result = await recognizeSubMeterReading(dataUrl, (pct) =>
        setOcrProgress(pct)
      );

      // Strict validation: Reject non-sub-meter objects (e.g. keyboards, screens, play buttons)
      if (!result.isAuthentic) {
        setOcrConfidence(0);
        setMeterInspection(result.inspection || null);
        setIsReadingsLocked(false);
        setCollectedSnapshots((prev) => [
          {
            id: snapshotId,
            dataUrl,
            slot,
            reading: null,
            isAuthentic: false,
            statusLabel: 'Rejected (Not Meter)',
            capturedAt: timeLabel,
          },
          ...prev.filter((s) => s.id !== snapshotId),
        ].slice(0, 6));
        setOcrStatusMsg(
          '⚠️ No Electric Sub-Meter Detected. Please frame a physical electric sub-meter dial.'
        );
        return;
      }

      const isRecognized =
        result.reading !== null && !Number.isNaN(result.reading);
      const detectedVal = isRecognized ? result.reading! : 0.0;

      setCollectedSnapshots((prev) => [
        {
          id: snapshotId,
          dataUrl: result.processedImageDataUrl || dataUrl,
          slot,
          reading: isRecognized ? detectedVal : null,
          isAuthentic: true,
          statusLabel: isRecognized
            ? `${detectedVal.toFixed(1)} kWh`
            : 'Meter Verified',
          capturedAt: timeLabel,
        },
        ...prev.filter((s) => s.id !== snapshotId),
      ].slice(0, 6));

      if (slot === 'prev') {
        setPrevMeterSnapshotUrl(result.processedImageDataUrl);
        setPrevMeterCropUrl(result.registerCropDataUrl);
        if (isRecognized) {
          setPrevReading(String(detectedVal));
          setIsCurrentReadingVerified(false);
        }
        // Automatically switch focus to Current slot for convenient next snapshot
        setTargetMeterSlot('curr');
        autoSnapCooldownRef.current = false;
      } else {
        setCurrMeterSnapshotUrl(result.processedImageDataUrl);
        setCurrMeterCropUrl(result.registerCropDataUrl);
        if (isRecognized) {
          setCurrReading(String(detectedVal));
          setOcrExtractedCurrKwh(detectedVal);
          setIsCurrentReadingVerified(false);
          setVerifiedAtIso(null);
        } else {
          setOcrExtractedCurrKwh(null);
          setIsCurrentReadingVerified(false);
        }
      }

      setOcrConfidence(result.confidence);
      setMeterInspection(result.inspection || null);
      // Lock input only when authentic reading succeeded cleanly without ambiguity flags
      setIsReadingsLocked(isRecognized && detectedVal > 0 && !result.needsVerification);

      if (isRecognized && result.needsVerification) {
        setOcrStatusMsg(
          `Detected ${formatKwhReading(detectedVal)} kWh (${slot === 'prev' ? 'Previous' : 'Current'}) | ${result.unclearReason || 'Verify digits or unlock with PIN to correct before saving'}.`
        );
      } else if (isRecognized) {
        setOcrStatusMsg(
          `OCR extracted ${formatKwhReading(detectedVal)} kWh for ${
            slot === 'prev' ? 'Previous Slot' : 'Current Slot'
          }. Confirm & Verify below before generating the bill.`
        );
      } else {
        setOcrStatusMsg(
          result.unclearReason
            ? `${result.unclearReason}`
            : 'Sub-meter captured, but digits are unclear. Unlock with PIN to enter verified kWh.'
        );
      }
    } catch {
      setOcrStatusMsg('Snapshot attached. Please verify the kWh value below.');
    } finally {
      setIsOcrRunning(false);
      setOcrProgress(100);
    }
  };

  const handleVerifyPinToUnlock = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanInput = pinInput.trim();
    const cleanPin = (securityPin || '').trim();
    if (cleanPin && cleanInput === cleanPin) {
      setIsReadingsLocked(false);
      setPinAuthorizedCorrection(true);
      setShowPinUnlockModal(false);
      setPinInput('');
      setPinError(null);
    } else {
      setPinError(
        cleanPin
          ? 'Incorrect Landlord PIN. Please enter your 4-digit security code.'
          : 'No security PIN configured. Set your PIN in Security Setup or Settings.'
      );
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
    const cachedFallbackPhoto = peekCachedMeterImage(selectedRoom?.lastMeterPhotoDataUrl);
    const cachedFallbackCrop = peekCachedMeterImage(selectedRoom?.lastMeterCropDataUrl);
    const finalPhoto =
      currMeterSnapshotUrl ||
      cachedFallbackPhoto ||
      generateSimulatedSubMeterDataUrl(currVal);
    const finalCrop =
      currMeterCropUrl ||
      cachedFallbackCrop ||
      generateSimulatedValueCropDataUrl(currVal);

    setPrevReading(String(currVal));
    setPrevMeterSnapshotUrl(finalPhoto);
    setPrevMeterCropUrl(finalCrop);

    if (!currMeterSnapshotUrl && selectedRoom?.lastMeterPhotoDataUrl?.startsWith('idb:meter:')) {
      void resolveMeterImageSrc(selectedRoom.lastMeterPhotoDataUrl).then((resolved) => {
        if (resolved) setPrevMeterSnapshotUrl(resolved);
      });
    }
    if (!currMeterCropUrl && selectedRoom?.lastMeterCropDataUrl?.startsWith('idb:meter:')) {
      void resolveMeterImageSrc(selectedRoom.lastMeterCropDataUrl).then((resolved) => {
        if (resolved) setPrevMeterCropUrl(resolved);
      });
    }

    // Prepare Current for new consumption
    setCurrReading(String(currVal));
    setCurrMeterSnapshotUrl('');
    setCurrMeterCropUrl('');
    setTargetMeterSlot('curr');
    setOcrStatusMsg(
      `✓ Rolled over! Previous meter set to ${currVal.toFixed(1)} kWh. Slot #2 ready for new month.`
    );
  };

  const readBlobAsDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Failed to read captured photo blob'));
      };
      reader.onerror = () => reject(new Error('Blob FileReader error'));
      reader.readAsDataURL(blob);
    });

  const normalizeCapturedDataUrlToLandscape = (rawDataUrl: string): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(rawDataUrl);
          return;
        }
        const proj = computeLandscapeFrameProjection(w, h, {
          targetAspect: 16 / 9,
          maxEdge: 1920,
        });
        if (
          w > h &&
          Math.abs(w / h - 16 / 9) <= 0.08 &&
          proj.outWidth === w &&
          proj.outHeight === h
        ) {
          resolve(rawDataUrl);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = proj.outWidth;
        canvas.height = proj.outHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          img,
          proj.sx,
          proj.sy,
          proj.sw,
          proj.sh,
          0,
          0,
          proj.outWidth,
          proj.outHeight
        );
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    });

  const captureHighResSnapshotAndScan = async (keepCameraOpen = true) => {
    if (isOcrRunningRef.current) return;

    // Brief visual shutter flash (no looping animations)
    setShowShutterFlash(true);
    window.setTimeout(() => setShowShutterFlash(false), 160);

    let capturedDataUrl: string | null = null;

    // 1. Prefer native hardware still capture via ImageCapture.takePhoto() for crisp autofocus
    if (imageCaptureRef.current?.takePhoto) {
      try {
        const photoBlob: Blob = await Promise.race([
          imageCaptureRef.current.takePhoto(),
          new Promise<never>((_, reject) =>
            window.setTimeout(() => reject(new Error('takePhoto timeout')), 1600)
          ),
        ]);
        const rawPhoto = await readBlobAsDataUrl(photoBlob);
        capturedDataUrl = await normalizeCapturedDataUrlToLandscape(rawPhoto);
      } catch {
        capturedDataUrl = null;
      }
    }

    // 2. Fallback to full-resolution offscreen camera frame capture (projected to 16:9 landscape)
    if (!capturedDataUrl && videoRef.current && videoRef.current.readyState >= 2) {
      const video = videoRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const proj = computeLandscapeFrameProjection(width, height, {
        targetAspect: 16 / 9,
        maxEdge: 1920,
      });
      const canvas = document.createElement('canvas');
      canvas.width = proj.outWidth;
      canvas.height = proj.outHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          video,
          proj.sx,
          proj.sy,
          proj.sw,
          proj.sh,
          0,
          0,
          proj.outWidth,
          proj.outHeight
        );
        capturedDataUrl = canvas.toDataURL('image/jpeg', 0.96);
      }
    }

    // 3. Final fallback to current 2D viewfinder canvas
    if (!capturedDataUrl && viewfinderCanvasRef.current) {
      capturedDataUrl = viewfinderCanvasRef.current.toDataURL('image/jpeg', 0.95);
    }

    if (!capturedDataUrl) return;
    if (!keepCameraOpen) {
      stopCamera();
    }
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

  useEffect(() => {
    const resolvedRate = getElectricRateForPeriod(
      { defaultElectricRate: globalElectricRate, monthlyElectricRates },
      billingPeriod
    );
    setMonthlyElectricRate(String(resolvedRate || 15.0));
  }, [billingPeriod, globalElectricRate, monthlyElectricRates, isOpen]);

  // Keep chargeable rent synced with monthly proration whenever room, billing period, or occupancy dates change
  useEffect(() => {
    if (!isOpen || !selectedRoom || isCustomRentOverride) return;
    const monthKey = normalizeBillingMonthKey(billingPeriod);
    const summary = calculateMonthlyRentSummary({
      monthlyRent: selectedRoom.monthlyRent || 0,
      billingPeriod: monthKey,
      occupancyStartDate: occupancyStartDate || undefined,
      occupancyEndDate: occupancyEndDate || undefined,
      latePenaltyConfig,
    });
    setBaseRent(String(summary.chargeableRent));
  }, [
    isOpen,
    selectedRoom?.id,
    selectedRoom?.monthlyRent,
    billingPeriod,
    occupancyStartDate,
    occupancyEndDate,
    isCustomRentOverride,
    latePenaltyConfig,
  ]);

  if (!isOpen || !selectedRoom) return null;

  const billingMonthKey = normalizeBillingMonthKey(billingPeriod);
  const billingSchedule = getBillingMonthSchedule(billingMonthKey);
  const rentSummary = calculateMonthlyRentSummary({
    monthlyRent: selectedRoom.monthlyRent || 0,
    billingPeriod: billingMonthKey,
    occupancyStartDate: occupancyStartDate || undefined,
    occupancyEndDate: occupancyEndDate || undefined,
    latePenaltyConfig,
  });

  // Duplicate active bill check for (roomId, billingMonthKey)
  const existingPeriodBill = existingBills.find(
    (b) =>
      b.roomId === selectedRoom.id &&
      !b.isArchived &&
      normalizeBillingMonthKey(b.billingMonthKey || b.billingPeriod) ===
        billingMonthKey
  );

  const prevTrimmed = prevReading.trim();
  const currTrimmed = currReading.trim();
  const prevParsed = prevTrimmed === '' ? null : Number(prevTrimmed);
  const currParsed = currTrimmed === '' ? null : Number(currTrimmed);
  const prevNum =
    prevParsed !== null && Number.isFinite(prevParsed) ? prevParsed : 0;
  const currNum =
    currParsed !== null && Number.isFinite(currParsed) ? currParsed : 0;
  const hasBothReadings =
    prevParsed !== null &&
    Number.isFinite(prevParsed) &&
    currParsed !== null &&
    Number.isFinite(currParsed);
  const rateNum = Math.max(0, Number(monthlyElectricRate) || 0);
  const rentNum = Math.max(0, Number(baseRent) || 0);
  const latePenaltyNum = rentSummary.latePenalty;
  const totalRentDue = roundCurrency(rentNum + latePenaltyNum);
  const carryNum = Math.max(0, Number(carryOverBalance) || 0);
  const isReset = rolloverType === 'meter_reset';
  const isRolloverActive = isRollover && hasBothReadings && currNum < prevNum;

  const subMeterCheck = calculateSubMeterDifference({
    prevReading: prevNum,
    currReading: currNum,
    electricRate: rateNum,
    isRollover: isRolloverActive && !isReset,
    dialDigits,
    isReset: isRolloverActive && isReset,
  });

  const meterReadingValidation = validateMonthlyMeterReading({
    roomId: selectedRoom.id,
    roomName: selectedRoom.name,
    tenantName: selectedRoom.tenant?.fullName,
    billingPeriod,
    previousReadingKwh: prevParsed,
    currentReadingKwh: currParsed,
    electricRate: rateNum,
    isVerified: isCurrentReadingVerified,
    meterResetOrReplacement: isRolloverActive,
    meterResetType: rolloverType,
    meterResetDocumentedReason: meterResetReason,
    dialDigits,
    existingMonthlyReadings: monthlyReadings.filter(
      (r) => r.id !== savedMonthlyReadingId
    ),
    editingReadingId: savedMonthlyReadingId || undefined,
  });

  const isNegativeWithoutDoc =
    hasBothReadings &&
    currNum < prevNum &&
    (!isRollover || !meterResetReason.trim());

  const grossBeforeCredit = roundCurrency(
    Math.max(0, rentNum) +
      latePenaltyNum +
      (hasBothReadings && subMeterCheck.isValid ? subMeterCheck.electricTotal : 0) +
      Math.max(0, carryNum)
  );
  const availablePaidDeposit = Math.max(0, selectedRoom.securityDepositPaid || 0);
  const reqDepUsedNum = roundCurrency(
    Math.min(
      availablePaidDeposit,
      Math.max(0, parseFloat(reqDepositApplied) || 0),
      grossBeforeCredit
    )
  );
  const remainingDepositAfterBill = Math.max(
    0,
    roundCurrency(availablePaidDeposit - reqDepUsedNum)
  );

  const availableAdvance = Math.max(0, selectedRoom.advanceRent || 0);
  const advUsedNum = roundCurrency(
    Math.min(
      availableAdvance,
      Math.max(0, parseFloat(depositApplied) || 0),
      Math.max(0, grossBeforeCredit - reqDepUsedNum)
    )
  );
  const depNum = roundCurrency(reqDepUsedNum + advUsedNum);

  const billBreakdown = calculateBillBreakdown({
    baseRent: rentNum,
    latePenalty: latePenaltyNum,
    prevReading: prevNum,
    currReading: hasBothReadings ? currNum : prevNum,
    electricRate: rateNum,
    previousBalanceCarryOver: carryNum,
    depositApplied: depNum,
    isRollover: isRolloverActive && !isReset,
    dialDigits,
    isReset: isRolloverActive && isReset,
  });

  const computedDueDateIso = billingSchedule.paymentDueDate;
  const computedDueDateLabel = billingSchedule.dueDateLabel;

  const canVerifyCurrentReading =
    hasBothReadings &&
    subMeterCheck.isValid &&
    !isNegativeWithoutDoc &&
    (ocrExtractedCurrKwh !== null || pinAuthorizedCorrection || Boolean(currMeterSnapshotUrl));

  const buildVerifiedMonthlyReadingPayload = (
    billId?: string
  ): MonthlyMeterReading => {
    const nowIso = new Date().toISOString();
    const readingId =
      savedMonthlyReadingId || `mread-${selectedRoom.id}-${billingMonthKey}`;
    const wasCorrectedFromOcr =
      ocrExtractedCurrKwh !== null &&
      Math.abs(ocrExtractedCurrKwh - currNum) > 0.001;
    const source: MonthlyMeterReading['source'] =
      ocrExtractedCurrKwh !== null
        ? wasCorrectedFromOcr
          ? 'ocr_corrected'
          : 'ocr_verified'
        : 'manual_authorized';

    return {
      id: readingId,
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      tenantName: selectedRoom.tenant?.fullName,
      billingPeriod,
      billingMonthKey,
      previousReadingKwh: prevNum,
      currentReadingKwh: currNum,
      consumptionKwh: billBreakdown.consumptionKwh,
      electricRate: rateNum,
      electricCharge: billBreakdown.electricTotal,
      source,
      ocrExtractedReadingKwh: ocrExtractedCurrKwh,
      ocrConfidence: ocrConfidence ?? undefined,
      isVerified: true,
      verifiedAt: verifiedAtIso || nowIso,
      correctionAuthorized: wasCorrectedFromOcr || pinAuthorizedCorrection,
      correctionNote: correctionNote.trim() || undefined,
      meterResetOrReplacement: isRolloverActive || undefined,
      meterResetType: isRolloverActive ? rolloverType : undefined,
      meterResetDocumentedReason: isRolloverActive
        ? meterResetReason.trim()
        : undefined,
      dialDigits: isRolloverActive ? dialDigits : undefined,
      prevPhotoDataUrl:
        prevMeterSnapshotUrl || generateSimulatedSubMeterDataUrl(prevNum),
      prevCropDataUrl:
        prevMeterCropUrl || generateSimulatedValueCropDataUrl(prevNum),
      currPhotoDataUrl:
        currMeterSnapshotUrl || generateSimulatedSubMeterDataUrl(currNum),
      currCropDataUrl:
        currMeterCropUrl || generateSimulatedValueCropDataUrl(currNum),
      billId,
      createdAt: verifiedAtIso || nowIso,
      updatedAt: nowIso,
    };
  };

  const handleConfirmVerifyReading = () => {
    if (!hasBothReadings) {
      setOcrStatusMsg(
        'Enter or scan both Previous and Current sub-meter readings before verifying.'
      );
      return;
    }
    if (isNegativeWithoutDoc) {
      setOcrStatusMsg(
        'Negative consumption is rejected unless Rollover/Reset override is enabled with a documented reason.'
      );
      return;
    }
    if (!canVerifyCurrentReading) {
      setPinError(null);
      setPinInput('');
      setShowPinUnlockModal(true);
      setOcrStatusMsg(
        'Upload/capture a meter photo for OCR OR unlock with your Landlord PIN to authorize a verified manual reading.'
      );
      return;
    }
    const nowIso = new Date().toISOString();
    setIsCurrentReadingVerified(true);
    setVerifiedAtIso(nowIso);
    setIsReadingsLocked(true);
    setOcrStatusMsg(
      `Verified ${billingPeriod} sub-meter reading: ${formatKwhReading(prevNum)} -> ${formatKwhReading(currNum)} kWh (${formatKwhReading(billBreakdown.consumptionKwh)} kWh x ${formatPeso(rateNum)} = ${formatPeso(billBreakdown.electricTotal)}).`
    );
  };

  const handleSaveVerifiedMonthlyReadingOnly = () => {
    if (!isCurrentReadingVerified) {
      handleConfirmVerifyReading();
    }
    const check = validateMonthlyMeterReading({
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      tenantName: selectedRoom.tenant?.fullName,
      billingPeriod,
      previousReadingKwh: prevParsed,
      currentReadingKwh: currParsed,
      electricRate: rateNum,
      isVerified: true,
      meterResetOrReplacement: isRolloverActive,
      meterResetType: rolloverType,
      meterResetDocumentedReason: meterResetReason,
      dialDigits,
      existingMonthlyReadings: monthlyReadings.filter(
        (r) => r.id !== savedMonthlyReadingId
      ),
      editingReadingId: savedMonthlyReadingId || undefined,
    });
    if (!check.isValid) {
      setOcrStatusMsg(check.errorMessage || 'Cannot save monthly meter reading.');
      return;
    }
    const payload = buildVerifiedMonthlyReadingPayload();
    const res = onSaveVerifiedReading?.(payload);
    if (res && !res.ok) {
      setOcrStatusMsg(res.error || 'Could not save verified reading.');
      return;
    }
    setSavedMonthlyReadingId(payload.id);
    setIsCurrentReadingVerified(true);
    setVerifiedAtIso(payload.verifiedAt);
    setOcrStatusMsg(
      `Saved verified reading for ${selectedRoom.name} (${billingPeriod}): ${formatKwhReading(payload.consumptionKwh)} kWh (${formatPeso(payload.electricCharge)}).`
    );
  };

  const canGenerateMonthlyBill =
    selectedRoom.status === 'occupied' &&
    !existingPeriodBill &&
    hasBothReadings &&
    subMeterCheck.isValid &&
    isCurrentReadingVerified &&
    meterReadingValidation.isValid;

  const handleConfirmGenerateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGenerateMonthlyBill || isSubmittingBillRef.current) return;
    isSubmittingBillRef.current = true;

    try {
      const nowIso = new Date().toISOString();
      const totalDue = billBreakdown.totalAmountDue;
      const remainingAdvAfterDeduction = fromCentavos(
        Math.max(0, toCentavos(availableAdvance) - toCentavos(advUsedNum))
      );
      const allowance = getAdvancePolicyAllowance(
        selectedRoom.monthlyRent,
        remainingAdvAfterDeduction,
        advanceCapMode
      );
      const maxPayableWithPolicy = allowance.isCapped
        ? roundCurrency(totalDue + allowance.remainingAllowance)
        : Number.POSITIVE_INFINITY;

      let paidAmount = 0;
      const effectiveAllocTarget: PaymentAllocationTarget =
        initialPayStatus === 'partial' ? initialAllocationTarget : 'auto';

      if (initialPayStatus === 'paid') {
        const customEntered = parseFloat(initialAmountPaid) || 0;
        const requestedPaid = customEntered >= totalDue ? customEntered : totalDue;
        paidAmount = Math.min(requestedPaid, maxPayableWithPolicy);
      } else if (initialPayStatus === 'partial') {
        paidAmount = Math.min(
          Math.max(0, parseFloat(initialAmountPaid) || 0),
          maxPayableWithPolicy
        );
      }

      const overpaymentAddedToAdvance =
        effectiveAllocTarget === 'auto' &&
        toCentavos(paidAmount) > toCentavos(totalDue)
          ? fromCentavos(toCentavos(paidAmount) - toCentavos(totalDue))
          : 0;

      const remainingBalance = Math.max(
        0,
        fromCentavos(toCentavos(totalDue) - toCentavos(paidAmount))
      );
      const finalStatus: 'paid' | 'partial' | 'unpaid' =
        toCentavos(remainingBalance) === 0
          ? 'paid'
          : toCentavos(paidAmount) > 0
            ? 'partial'
            : 'unpaid';

      const receiptCode = `4R-${billingMonthKey.replace('-', '')}-${
        selectedRoom.name.replace(/\D/g, '') || '101'
      }`;

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

      const verifiedReadingPayload = buildVerifiedMonthlyReadingPayload(billId);

      const notesParts: string[] = [];
      if (isRolloverActive) {
        notesParts.push(
          isReset
            ? `[Meter Reset Baseline Verified] ${meterResetReason.trim()}. Current: ${formatKwhReading(currNum)} kWh, Delta: ${formatKwhReading(billBreakdown.consumptionKwh)} kWh.`
            : `[Dial Rollover Verified] ${meterResetReason.trim()} (${dialDigits}-digit dial). Prev: ${formatKwhReading(prevNum)} kWh, Curr: ${formatKwhReading(currNum)} kWh, Delta: ${formatKwhReading(billBreakdown.consumptionKwh)} kWh.`
        );
      }
      if (correctionNote.trim()) {
        notesParts.push(`[OCR Correction Note] ${correctionNote.trim()}`);
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
        billingMonthKey,
        createdAt: nowIso,
        dueDate: new Date(`${computedDueDateIso}T12:00:00`).toISOString(),
        paymentWindowLabel: `Payment Period: ${billingSchedule.paymentPeriodLabel} (Late Charges start ${billingSchedule.lateStartLabel})`,
        prevReading: prevNum,
        currReading: currNum,
        consumptionKwh: billBreakdown.consumptionKwh,
        electricRate: rateNum,
        electricTotal: billBreakdown.electricTotal,
        electricityVerified: true,
        meterReadingId: verifiedReadingPayload.id,
        prevMeterPhotoDataUrl: finalPrevPhoto,
        meterPhotoDataUrl: finalCurrPhoto,
        prevMeterCropDataUrl: finalPrevCrop,
        currMeterCropDataUrl: finalCurrCrop,
        ocrConfidence: ocrConfidence ?? undefined,
        baseRent: rentNum,
        monthlyRentFull: rentSummary.monthlyRent,
        isProrated: !isCustomRentOverride && rentSummary.isProrated,
        occupiedDays: rentSummary.occupiedDays,
        daysInBillingMonth: rentSummary.daysInMonth,
        dailyRentRate: rentSummary.dailyRate,
        occupancyStartDate: occupancyStartDate || undefined,
        occupancyEndDate: occupancyEndDate || undefined,
        latePenalty: latePenaltyNum,
        latePenaltyLabel: rentSummary.latePenaltyLabel,
        daysPastDue: rentSummary.daysPastDue,
        totalRentDue,
        grossCharges: billBreakdown.grossTotal,
        securityDepositRequired: selectedRoom.securityDeposit || rentSummary.monthlyRent,
        securityDepositApplied: reqDepUsedNum,
        securityDepositRemainingAfterBill: remainingDepositAfterBill,
        advanceApplied: advUsedNum,
        previousBalanceCarryOver: carryNum,
        depositApplied: depNum,
        totalAmountDue: totalDue,
        amountPaid: paidAmount,
        overpaymentToAdvance: overpaymentAddedToAdvance,
        remainingBalance,
        status: finalStatus,
        idempotencyKey: billSessionKey || billId,
        paymentMethod: paidAmount > 0 ? paymentMethod : undefined,
        paidAt: finalStatus === 'paid' ? nowIso : undefined,
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
                  allocationTarget: effectiveAllocTarget,
                  note:
                    overpaymentAddedToAdvance > 0
                      ? `Paid ${formatPeso(paidAmount)} (Excess ${formatPeso(
                          overpaymentAddedToAdvance
                        )} credited to Advance)`
                      : finalStatus === 'paid'
                      ? 'Full payment upon billing'
                      : effectiveAllocTarget === 'rent'
                      ? 'Initial Rent-only payment (Electricity balance remains unpaid)'
                      : effectiveAllocTarget === 'electricity'
                      ? 'Initial Electricity-only payment'
                      : 'Initial partial payment',
                },
              ]
            : [],
        notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
        updatedAt: nowIso,
      };

      const generated = await onGenerateBill(newBill, {
        meterReading: verifiedReadingPayload,
        initialAllocationTarget: effectiveAllocTarget,
      });
      if (generated !== false) {
        onClose();
      }
    } finally {
      isSubmittingBillRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-5xl rounded-3xl bg-[#141A25] border border-[#263147] shadow-2xl overflow-hidden my-auto max-h-[94dvh] flex flex-col animate-modal-pop">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#192130] border-b border-[#263147] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Sub-Meter Scanner &amp; Bill
              </h2>
              <p className="text-xs text-slate-400">
                Cyclometer &amp; digital kWh reader • Rate: {formatPeso(rateNum)}/kWh
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
          onKeyDown={(e) => {
            // Prevent accidental Enter key submission while modifying readings or PIN
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
              const inputEl = e.target as HTMLInputElement;
              if (inputEl.type === 'password') {
                e.preventDefault();
                e.stopPropagation();
                handleVerifyPinToUnlock();
                return;
              }
              e.preventDefault();
            }
          }}
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
                      {formatPrimaryRoomLabel(r)}
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
                <span className="text-[10px] text-slate-400 mt-1">
                  Active month &amp; past 5 cycles (locked against future months)
                </span>
              </div>

              <div className="flex flex-col">
                <label className="block text-xs font-bold text-amber-400 mb-1">
                  Payment Schedule (1st-10th)
                </label>
                <div
                  className={`w-full min-h-10 rounded-xl bg-[#0D1119] border px-3 py-2 text-xs flex flex-col justify-center ${
                    billingSchedule.isPastDue
                      ? 'border-red-500/50 text-red-300'
                      : 'border-amber-500/40 text-amber-300'
                  }`}
                >
                  <span className="font-bold leading-tight">
                    Due: {computedDueDateLabel}
                  </span>
                  <span className="text-[10px] text-slate-400 leading-tight mt-0.5">
                    {billingSchedule.isPastDue
                      ? `Late period (${billingSchedule.daysPastDue}d past 10th)`
                      : 'Window: 1st to 10th (Late from 11th)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Duplicate Monthly Bill Guard Banner */}
            {existingPeriodBill && (
              <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/40 text-left space-y-2 animate-card-in">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-xs font-bold text-red-300 block">
                        Duplicate Billing Period Blocked ({billingPeriod})
                      </strong>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        Receipt #{existingPeriodBill.receiptNo} already exists for {selectedRoom.name} ({billingPeriod}). Record payments on the existing bill instead of creating a duplicate.
                      </p>
                    </div>
                  </div>
                  {onOpenExistingReceipt && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenExistingReceipt(existingPeriodBill);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-[11px] font-bold text-red-200 shrink-0 cursor-pointer"
                    >
                      Open Receipt
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Dedicated Selected Room Information Panel */}
            {selectedRoomInfo && (
              <div className="rounded-2xl bg-[#0D1119] border border-[#243047] p-3 sm:p-3.5 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                    Tenant
                  </span>
                  <span className="font-bold text-white truncate block mt-0.5">
                    {selectedRoomInfo.tenantName}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                    Stored Meter Reading
                  </span>
                  <span className="font-extrabold text-amber-400 font-mono-num block mt-0.5">
                    {selectedRoomInfo.storedReadingFormatted} kWh
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                    Advance Credit Available
                  </span>
                  <span className="font-extrabold text-emerald-400 font-mono-num block mt-0.5">
                    {formatPeso(selectedRoomInfo.advanceCredit)}
                  </span>
                </div>
              </div>
            )}

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
                {[
                  {
                    slot: 'prev' as const,
                    title: '1. Previous Sub-Meter',
                    lightboxLabel: 'Previous',
                    altLabel: 'Previous',
                    readingNum: prevNum,
                    snapshotUrl: prevMeterSnapshotUrl,
                    cropUrl: prevMeterCropUrl,
                    selectedBorder: 'bg-amber-500/15 border-amber-500 text-white',
                    cropBorder: 'border-emerald-500/50',
                    badgeClass: 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/30',
                    emptyBorder: 'border-slate-700 text-slate-400 hover:text-amber-300',
                  },
                  {
                    slot: 'curr' as const,
                    title: '2. Current Sub-Meter',
                    lightboxLabel: 'Current',
                    altLabel: 'Current',
                    readingNum: currNum,
                    snapshotUrl: currMeterSnapshotUrl,
                    cropUrl: currMeterCropUrl,
                    selectedBorder:
                      'bg-amber-500/15 border-amber-500 text-white ring-1 ring-amber-500/50',
                    cropBorder: 'border-amber-500/50',
                    badgeClass: 'bg-amber-950/90 text-amber-300 border border-amber-500/30',
                    emptyBorder: 'border-amber-500/40 text-amber-300 hover:text-amber-200',
                  },
                ].map((slotCfg) => (
                  <div
                    key={slotCfg.slot}
                    onClick={() => {
                      setTargetMeterSlot(slotCfg.slot);
                      if (!slotCfg.snapshotUrl) {
                        fileInputRef.current?.click();
                      }
                    }}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer relative ${
                      targetMeterSlot === slotCfg.slot
                        ? slotCfg.selectedBorder
                        : 'bg-[#0D1119] border-[#252F42] text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold mb-1 gap-1">
                      <span className="truncate">{slotCfg.title}</span>
                      <span className="font-mono-num text-amber-400 shrink-0">
                        {slotCfg.readingNum.toFixed(1)} kWh
                      </span>
                    </div>
                    {slotCfg.snapshotUrl ? (
                      <div className="space-y-1">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            openLightbox(
                              slotCfg.snapshotUrl,
                              `${slotCfg.lightboxLabel} Sub-Meter Proof | ${formatPrimaryRoomLabel(selectedRoom)}`,
                              slotCfg.cropUrl,
                              `${formatKwhReading(slotCfg.readingNum)} kWh`
                            );
                          }}
                          className="relative group cursor-zoom-in"
                          title="Click to inspect full-resolution 1:1 photo"
                        >
                          <img
                            src={slotCfg.snapshotUrl}
                            alt={`${slotCfg.altLabel} Meter`}
                            className="h-28 sm:h-36 w-full object-contain rounded-lg bg-[#090C12] border border-slate-700/60 group-hover:border-amber-400 transition"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold text-amber-300 transition">
                            <ZoomIn className="w-4 h-4" />
                            <span>100% Lossless Inspect</span>
                          </div>
                        </div>
                        {slotCfg.cropUrl && (
                          <div className={`rounded-lg border ${slotCfg.cropBorder} bg-[#090C12] overflow-hidden`}>
                            <img
                              src={slotCfg.cropUrl}
                              alt={`${slotCfg.altLabel} Value Crop`}
                              className="h-12 sm:h-14 w-full object-contain"
                            />
                            <div className="flex items-center justify-end px-1.5 py-0.5 border-t border-slate-800/80">
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${slotCfg.badgeClass}`}>
                                HD Crop
                              </span>
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTargetMeterSlot(slotCfg.slot);
                            fileInputRef.current?.click();
                          }}
                          className="w-full text-center text-[10px] text-amber-400/90 hover:text-amber-300 py-0.5"
                        >
                          Change Photo
                        </button>
                      </div>
                    ) : (
                      <div className={`h-16 w-full rounded-lg bg-[#090C12] border border-dashed flex flex-col items-center justify-center text-[10px] transition ${slotCfg.emptyBorder}`}>
                        <ImagePlus className="w-3.5 h-3.5 mb-0.5" />
                        <span>Tap to attach photo</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Mode Tabs / Platform Selection */}
              {!isMobileApp ? (
                <div className="flex items-center justify-between p-2.5 mb-2.5 rounded-xl bg-[#0E131C] border border-[#252F42] text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Upload className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-bold">Desktop / Web Mode • Image Upload Only</span>
                  </div>
                  <span className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/20 font-semibold hidden sm:inline">
                    Live camera in Mobile App
                  </span>
                </div>
              ) : (
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
                    <span>Snapshot Camera</span>
                  </button>
                </div>
              )}

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

                {isMobileApp && scanTab === 'camera' ? (
                  isCameraActive ? (
                    <div className="relative w-full space-y-2.5">
                      {/* Steady 16:9 Landscape Canvas Snapshot Viewfinder (no <video> layer in modal = zero flicker) */}
                      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-amber-500/40">
                        <canvas
                          ref={viewfinderCanvasRef}
                          width={800}
                          height={450}
                          className="w-full h-full object-cover block"
                        />
                        <div className="absolute top-2 left-2 z-10 pointer-events-none px-2 py-0.5 rounded-md bg-slate-950/85 border border-amber-500/40 text-[9px] font-extrabold uppercase tracking-wider text-amber-300">
                          Landscape 16:9
                        </div>

                        {/* Brief Still-Capture Shutter Cue */}
                        {showShutterFlash && (
                          <div className="absolute inset-0 bg-white/75 pointer-events-none" />
                        )}

                        {/* Snapshot Guide Box */}
                        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-3">
                          <div
                            className={`w-11/12 max-w-[340px] h-24 border-2 rounded-xl relative flex items-center justify-center transition-colors duration-200 ${
                              isRegisterLocked
                                ? 'border-emerald-400 bg-emerald-500/10'
                                : 'border-dashed border-amber-400 bg-black/20'
                            }`}
                          >
                            <span
                              className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded shadow border flex items-center gap-1.5 ${
                                isRegisterLocked
                                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                                  : 'bg-slate-950/85 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {isRegisterLocked ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>✓ Meter Detected • Ready to Screenshot</span>
                                </>
                              ) : (
                                <span>Frame 5 Black + 1 Red Sub-Meter Drums</span>
                              )}
                            </span>
                            <div
                              className={`absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 ${
                                isRegisterLocked ? 'border-emerald-400' : 'border-amber-400'
                              }`}
                            />
                            <div
                              className={`absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 ${
                                isRegisterLocked ? 'border-emerald-400' : 'border-amber-400'
                              }`}
                            />
                            <div
                              className={`absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 ${
                                isRegisterLocked ? 'border-emerald-400' : 'border-amber-400'
                              }`}
                            />
                            <div
                              className={`absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 ${
                                isRegisterLocked ? 'border-emerald-400' : 'border-amber-400'
                              }`}
                            />
                          </div>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded mt-2 ${
                              isRegisterLocked
                                ? 'bg-emerald-950/85 text-emerald-300 font-semibold'
                                : 'bg-slate-950/75 text-slate-300'
                            }`}
                          >
                            {isRegisterLocked
                              ? autoSnapEnabled
                                ? 'Auto-Snap armed • Holding steady captures photo'
                                : 'Tap Screenshot below to collect image'
                              : 'Zero-video still viewfinder • Hold steady on kWh dial'}
                          </span>
                        </div>
                      </div>

                      {/* Primary Snapshot Capture Button + Compact 3-Column Utility Row */}
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => void captureHighResSnapshotAndScan(true)}
                          disabled={isOcrRunning}
                          className={`w-full py-2.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-lg transition-colors active:scale-95 ${
                            isRegisterLocked
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/25'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                          }`}
                        >
                          {isOcrRunning ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Analyzing Screenshot...</span>
                            </>
                          ) : (
                            <>
                              <Camera className="w-4 h-4" />
                              <span>
                                {isRegisterLocked ? '✓ Take Meter Screenshot → ' : 'Take Screenshot → '}
                                {targetMeterSlot === 'prev' ? 'Slot #1 (Prev)' : 'Slot #2 (Curr)'}
                              </span>
                            </>
                          )}
                        </button>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <button
                            type="button"
                            onClick={() => setAutoSnapEnabled((prev) => !prev)}
                            className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center cursor-pointer transition whitespace-nowrap ${
                              autoSnapEnabled
                                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                                : 'bg-[#141A25] border-[#28364F] text-slate-300 hover:text-white'
                            }`}
                            title="Automatically take a snapshot once sub-meter locks steady"
                          >
                            Auto-Snap: {autoSnapEnabled ? 'ON' : 'OFF'}
                          </button>

                          <button
                            type="button"
                            onClick={() => void toggleLandscapeOrientationLock()}
                            className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition whitespace-nowrap ${
                              isLandscapeLocked
                                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                                : 'bg-[#141A25] border-[#28364F] text-slate-300 hover:text-white'
                            }`}
                            title="Rotate screen to landscape mode on supported mobile devices"
                          >
                            <RotateCw className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{isLandscapeLocked ? 'Unlock View' : 'Landscape'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => nativeCameraInputRef.current?.click()}
                            className="py-2 px-2 rounded-xl bg-[#1B2333] hover:bg-[#25324A] border border-[#28364F] text-slate-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition whitespace-nowrap"
                            title="Open device native camera app"
                          >
                            <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>Phone Cam</span>
                          </button>

                          <button
                            type="button"
                            onClick={stopCamera}
                            className="py-2 px-2 rounded-xl bg-[#141A25] hover:bg-[#1E2738] border border-slate-700 text-slate-400 hover:text-white text-[11px] font-bold flex items-center justify-center cursor-pointer transition"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-2">
                        <Camera className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-white">
                        Snapshot Camera |{' '}
                        {targetMeterSlot === 'prev'
                          ? 'Slot #1 (Previous)'
                          : 'Slot #2 (Current)'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
                        Non-flickering viewfinder collects clear meter screenshots for Slot #1 &amp; Slot #2.
                      </p>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 mt-3.5 max-w-sm mx-auto">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 transition active:scale-95"
                          title="Open zero-flicker snapshot viewfinder"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Open Snapshot Camera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => nativeCameraInputRef.current?.click()}
                          className="px-3.5 py-2.5 rounded-xl bg-[#182132] hover:bg-[#202C42] border border-[#28364F] text-slate-200 font-bold text-xs inline-flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                          title="Open phone native camera app to take a photo"
                        >
                          <Camera className="w-3.5 h-3.5 text-amber-400" />
                          <span>Phone Camera App</span>
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
                                Camera permission is needed to take sub-meter screenshots.
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                            <button
                              type="button"
                              onClick={startCamera}
                              className="py-2 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow transition"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Allow &amp; Retry</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => nativeCameraInputRef.current?.click()}
                              className="py-2 px-2.5 rounded-lg bg-[#182132] hover:bg-[#202C42] border border-[#28364F] text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
                            >
                              <Camera className="w-3.5 h-3.5 text-amber-400" />
                              <span>Phone Cam</span>
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
                              title="Open App Settings > Permissions to allow Camera"
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

                {/* Collected Screenshots Tray */}
                {collectedSnapshots.length > 0 && (
                  <div className="w-full mt-3 pt-3 border-t border-[#1E2638] space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-200">
                        Collected Meter Snapshots ({collectedSnapshots.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setCollectedSnapshots([])}
                        className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {collectedSnapshots.map((snap) => (
                        <div
                          key={snap.id}
                          className={`rounded-xl border p-1.5 bg-[#0E131D] flex flex-col gap-1.5 ${
                            snap.isAuthentic
                              ? 'border-emerald-500/40'
                              : 'border-red-500/40 opacity-85'
                          }`}
                        >
                          <div className="relative h-14 rounded-lg overflow-hidden bg-black">
                            <img
                              src={snap.dataUrl}
                              alt="Collected meter snapshot"
                              className="w-full h-full object-cover"
                            />
                            <span
                              className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                snap.isAuthentic
                                  ? 'bg-emerald-950/90 text-emerald-300'
                                  : 'bg-red-950/90 text-red-300'
                              }`}
                            >
                              {snap.statusLabel}
                            </span>
                          </div>
                          {snap.isAuthentic ? (
                            <div className="grid grid-cols-2 gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  void runOcrOnDataUrl(snap.dataUrl, 'prev', snap.id)
                                }
                                className="py-1 rounded bg-[#182132] hover:bg-amber-500 hover:text-slate-950 text-[10px] font-bold text-slate-200 cursor-pointer transition"
                              >
                                Use #1
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void runOcrOnDataUrl(snap.dataUrl, 'curr', snap.id)
                                }
                                className="py-1 rounded bg-[#182132] hover:bg-amber-500 hover:text-slate-950 text-[10px] font-bold text-slate-200 cursor-pointer transition"
                              >
                                Use #2
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setCollectedSnapshots((prev) =>
                                  prev.filter((item) => item.id !== snap.id)
                                )
                              }
                              className="py-1 rounded bg-red-950/50 hover:bg-red-900/60 text-[10px] font-bold text-red-300 cursor-pointer transition"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      ))}
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
                        <span className="text-[10px] text-slate-400">Enter your 4-digit Landlord Security PIN</span>
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className={`rounded-xl border p-3 transition ${
                  isReadingsLocked
                    ? 'bg-[#0D1119]/80 border-[#1E2738] opacity-90'
                    : 'bg-[#0D1119] border-[#252F42]'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      1. Previous (kWh)
                    </label>
                    {isReadingsLocked && (
                      <Lock className="w-3 h-3 text-slate-500 shrink-0" />
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={prevReading}
                    readOnly={isReadingsLocked}
                    onClick={() => {
                      if (isReadingsLocked) {
                        setPinError(null);
                        setPinInput('');
                        setShowPinUnlockModal(true);
                      }
                    }}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '');
                      if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                      setPrevReading(raw);
                      setIsCurrentReadingVerified(false);
                    }}
                    className={`mt-1 w-full bg-transparent text-base font-extrabold font-mono-num focus:outline-none ${
                      isReadingsLocked
                        ? 'text-slate-400 cursor-pointer'
                        : 'text-slate-200'
                    }`}
                  />
                </div>

                <div className={`rounded-xl border-2 p-3 transition ${
                  isCurrentReadingVerified
                    ? 'bg-emerald-950/25 border-emerald-500/70'
                    : isReadingsLocked
                    ? 'bg-[#15140F] border-amber-500/40'
                    : 'bg-[#1A1812] border-amber-500/80 ring-1 ring-amber-500/50'
                }`}>
                  <div className="flex items-center justify-between gap-1.5">
                    <label className="block text-[11px] font-bold text-amber-400 truncate">
                      2. Current (kWh) *
                    </label>
                    {isCurrentReadingVerified ? (
                      <span className="text-[10px] text-emerald-400 font-bold inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Verified</span>
                      </span>
                    ) : isReadingsLocked ? (
                      <span className="text-[10px] text-amber-400/90 font-semibold inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
                        <Lock className="w-3 h-3" />
                        <span>Locked</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-semibold shrink-0">Editable</span>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Scan or enter kWh"
                    value={currReading}
                    readOnly={isReadingsLocked}
                    onClick={() => {
                      if (isReadingsLocked) {
                        setPinError(null);
                        setPinInput('');
                        setShowPinUnlockModal(true);
                      }
                    }}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '');
                      if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                      setCurrReading(raw);
                      setIsCurrentReadingVerified(false);
                      setVerifiedAtIso(null);
                    }}
                    className={`mt-1 w-full bg-transparent text-base font-extrabold font-mono-num focus:outline-none placeholder:text-slate-600 placeholder:text-xs ${
                      isCurrentReadingVerified
                        ? 'text-emerald-300'
                        : isReadingsLocked
                        ? 'text-amber-300 cursor-pointer'
                        : 'text-amber-400'
                    }`}
                  />
                </div>

                <div className="rounded-xl bg-[#0D1119] border border-amber-500/50 p-3">
                  <label className="block text-[11px] font-bold text-amber-400 truncate">
                    3. Rate ({billingPeriod}) *
                  </label>
                  <div className="flex items-center mt-1">
                    <span className="text-sm font-bold text-amber-400 mr-1">₱</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="12.50"
                      value={monthlyElectricRate}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '');
                        if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                        setMonthlyElectricRate(raw);
                      }}
                      className="w-full bg-transparent text-base font-extrabold text-amber-400 font-mono-num focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Mandatory OCR Sub-Meter Reading Verification Bar */}
              <div
                className={`mt-2.5 rounded-2xl border p-3 space-y-2.5 text-xs ${
                  isCurrentReadingVerified
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : 'bg-amber-500/10 border-amber-500/35'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isCurrentReadingVerified ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <div>
                      <span
                        className={`font-extrabold block ${
                          isCurrentReadingVerified
                            ? 'text-emerald-300'
                            : 'text-amber-300'
                        }`}
                      >
                        {isCurrentReadingVerified
                          ? `Verified Monthly Reading (${billingPeriod})`
                          : 'Mandatory Electricity Reading Verification Required'}
                      </span>
                      <span className="text-[11px] text-slate-300">
                        {!hasBothReadings
                          ? 'Upload/capture the sub-meter photo or unlock with PIN to enter the current reading.'
                          : ocrExtractedCurrKwh !== null
                          ? `OCR Extracted: ${formatKwhReading(ocrExtractedCurrKwh)} kWh | Current Value: ${formatKwhReading(currNum)} kWh | Consumption: ${formatKwhReading(billBreakdown.consumptionKwh)} kWh (${formatPeso(billBreakdown.electricTotal)})`
                          : `Prev ${formatKwhReading(prevNum)} kWh -> Curr ${formatKwhReading(currNum)} kWh | Consumption: ${formatKwhReading(billBreakdown.consumptionKwh)} kWh (${formatPeso(billBreakdown.electricTotal)})`}
                      </span>
                    </div>
                  </div>
                </div>

                {!isReadingsLocked && (
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 mb-1">
                      Authorized Correction Note (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Clarified glare on tenths red drum"
                      value={correctionNote}
                      onChange={(e) => setCorrectionNote(e.target.value)}
                      className="w-full h-8 rounded-lg bg-[#0D1119] border border-[#263248] px-2.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {!isCurrentReadingVerified ? (
                    <button
                      type="button"
                      onClick={handleConfirmVerifyReading}
                      disabled={!hasBothReadings || isNegativeWithoutDoc}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verify &amp; Confirm Reading</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCurrentReadingVerified(false);
                        setPinError(null);
                        setPinInput('');
                        setShowPinUnlockModal(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#161E2E] hover:bg-[#1E2940] border border-[#2B3A54] text-amber-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Correct Reading (PIN)</span>
                    </button>
                  )}

                  {onSaveVerifiedReading && (
                    <button
                      type="button"
                      onClick={handleSaveVerifiedMonthlyReadingOnly}
                      disabled={!hasBothReadings || isNegativeWithoutDoc || !canVerifyCurrentReading}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <FileCheck2 className="w-3.5 h-3.5" />
                      <span>
                        {savedMonthlyReadingId
                          ? 'Update Saved Reading'
                          : 'Save Verified Reading'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Negative Reading / Rollover Handling UI */}
              {hasBothReadings && currNum < prevNum && !isRollover && (
                <div className="mt-2.5 rounded-xl bg-red-500/15 border border-red-500/35 p-3 text-xs text-red-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-300">
                        Negative Consumption Rejected: Current ({formatKwhReading(currNum)} kWh) is lower than Previous ({formatKwhReading(prevNum)} kWh).
                      </p>
                      <p className="text-slate-300 mt-0.5">
                        Only enable override if an authorized meter replacement or dial rollover occurred (documented reason required).
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRollover(true);
                      setIsCurrentReadingVerified(false);
                    }}
                    className="w-full py-1.5 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <span>Document Authorized Meter Replacement / Rollover</span>
                  </button>
                </div>
              )}

              {hasBothReadings && currNum < prevNum && isRollover && (
                <div className="mt-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3 text-xs text-emerald-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Rollover / Meter Replacement Mode Enabled</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRollover(false);
                        setIsCurrentReadingVerified(false);
                      }}
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

                  <div>
                    <label className="block text-[11px] font-bold text-emerald-300 mb-1">
                      Documented Reset / Replacement Reason (Required) *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Replaced faulty sub-meter on Nov 4, 2026"
                      value={meterResetReason}
                      onChange={(e) => setMeterResetReason(e.target.value)}
                      className="w-full h-9 rounded-lg bg-[#0D1119] border border-emerald-500/40 px-3 text-xs text-white focus:border-emerald-400 focus:outline-none"
                    />
                  </div>

                  <div className="text-[11px] text-emerald-300/90 bg-emerald-950/40 rounded-lg p-2 font-mono-num">
                    Calculated Delta: <strong className="text-emerald-200">{formatKwhReading(billBreakdown.consumptionKwh)} kWh</strong>
                  </div>
                </div>
              )}

              {!subMeterCheck.isValid && hasBothReadings && currNum >= prevNum && (
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
                  Δ {formatKwhReading(billBreakdown.consumptionKwh)} kWh
                </span>
              </div>

              <div className="rounded-2xl bg-[#161D2B] border border-[#263248] p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Current Reading</span>
                  <span className="font-mono-num font-bold text-white">
                    {formatKwhReading(currNum)} kWh
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Less Previous Reading</span>
                  <span className="font-mono-num font-bold text-slate-300">
                    - {formatKwhReading(prevNum)} kWh
                  </span>
                </div>
                <div className="pt-1.5 border-t border-[#263248] flex justify-between text-amber-400 font-bold">
                  <span>Consumption × Rate</span>
                  <span className="font-mono-num">
                    {formatKwhReading(billBreakdown.consumptionKwh)} kWh × {formatPeso(rateNum)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-white pt-0.5">
                  <span>Electric Sub-Total</span>
                  <span className="font-mono-num text-amber-400">
                    {formatPeso(billBreakdown.electricTotal)}
                  </span>
                </div>
              </div>

              {/* Monthly Rent Proration & Occupancy Period */}
              <div className="rounded-2xl bg-[#161D2B] border border-[#263248] p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
                    Rent Proration &amp; Occupancy ({billingPeriod})
                  </span>
                  {rentSummary.isProrated && !isCustomRentOverride ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-[10px] font-bold text-amber-300">
                      Prorated ({rentSummary.occupiedDays}/{rentSummary.daysInMonth}d)
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">
                      {rentSummary.daysInMonth} days in month
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Move-In / Start Date
                    </label>
                    <input
                      type="date"
                      value={occupancyStartDate}
                      onChange={(e) => {
                        setOccupancyStartDate(e.target.value);
                        setIsCustomRentOverride(false);
                      }}
                      className="w-full h-8 rounded-lg bg-[#0D1119] border border-[#263248] px-2 text-[11px] text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      Move-Out / End Date (opt.)
                    </label>
                    <input
                      type="date"
                      value={occupancyEndDate}
                      onChange={(e) => {
                        setOccupancyEndDate(e.target.value);
                        setIsCustomRentOverride(false);
                      }}
                      className="w-full h-8 rounded-lg bg-[#0D1119] border border-[#263248] px-2 text-[11px] text-white"
                    />
                  </div>
                </div>
                {rentSummary.isProrated && !isCustomRentOverride && (
                  <p className="text-[10px] text-amber-300/90 font-mono-num">
                    {formatPeso(rentSummary.monthlyRent)} / {rentSummary.daysInMonth} days = {formatPeso(rentSummary.dailyRate)}/day x {rentSummary.occupiedDays} days = {formatPeso(rentSummary.proratedRent || rentSummary.chargeableRent)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-start">
                <div className="flex flex-col">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      {rentSummary.isProrated && !isCustomRentOverride
                        ? 'Prorated Rent (₱)'
                        : 'Monthly Rent (₱)'}
                    </label>
                    {isCustomRentOverride && (
                      <button
                        type="button"
                        onClick={() => setIsCustomRentOverride(false)}
                        className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                      >
                        Reset Auto
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={baseRent}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '');
                      if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                      setIsCustomRentOverride(true);
                      setBaseRent(raw);
                    }}
                    className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-3 text-xs font-bold text-white font-mono-num"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Prev Unpaid Carry-Over (₱)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={carryOverBalance}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '');
                      if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                      setCarryOverBalance(raw);
                    }}
                    className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-3 text-xs font-bold text-red-400 font-mono-num"
                  />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label className="block text-[11px] font-semibold text-emerald-400 leading-snug">
                      Req. Deposit Deducted ({formatPeso(availablePaidDeposit)} held)
                    </label>
                    {availablePaidDeposit > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setReqDepositApplied(
                            reqDepUsedNum > 0 ? '0' : String(availablePaidDeposit)
                          )
                        }
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 cursor-pointer shrink-0"
                      >
                        {reqDepUsedNum > 0 ? 'Hold (₱0)' : 'Apply Held'}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={reqDepositApplied}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '');
                      if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                      setReqDepositApplied(raw);
                    }}
                    className="w-full h-9 rounded-xl bg-[#161D2B] border border-emerald-500/40 px-3 text-xs font-bold text-emerald-400 font-mono-num"
                  />
                  {remainingDepositAfterBill > 0 && (
                    <span className="text-[10px] text-emerald-300 mt-1">
                      {formatPeso(remainingDepositAfterBill)} held safely on account
                    </span>
                  )}
                </div>
                <div className="flex flex-col">
                  <label className="block text-[11px] font-semibold text-emerald-400 mb-1 leading-snug">
                    Advance Balance Deducted ({formatPeso(availableAdvance)})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={depositApplied}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '');
                      if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                      setDepositApplied(raw);
                    }}
                    className="w-full h-9 rounded-xl bg-[#161D2B] border border-[#263248] px-3 text-xs font-bold text-emerald-400 font-mono-num"
                  />
                </div>
              </div>

              <div className="rounded-2xl bg-[#111724] border border-[#263248] p-3.5 space-y-2.5 text-xs">
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 mb-1.5">
                    1. Charges Breakdown (Rent Schedule + Electricity)
                  </div>
                  <div className="space-y-1 text-slate-300">
                    <div className="flex justify-between">
                      <span>Monthly Rent (Full Rate)</span>
                      <span className="font-mono-num font-bold text-slate-200">
                        {formatPeso(rentSummary.monthlyRent)}
                      </span>
                    </div>
                    {rentSummary.isProrated && !isCustomRentOverride && (
                      <div className="flex justify-between text-amber-300">
                        <span>
                          Prorated Rent ({rentSummary.occupiedDays}/{rentSummary.daysInMonth} days)
                        </span>
                        <span className="font-mono-num font-bold">
                          {formatPeso(rentNum)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-400">
                      <span>Payment Due Date (1st-10th Window)</span>
                      <span className="font-semibold text-slate-200">
                        {computedDueDateLabel}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className={latePenaltyNum > 0 ? 'text-red-300' : 'text-slate-400'}>
                        Late Charges
                        {rentSummary.latePenaltyLabel
                          ? ` (${rentSummary.latePenaltyLabel})`
                          : billingSchedule.isPastDue
                          ? ' (Not configured in Settings)'
                          : ' (Starts Day 11)'}
                      </span>
                      <span
                        className={`font-mono-num font-bold ${
                          latePenaltyNum > 0 ? 'text-red-300' : 'text-slate-400'
                        }`}
                      >
                        {formatPeso(latePenaltyNum)}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-white border-t border-[#1E293D] pt-1">
                      <span>Total Rent Due</span>
                      <span className="font-mono-num">{formatPeso(totalRentDue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        Electricity ({formatKwhReading(billBreakdown.consumptionKwh)} kWh x {formatPeso(rateNum)}/kWh)
                      </span>
                      <span className="font-mono-num font-bold text-amber-300">
                        {formatPeso(billBreakdown.electricTotal)}
                      </span>
                    </div>
                    {carryNum > 0 && (
                      <div className="flex justify-between text-red-300">
                        <span>Previous Unpaid Balance Carry-Over</span>
                        <span className="font-mono-num font-bold">
                          +{formatPeso(carryNum)}
                        </span>
                      </div>
                    )}
                    <div className="pt-1 border-t border-[#263248] flex justify-between font-extrabold text-white">
                      <span>Total Monthly Charges (Gross)</span>
                      <span className="font-mono-num">{formatPeso(grossBeforeCredit)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1E293D]">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 mb-1.5">
                    2. Credits &amp; Deductions Applied (What Reduces This Bill)
                  </div>
                  <div className="space-y-1 text-slate-300">
                    <div className="flex justify-between gap-2">
                      <div>
                        <span>Required Security Deposit Deducted</span>
                        <p className="text-[10px] text-slate-400">
                          {availablePaidDeposit > 0
                            ? `From ${formatPeso(availablePaidDeposit)} paid deposit (${formatPeso(remainingDepositAfterBill)} left after this bill)`
                            : 'No paid security deposit balance on account'}
                        </p>
                      </div>
                      <span className="font-mono-num font-bold text-emerald-300 shrink-0">
                        -{formatPeso(reqDepUsedNum)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <div>
                        <span>Advance Rent Credit Applied</span>
                        <p className="text-[10px] text-slate-400">
                          {availableAdvance > 0
                            ? `From ${formatPeso(availableAdvance)} advance credit (${formatPeso(Math.max(0, roundCurrency(availableAdvance - advUsedNum)))} left after this bill)`
                            : 'No advance payment credit on account'}
                        </p>
                      </div>
                      <span className="font-mono-num font-bold text-emerald-300 shrink-0">
                        -{formatPeso(advUsedNum)}
                      </span>
                    </div>
                    <div className="pt-1 border-t border-[#263248] flex justify-between font-extrabold text-emerald-300">
                      <span>Total Deductions Applied</span>
                      <span className="font-mono-num">-{formatPeso(depNum)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1E293D] text-[11px] text-slate-300">
                  <div className="flex items-center justify-between gap-2 font-semibold">
                    <span>Net Calculation:</span>
                    <span className="font-mono-num text-white">
                      {formatPeso(grossBeforeCredit)} - {formatPeso(depNum)} = {formatPeso(billBreakdown.totalAmountDue)}
                    </span>
                  </div>
                  {depNum > 0 && billBreakdown.totalAmountDue === 0 && (
                    <p className="text-[10px] text-emerald-300 mt-0.5">
                      Credits cover 100% of this month&apos;s charges. Zero cash payment is needed.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
                    Net Total Amount Due
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Due: {computedDueDateLabel} (1st-10th Window)
                  </span>
                </div>
                <div className="text-xl font-black text-white font-mono-num">
                  {formatPeso(billBreakdown.totalAmountDue)}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Initial Payment Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'unpaid', label: 'Unpaid' },
                      { id: 'partial', label: 'Partial / Split' },
                      { id: 'paid', label: 'Paid in Full' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setInitialPayStatus(opt.id);
                        if (opt.id === 'paid') {
                          setInitialAllocationTarget('auto');
                          setInitialAmountPaid(
                            String(billBreakdown.totalAmountDue)
                          );
                        } else if (opt.id === 'partial') {
                          setInitialAmountPaid(String(Math.min(rentNum, billBreakdown.totalAmountDue)));
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

                {initialPayStatus === 'partial' && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'auto', label: 'All Unpaid' },
                          { id: 'rent', label: 'Rent Only' },
                          { id: 'electricity', label: 'Electricity Only' },
                        ] as const
                      ).map((alloc) => (
                        <button
                          key={alloc.id}
                          type="button"
                          onClick={() => {
                            setInitialAllocationTarget(alloc.id);
                            if (alloc.id === 'rent') {
                              setInitialAmountPaid(
                                String(Math.min(rentNum, billBreakdown.totalAmountDue))
                              );
                            } else if (alloc.id === 'electricity') {
                              setInitialAmountPaid(
                                String(
                                  Math.min(
                                    billBreakdown.electricTotal,
                                    billBreakdown.totalAmountDue
                                  )
                                )
                              );
                            }
                          }}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border cursor-pointer transition ${
                            initialAllocationTarget === alloc.id
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                              : 'bg-[#0D1119] border-[#263248] text-slate-400'
                          }`}
                        >
                          {alloc.label}
                        </button>
                      ))}
                    </div>
                    {initialAllocationTarget === 'rent' &&
                      billBreakdown.electricTotal > 0 && (
                        <p className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                          Rent-only payment keeps Electricity ({formatPeso(billBreakdown.electricTotal)}) unpaid. This bill stays PARTIAL until electricity is also settled.
                        </p>
                      )}
                  </div>
                )}

                {initialPayStatus !== 'unpaid' && (
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">
                        {advanceCapMode === '1_month'
                          ? 'Amount Paid (₱ • Max 1-Mo Adv)'
                          : 'Cash / Transfer Received (₱)'}
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={initialAmountPaid}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/,/g, '');
                          if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                          setInitialAmountPaid(raw);
                        }}
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

            {selectedRoom.status === 'occupied' && !canGenerateMonthlyBill && (
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs text-amber-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>
                  {existingPeriodBill
                    ? `Bill already exists for ${billingPeriod} (Receipt #${existingPeriodBill.receiptNo}).`
                    : !hasBothReadings
                    ? 'Mandatory Electricity Billing: Scan or enter both Previous and Current kWh readings to generate this bill.'
                    : isNegativeWithoutDoc
                    ? 'Action Blocked: Negative consumption requires Rollover/Reset override with a documented reason.'
                    : !isCurrentReadingVerified
                    ? 'Mandatory Verification: Click "Verify & Confirm Reading" on the left panel before generating the final bill.'
                    : meterReadingValidation.errorMessage ||
                      'Complete and verify the monthly electricity reading before billing.'}
                </span>
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
                  <span>Room is Vacant | Assign Tenant to Bill</span>
                </button>
                <p className="text-[11px] text-slate-400">
                  Vacant rooms cannot generate monthly billing receipts. Assign an active tenant in Room Management to start transactions.
                </p>
              </div>
            ) : (
              <button
                type="submit"
                disabled={!canGenerateMonthlyBill}
                className={`w-full py-3 px-4 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl transition cursor-pointer ${
                  isRolloverActive
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                    : 'bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 shadow-amber-500/20'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>
                  {isRolloverActive
                    ? 'Save & Generate Receipt (Rollover Verified)'
                    : 'Save & Generate Verified Receipt'}
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
                    Mechanical Cyclometer Guide
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    How sub-meter dials are read
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

      {/* Hidden offscreen camera stream feeder (never visible in modal UI = zero WebView video flicker) */}
      {isCameraActive && (
        <video
          ref={attachOffscreenVideoRef}
          aria-hidden="true"
          autoPlay
          playsInline
          muted
          controls={false}
          disablePictureInPicture
          style={{
            position: 'fixed',
            bottom: 0,
            right: 0,
            width: '2px',
            height: '2px',
            opacity: 0.005,
            pointerEvents: 'none',
            zIndex: -1,
          }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            v.muted = true;
            v.defaultMuted = true;
            v.play().catch(() => {});
          }}
        />
      )}
    </div>
  );
};
