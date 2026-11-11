import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  X,
  Gauge,
  Zap,
  Info,
  Loader2,
} from 'lucide-react';
import { getMeterMasterImage } from '../../services/idbDatabase';

export interface MeterPhotoLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
  roiCropUrl?: string;
  readingValue?: string;
}

export const MeterPhotoLightboxModal: React.FC<MeterPhotoLightboxModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title = 'Sub-Meter Master Photo Inspection',
  roiCropUrl,
  readingValue,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [naturalDimensions, setNaturalDimensions] = useState<{ w: number; h: number } | null>(null);
  const [showRoi, setShowRoi] = useState<boolean>(true);
  const [is1to1Active, setIs1to1Active] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const lastTouchDistanceRef = useRef<number | null>(null);

  // Resolve Master Image (from IndexedDB key or raw data/blob URL)
  useEffect(() => {
    if (!isOpen || !imageUrl) {
      setResolvedUrl('');
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const resolveImage = async () => {
      try {
        if (imageUrl.startsWith('idb:')) {
          const loaded = await getMeterMasterImage(imageUrl);
          if (isMounted) {
            setResolvedUrl(loaded || imageUrl);
          }
        } else {
          if (isMounted) {
            setResolvedUrl(imageUrl);
          }
        }
      } catch {
        if (isMounted) {
          setResolvedUrl(imageUrl);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    resolveImage();

    return () => {
      isMounted = false;
    };
  }, [isOpen, imageUrl]);

  // Reset zoom and position on open
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setIs1to1Active(false);
    }
  }, [isOpen, imageUrl]);

  // Keyboard controls: ESC to close, +/- to zoom, 0 to reset
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleResetZoom();
      } else if (e.key === '1') {
        handleToggle1to1();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, naturalDimensions]);

  const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNaturalDimensions({
      w: img.naturalWidth || 1920,
      h: img.naturalHeight || 1080,
    });
    setIsLoading(false);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(6, prev * 1.3));
    setIs1to1Active(false);
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const next = Math.max(0.6, prev / 1.3);
      if (next <= 1.05) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
    setIs1to1Active(false);
  };

  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIs1to1Active(false);
  };

  const handleToggle1to1 = useCallback(() => {
    if (is1to1Active) {
      handleResetZoom();
    } else {
      if (naturalDimensions && containerRef.current) {
        const containerW = containerRef.current.clientWidth || 800;
        // Compute scale factor where 1 natural image pixel = 1 screen pixel
        const targetScale = Math.max(1.8, Math.min(5, naturalDimensions.w / (containerW * 0.8)));
        setScale(targetScale);
      } else {
        setScale(2.5);
      }
      setPosition({ x: 0, y: 0 });
      setIs1to1Active(true);
    }
  }, [is1to1Active, naturalDimensions]);

  // Wheel zoom (centered smoothly)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setScale((prev) => {
      const next = Math.min(6, Math.max(0.6, prev * zoomFactor));
      if (next <= 1.05) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
    setIs1to1Active(false);
  };

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scale <= 1 && !is1to1Active) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch pan & pinch zoom handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && scale > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
      lastTouchDistanceRef.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDistanceRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && isDragging) {
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    } else if (e.touches.length === 2 && lastTouchDistanceRef.current !== null) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = currentDist / lastTouchDistanceRef.current;
      setScale((prev) => Math.min(6, Math.max(0.6, prev * delta)));
      lastTouchDistanceRef.current = currentDist;
      setIs1to1Active(false);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastTouchDistanceRef.current = null;
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[120] bg-slate-950/95 backdrop-blur-md flex flex-col select-none overflow-hidden"
      onMouseUp={handleMouseUp}
    >
      {/* Top Header */}
      <header className="h-14 sm:h-16 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-white z-10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <Gauge className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-100 truncate">
              {title}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Full Sensor Clarity</span>
              {naturalDimensions && (
                <>
                  <span>•</span>
                  <span className="font-mono text-emerald-400">
                    {naturalDimensions.w} × {naturalDimensions.h} px
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Badges & Close Button */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {readingValue && (
            <div className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm">
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>{readingValue}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Lightbox"
            className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Inspection Viewport */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleToggle1to1}
        className={`relative flex-1 flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#06080d] via-[#090d16] to-[#06080d] ${
          scale > 1 || is1to1Active
            ? isDragging
              ? 'cursor-grabbing'
              : 'cursor-grab'
            : 'cursor-zoom-in'
        }`}
      >
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2 z-20">
            <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
            <p className="text-xs">Loading high-resolution master photo...</p>
          </div>
        )}

        {resolvedUrl ? (
          <div
            className="transition-transform duration-75 ease-out select-none"
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0px) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            <img
              ref={imgRef}
              src={resolvedUrl}
              alt={title}
              onLoad={handleImageLoaded}
              draggable={false}
              className="max-w-[90vw] max-h-[72vh] sm:max-h-[76vh] object-contain rounded-lg shadow-2xl border border-slate-800/80 pointer-events-none select-none"
            />
          </div>
        ) : (
          !isLoading && (
            <div className="text-center text-slate-500 text-sm">
              <p>No sub-meter image available for inspection.</p>
            </div>
          )
        )}

        {/* Floating ROI Dial Crop Overlay */}
        {roiCropUrl && showRoi && (
          <div className="absolute bottom-20 right-4 sm:bottom-20 sm:right-6 max-w-[220px] sm:max-w-[280px] p-2 rounded-xl bg-slate-900/95 border border-amber-500/40 shadow-2xl backdrop-blur-md z-30 transition-all">
            <div className="flex items-center justify-between text-[11px] font-bold text-amber-300 mb-1 px-1">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                OCR Dial Focus Crop
              </span>
              <button
                type="button"
                onClick={() => setShowRoi(false)}
                className="text-slate-400 hover:text-white text-xs px-1"
                title="Hide focus crop"
              >
                ✕
              </button>
            </div>
            <img
              src={roiCropUrl}
              alt="Cropped Register Dial"
              className="w-full h-16 sm:h-20 object-contain rounded-lg bg-black border border-slate-800"
            />
          </div>
        )}
      </div>

      {/* Bottom Inspection Control Bar */}
      <footer className="h-16 px-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-white z-10 shrink-0">
        {/* Navigation & Gesture Hints */}
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>Drag to pan • Mouse wheel or pinch to zoom • Double click 1:1 view</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 mx-auto md:mx-0">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 0.6}
            aria-label="Zoom Out"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 flex items-center gap-1 text-xs font-semibold transition cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
            <span className="hidden sm:inline">Zoom Out</span>
          </button>

          <div className="px-2.5 py-1.5 min-w-[56px] text-center font-mono text-xs font-bold text-amber-400 bg-slate-950/80 rounded-lg border border-slate-800">
            {Math.round(scale * 100)}%
          </div>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 6}
            aria-label="Zoom In"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 flex items-center gap-1 text-xs font-semibold transition cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
            <span className="hidden sm:inline">Zoom In</span>
          </button>

          {/* 1:1 Pixel Inspection Toggle */}
          <button
            type="button"
            onClick={handleToggle1to1}
            aria-label="Toggle 1:1 Actual Size"
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 text-xs font-bold transition cursor-pointer ${
              is1to1Active
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>1:1 Actual Size</span>
          </button>

          {/* Reset View Button */}
          <button
            type="button"
            onClick={handleResetZoom}
            aria-label="Reset Zoom and Pan"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 text-xs font-semibold transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          {roiCropUrl && !showRoi && (
            <button
              type="button"
              onClick={() => setShowRoi(true)}
              className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-semibold transition cursor-pointer"
            >
              Show Crop
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};

export default MeterPhotoLightboxModal;
