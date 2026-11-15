export interface LandscapeFrameProjection {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  outWidth: number;
  outHeight: number;
}

/**
 * Computes a center-cropped landscape (default 16:9) source region and canvas dimensions
 * from any incoming camera or photo aspect ratio, eliminating black pillarboxes on mobile portrait streams.
 */
export function computeLandscapeFrameProjection(
  srcWidth: number,
  srcHeight: number,
  options?: {
    targetAspect?: number;
    maxEdge?: number;
  }
): LandscapeFrameProjection {
  const safeSrcW = Math.max(1, Math.round(srcWidth || 640));
  const safeSrcH = Math.max(1, Math.round(srcHeight || 480));
  const targetAspect = options?.targetAspect ?? 16 / 9;
  const maxEdge = options?.maxEdge ?? 960;

  const srcAspect = safeSrcW / safeSrcH;
  let sx = 0;
  let sy = 0;
  let sw = safeSrcW;
  let sh = safeSrcH;

  if (srcAspect > targetAspect + 0.01) {
    // Ultra-wide input: center-crop horizontally to 16:9
    sw = Math.min(safeSrcW, Math.max(1, Math.round(safeSrcH * targetAspect)));
    sx = Math.max(0, Math.round((safeSrcW - sw) / 2));
  } else if (srcAspect < targetAspect - 0.01) {
    // Tall/portrait or 4:3 input: center-crop vertically into a crisp landscape band
    sh = Math.min(safeSrcH, Math.max(1, Math.round(safeSrcW / targetAspect)));
    sy = Math.max(0, Math.round((safeSrcH - sh) / 2));
  }

  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const outWidth = Math.max(320, Math.round(sw * scale));
  const outHeight = Math.max(180, Math.round(outWidth / targetAspect));

  return {
    sx,
    sy,
    sw,
    sh,
    outWidth,
    outHeight,
  };
}
