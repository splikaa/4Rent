import { toPng } from 'html-to-image';
import { BillRecord } from '../types/rental';

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;
export const A4_MARGIN_PT = 24;
export const A4_CONTENT_WIDTH_PT = Number((A4_WIDTH_PT - A4_MARGIN_PT * 2).toFixed(2));
export const A4_CONTENT_HEIGHT_PT = Number((A4_HEIGHT_PT - A4_MARGIN_PT * 2).toFixed(2));

export interface PdfSectionBounds {
  top: number;
  bottom: number;
}

export interface PdfSliceWindow {
  startY: number;
  height: number;
}

export interface PdfJpegPageInput {
  jpegBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  drawWidthPt?: number;
  drawHeightPt?: number;
}

export interface ReceiptDocumentMeta {
  receiptNo: string;
  roomLabel: string;
  tenantLabel: string;
  hasNamedTenant: boolean;
  messengerHandle: string;
  filenameBase: string;
  pdfFilename: string;
  pngFilename: string;
  shareTitle: string;
}

function sanitizeFilenameSegment(raw: string | undefined | null, fallback = ''): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

/**
 * Builds deterministic receipt export metadata (filenames, share titles, optional handle).
 * Never blocks when tenant name or messenger handle is blank.
 */
export function buildReceiptDocumentMeta(
  bill: Pick<
    BillRecord,
    'receiptNo' | 'roomName' | 'tenantName' | 'billingPeriod' | 'tenantMessenger'
  >
): ReceiptDocumentMeta {
  const receiptNo = (bill.receiptNo || 'Receipt').trim();
  const roomLabel = (bill.roomName || 'Room').trim();
  const rawTenant = (bill.tenantName || '').trim();
  const lowerTenant = rawTenant.toLowerCase();
  const hasNamedTenant =
    Boolean(rawTenant) &&
    lowerTenant !== 'vacant' &&
    lowerTenant !== 'no active tenant' &&
    lowerTenant !== 'current room tenant';

  const safeReceiptNo = sanitizeFilenameSegment(receiptNo, 'Receipt');
  const safeRoom = sanitizeFilenameSegment(roomLabel, 'Room');
  const safeTenant = hasNamedTenant ? sanitizeFilenameSegment(rawTenant, '') : '';

  const filenameBase = safeTenant
    ? `4Rent_Receipt_${safeReceiptNo}_${safeRoom}_${safeTenant}`
    : `4Rent_Receipt_${safeReceiptNo}_${safeRoom}`;

  const cleanHandle = (bill.tenantMessenger || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?(m\.me|messenger\.com\/t|facebook\.com)\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');

  const shareTitle = hasNamedTenant
    ? `4Rent Receipt ${receiptNo} | ${roomLabel} | ${rawTenant}`
    : `4Rent Receipt ${receiptNo} | ${roomLabel}`;

  return {
    receiptNo,
    roomLabel,
    tenantLabel: hasNamedTenant ? rawTenant : 'Tenant',
    hasNamedTenant,
    messengerHandle: cleanHandle,
    filenameBase,
    pdfFilename: `${filenameBase}.pdf`,
    pngFilename: `${filenameBase}.png`,
    shareTitle,
  };
}

function encodeAscii(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function base64DataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Computes clean page slice intervals so structured `[data-pdf-block]` sections
 * move cleanly to Page 2 rather than splitting rows or photos mid-box.
 */
export function computeA4SliceBoundaries(
  totalHeightPx: number,
  pageMaxHeightPx: number,
  sectionBoundsPx: PdfSectionBounds[] = []
): PdfSliceWindow[] {
  const safeTotal = Math.max(1, Math.round(totalHeightPx));
  const safeMax = Math.max(120, Math.floor(pageMaxHeightPx));

  if (safeTotal <= safeMax) {
    return [{ startY: 0, height: safeTotal }];
  }

  const orderedBlocks = [...sectionBoundsPx]
    .filter((b) => Number.isFinite(b.top) && Number.isFinite(b.bottom) && b.bottom > b.top)
    .sort((a, b) => a.top - b.top);

  const slices: PdfSliceWindow[] = [];
  let cursor = 0;

  while (cursor < safeTotal) {
    const hardLimit = Math.min(safeTotal, cursor + safeMax);
    if (hardLimit >= safeTotal) {
      slices.push({ startY: cursor, height: safeTotal - cursor });
      break;
    }

    // Find the first semantic block that begins cleanly after `cursor` and crosses `hardLimit`.
    let splitY = hardLimit;
    for (const block of orderedBlocks) {
      const blockTop = Math.floor(block.top);
      const blockBottom = Math.ceil(block.bottom);
      if (blockTop > cursor + 24 && blockBottom > hardLimit && blockTop < hardLimit) {
        splitY = blockTop;
        break;
      }
    }

    // Safety fallback to ensure forward progress if a block matches cursor exactly
    if (splitY <= cursor) {
      splitY = hardLimit;
    }

    slices.push({ startY: cursor, height: splitY - cursor });
    cursor = splitY;
  }

  return slices.filter((s) => s.height > 0);
}

/**
 * Pure-TypeScript multi-page A4 Portrait PDF 1.4 assembler.
 * Every emitted page uses exact A4 dimensions [0 0 595.28 841.89] and clean margins.
 */
export function assembleA4PdfFromJpegPages(pages: PdfJpegPageInput[]): Uint8Array {
  if (pages.length === 0) {
    throw new Error('At least one page is required to build a PDF document');
  }

  const pageCount = pages.length;
  // Object numbering:
  // 1 = Catalog, 2 = Pages tree
  // For each page i (0..pageCount-1): 3 objects starting at base = 3 + i * 3:
  //   base + 0: Page object (/MediaBox [0 0 595.28 841.89])
  //   base + 1: Resources dictionary (/XObject << /Im0 ... >>)
  //   base + 2: Content stream object
  // Wait: each page also needs an Image XObject! Make stride = 4:
  //   base + 0 = Page, base + 1 = Resources, base + 2 = Content Stream, base + 3 = Image XObject
  const totalObjects = 2 + pageCount * 4;
  const offsets: number[] = new Array(totalObjects + 1).fill(0);
  const chunks: Uint8Array[] = [];
  let cursor = 0;

  const pushChunk = (chunk: Uint8Array) => {
    chunks.push(chunk);
    cursor += chunk.length;
  };

  // PDF 1.4 Header + binary comment marker
  pushChunk(
    new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
      0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
    ])
  );

  // 1: Catalog
  offsets[1] = cursor;
  pushChunk(encodeAscii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));

  // 2: Pages root
  const kidsRefs = pages.map((_, idx) => `${3 + idx * 4} 0 R`).join(' ');
  offsets[2] = cursor;
  pushChunk(
    encodeAscii(`2 0 obj\n<< /Type /Pages /Kids [${kidsRefs}] /Count ${pageCount} >>\nendobj\n`)
  );

  pages.forEach((page, idx) => {
    const baseObj = 3 + idx * 4;
    const pageObjId = baseObj;
    const resObjId = baseObj + 1;
    const contentObjId = baseObj + 2;
    const imageObjId = baseObj + 3;

    const imgW = Math.max(1, Math.round(page.widthPx));
    const imgH = Math.max(1, Math.round(page.heightPx));

    // Scale image inside A4 printable bounds while preserving exact aspect ratio
    const widthFitScale = A4_CONTENT_WIDTH_PT / imgW;
    const heightFitScale = A4_CONTENT_HEIGHT_PT / imgH;
    const fitScale = Math.min(widthFitScale, heightFitScale);

    const drawW = page.drawWidthPt ?? Number((imgW * fitScale).toFixed(2));
    const drawH = page.drawHeightPt ?? Number((imgH * fitScale).toFixed(2));
    const drawX = Number(((A4_WIDTH_PT - drawW) / 2).toFixed(2));
    const drawY = Number((A4_HEIGHT_PT - A4_MARGIN_PT - drawH).toFixed(2));

    const contentStreamStr = `q\n${drawW} 0 0 ${drawH} ${drawX} ${drawY} cm\n/Im0 Do\nQ\n`;
    const contentBytes = encodeAscii(contentStreamStr);

    // Page object (strict A4 portrait MediaBox)
    offsets[pageObjId] = cursor;
    pushChunk(
      encodeAscii(
        `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH_PT} ${A4_HEIGHT_PT}] /Resources ${resObjId} 0 R /Contents ${contentObjId} 0 R >>\nendobj\n`
      )
    );

    // Resources dictionary
    offsets[resObjId] = cursor;
    pushChunk(
      encodeAscii(
        `${resObjId} 0 obj\n<< /ProcSet [/PDF /ImageC] /XObject << /Im0 ${imageObjId} 0 R >> >>\nendobj\n`
      )
    );

    // Content stream
    offsets[contentObjId] = cursor;
    pushChunk(
      encodeAscii(`${contentObjId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`)
    );
    pushChunk(contentBytes);
    pushChunk(encodeAscii('\nendstream\nendobj\n'));

    // Embedded JPEG XObject
    offsets[imageObjId] = cursor;
    pushChunk(
      encodeAscii(
        `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.length} >>\nstream\n`
      )
    );
    pushChunk(page.jpegBytes);
    pushChunk(encodeAscii('\nendstream\nendobj\n'));
  });

  // Cross-reference table
  const xrefStart = cursor;
  const xrefLines = [
    'xref\n',
    `0 ${totalObjects + 1}\n`,
    '0000000000 65535 f \n',
  ];
  for (let i = 1; i <= totalObjects; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushChunk(encodeAscii(xrefLines.join('')));

  pushChunk(
    encodeAscii(
      `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
    )
  );

  return concatUint8Arrays(chunks);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(blob);
  });
}

function loadHtmlImage(imageDataUrl: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load receipt raster for PDF'));
    el.src = imageDataUrl;
  });
}

/**
 * Renders a pre-captured receipt image into a paginated standard A4 Portrait PDF
 * (`595.28 x 841.89 pt`), respecting optional section boundaries.
 */
export async function buildA4ReceiptPdfBlob(
  receiptPngDataUrl: string,
  sectionBoundsImagePx: PdfSectionBounds[] = [],
  jpegQuality = 0.92
): Promise<{ blob: Blob; dataUrl: string; pageCount: number }> {
  const img = await loadHtmlImage(receiptPngDataUrl);
  const imgWidth = Math.max(1, img.naturalWidth || img.width || 1200);
  const imgHeight = Math.max(1, img.naturalHeight || img.height || 1600);

  const ptPerPx = A4_CONTENT_WIDTH_PT / imgWidth;
  const pageMaxHeightPx = Math.floor(A4_CONTENT_HEIGHT_PT / ptPerPx);
  const slices = computeA4SliceBoundaries(
    imgHeight,
    pageMaxHeightPx,
    sectionBoundsImagePx
  );

  const jpegPages: PdfJpegPageInput[] = [];
  for (const slice of slices) {
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = imgWidth;
    pageCanvas.height = slice.height;
    const ctx = pageCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas unavailable for A4 PDF pagination');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, imgWidth, slice.height);
    ctx.drawImage(
      img,
      0,
      slice.startY,
      imgWidth,
      slice.height,
      0,
      0,
      imgWidth,
      slice.height
    );

    const jpegDataUrl = pageCanvas.toDataURL('image/jpeg', jpegQuality);
    jpegPages.push({
      jpegBytes: base64DataUrlToBytes(jpegDataUrl),
      widthPx: imgWidth,
      heightPx: slice.height,
      drawWidthPt: A4_CONTENT_WIDTH_PT,
      drawHeightPt: Number((slice.height * ptPerPx).toFixed(2)),
    });
  }

  const pdfBytes = assembleA4PdfFromJpegPages(jpegPages);
  const arrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(arrayBuffer).set(pdfBytes);
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const dataUrl = await blobToDataUrl(blob);

  return { blob, dataUrl, pageCount: slices.length };
}

/**
 * Captures the dedicated `PrintableA4Receipt` element at 794px A4 width and outputs
 * a true standard 1-2 page A4 Portrait PDF (`595.28 x 841.89 pt`) + matching raster PNG.
 */
export async function buildA4ReceiptPdfFromElement(
  containerEl: HTMLElement,
  options?: { pixelRatio?: number; jpegQuality?: number }
): Promise<{
  blob: Blob;
  dataUrl: string;
  pngDataUrl: string;
  pageCount: number;
}> {
  const pixelRatio = options?.pixelRatio ?? 2;
  const jpegQuality = options?.jpegQuality ?? 0.92;

  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

  const containerRect = containerEl.getBoundingClientRect();
  const fullWidth = Math.ceil(containerRect.width || containerEl.scrollWidth || 794);
  const fullHeight = Math.ceil(
    Math.max(containerEl.scrollHeight, containerEl.offsetHeight, containerRect.height || 0)
  );

  // Measure `[data-pdf-block]` children so page breaks align between sections, never mid-row
  const sectionNodes = Array.from(containerEl.querySelectorAll<HTMLElement>('[data-pdf-block]'));
  const sectionBoundsImagePx: PdfSectionBounds[] = sectionNodes.map((node) => {
    const r = node.getBoundingClientRect();
    return {
      top: Math.max(0, (r.top - containerRect.top) * pixelRatio),
      bottom: Math.max(0, (r.bottom - containerRect.top) * pixelRatio),
    };
  });

  const pngDataUrl = await toPng(containerEl, {
    cacheBust: true,
    pixelRatio,
    skipFonts: true,
    fontEmbedCSS: '',
    backgroundColor: '#FFFFFF',
    width: fullWidth,
    height: fullHeight,
    canvasWidth: fullWidth * pixelRatio,
    canvasHeight: fullHeight * pixelRatio,
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

  const { blob, dataUrl, pageCount } = await buildA4ReceiptPdfBlob(
    pngDataUrl,
    sectionBoundsImagePx,
    jpegQuality
  );

  return { blob, dataUrl, pngDataUrl, pageCount };
}

function pngDataUrlToBlob(dataUrl: string): Blob {
  const bytes = base64DataUrlToBytes(dataUrl);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: 'image/png' });
}

/**
 * Captures the dedicated `PrintableA4Receipt` element as a high-resolution PNG
 * preserving all business details, tenant details, payment breakdown, electricity charges,
 * meter proofs, and totals.
 */
export async function captureReceiptPngFromElement(
  containerEl: HTMLElement,
  options?: { pixelRatio?: number }
): Promise<{
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}> {
  const pixelRatio = options?.pixelRatio ?? 2.5;

  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

  const containerRect = containerEl.getBoundingClientRect();
  const fullWidth = Math.ceil(containerRect.width || containerEl.scrollWidth || 794);
  const fullHeight = Math.ceil(
    Math.max(containerEl.scrollHeight, containerEl.offsetHeight, containerRect.height || 0)
  );

  const dataUrl = await toPng(containerEl, {
    cacheBust: true,
    pixelRatio,
    skipFonts: true,
    fontEmbedCSS: '',
    backgroundColor: '#FFFFFF',
    width: fullWidth,
    height: fullHeight,
    canvasWidth: Math.round(fullWidth * pixelRatio),
    canvasHeight: Math.round(fullHeight * pixelRatio),
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

  const blob = pngDataUrlToBlob(dataUrl);
  return {
    blob,
    dataUrl,
    width: Math.round(fullWidth * pixelRatio),
    height: Math.round(fullHeight * pixelRatio),
  };
}

export interface CopyReceiptPngResult {
  ok: boolean;
  method:
    | 'electron_clipboard'
    | 'clipboard_api'
    | 'share_fallback'
    | 'download_fallback'
    | 'failed';
  message: string;
  dataUrl?: string;
}

/**
 * Copies a high-resolution PNG of the receipt directly to the system clipboard
 * so users can paste straight into Messenger, WhatsApp, Viber, email, or docs.
 *
 * Uses synchronous ClipboardItem Promise<Blob> for Safari/iOS gesture compliance
 * and native Electron clipboard IPC when running inside the Desktop app.
 */
export async function copyReceiptElementAsPng(
  containerEl: HTMLElement,
  options?: {
    filename?: string;
    shareTitle?: string;
    pixelRatio?: number;
  }
): Promise<CopyReceiptPngResult> {
  const filename = options?.filename || '4Rent_Receipt.png';
  const shareTitle = options?.shareTitle || '4Rent Official Receipt';
  const pixelRatio = options?.pixelRatio ?? 2.5;

  const win = typeof window !== 'undefined'
    ? (window as unknown as {
        electronDesktop?: {
          copyPngToClipboard?: (pngDataUrl: string) => Promise<boolean> | boolean;
        };
      })
    : undefined;

  // Start high-res PNG capture immediately inside user click gesture
  const capturePromise = captureReceiptPngFromElement(containerEl, { pixelRatio });

  // 1. Electron Desktop native clipboard bridge (macOS / Windows / Linux)
  if (win?.electronDesktop && typeof win.electronDesktop.copyPngToClipboard === 'function') {
    try {
      const captured = await capturePromise;
      const wrote = await win.electronDesktop.copyPngToClipboard(captured.dataUrl);
      if (wrote) {
        return {
          ok: true,
          method: 'electron_clipboard',
          message: 'Receipt PNG copied to clipboard! Paste directly into Messenger (Cmd/Ctrl+V).',
          dataUrl: captured.dataUrl,
        };
      }
    } catch {
      // Fall through to Web Clipboard API
    }
  }

  // 2. Web Clipboard API with Promise<Blob> (preserves user gesture on Safari macOS & iOS Safari)
  const canUseClipboardItem =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard?.write) &&
    typeof ClipboardItem !== 'undefined';

  if (canUseClipboardItem) {
    try {
      const item = new ClipboardItem({
        'image/png': capturePromise.then((res) => res.blob),
      });
      await navigator.clipboard.write([item]);
      const captured = await capturePromise;
      return {
        ok: true,
        method: 'clipboard_api',
        message: 'Receipt PNG copied to clipboard! Paste directly into Messenger or any app.',
        dataUrl: captured.dataUrl,
      };
    } catch {
      // 3. Fallback: wait for resolved Blob for browsers that reject Promise-backed ClipboardItem
      try {
        const captured = await capturePromise;
        const item = new ClipboardItem({ 'image/png': captured.blob });
        await navigator.clipboard.write([item]);
        return {
          ok: true,
          method: 'clipboard_api',
          message: 'Receipt PNG copied to clipboard! Paste directly into Messenger or any app.',
          dataUrl: captured.dataUrl,
        };
      } catch {
        // Proceed to graceful fallback below
      }
    }
  }

  // 4. Graceful fallback when clipboard image write is blocked (e.g., insecure HTTP or legacy WebView)
  try {
    const captured = await capturePromise;
    if (
      typeof File !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      const pngFile = new File([captured.blob], filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [pngFile] })) {
        try {
          await navigator.share({
            files: [pngFile],
            title: shareTitle,
          });
          return {
            ok: true,
            method: 'share_fallback',
            message: 'Opened PNG share sheet (direct clipboard image copy unavailable in this browser).',
            dataUrl: captured.dataUrl,
          };
        } catch (err: any) {
          if (err?.name === 'AbortError') {
            return {
              ok: false,
              method: 'failed',
              message: 'Receipt share cancelled.',
            };
          }
        }
      }
    }

    // Final fallback: save PNG file cleanly so user always gets their receipt image
    if (typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.download = filename;
      link.href = captured.dataUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      return {
        ok: true,
        method: 'download_fallback',
        message: `Browser blocked image clipboard; downloaded high-res PNG (${filename}) instead.`,
        dataUrl: captured.dataUrl,
      };
    }

    return {
      ok: false,
      method: 'failed',
      message: 'Clipboard image copy is not supported in this environment.',
    };
  } catch {
    return {
      ok: false,
      method: 'failed',
      message: 'Could not render receipt PNG. Please try Download PNG or Share Receipt.',
    };
  }
}
