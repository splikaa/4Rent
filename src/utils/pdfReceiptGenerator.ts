/**
 * Pure-TypeScript single-page A4 PDF 1.4 generator for official 4Rent receipts.
 * Wraps a rendered receipt image canvas into a standards-compliant PDF document
 * so Mobile Web, PWA, and Desktop can download `.pdf` directly without relying on window.print().
 */

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
 * Converts any rendered receipt data URL (PNG/WebP/JPEG) into an opaque white-background
 * Baseline JPEG data URL + exact pixel dimensions for PDF /DCTDecode embedding.
 */
export async function rasterizeToOpaqueJpeg(
  imageDataUrl: string,
  quality = 0.94
): Promise<{ jpegDataUrl: string; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load receipt raster for PDF'));
    el.src = imageDataUrl;
  });

  const width = Math.max(1, img.naturalWidth || img.width || 1200);
  const height = Math.max(1, img.naturalHeight || img.height || 1600);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable for PDF generation');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return {
    jpegDataUrl: canvas.toDataURL('image/jpeg', quality),
    width,
    height,
  };
}

/**
 * Builds a single-sheet A4-width (595.28 pt wide) PDF Blob containing the full receipt
 * image scaled cleanly to full readable page width on both Mobile and Desktop.
 */
export async function buildSinglePageReceiptPdfBlob(
  receiptPngDataUrl: string
): Promise<{ blob: Blob; dataUrl: string }> {
  const { jpegDataUrl, width, height } = await rasterizeToOpaqueJpeg(
    receiptPngDataUrl,
    0.93
  );
  const jpegBytes = base64DataUrlToBytes(jpegDataUrl);

  const pageW = 595.28;
  const margin = 24;
  const drawW = pageW - margin * 2;
  const scale = drawW / width;
  const drawH = Number((height * scale).toFixed(2));
  const pageH = Number(Math.max(841.89, drawH + margin * 2).toFixed(2));
  const drawX = margin;
  const drawY = Number((pageH - margin - drawH).toFixed(2));

  const contentStreamStr = `q\n${drawW} 0 0 ${drawH} ${drawX} ${drawY} cm\n/Im0 Do\nQ\n`;
  const contentBytes = encodeAscii(contentStreamStr);

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let cursor = 0;

  const pushChunk = (chunk: Uint8Array) => {
    chunks.push(chunk);
    cursor += chunk.length;
  };

  // PDF 1.4 Header + binary marker
  pushChunk(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // Object 1: Catalog
  offsets[1] = cursor;
  pushChunk(encodeAscii('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));

  // Object 2: Pages
  offsets[2] = cursor;
  pushChunk(encodeAscii('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'));

  // Object 3: Page
  offsets[3] = cursor;
  pushChunk(
    encodeAscii(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources 4 0 R /Contents 5 0 R >>\nendobj\n`
    )
  );

  // Object 4: Resources
  offsets[4] = cursor;
  pushChunk(
    encodeAscii(
      '4 0 obj\n<< /ProcSet [/PDF /ImageC] /XObject << /Im0 6 0 R >> >>\nendobj\n'
    )
  );

  // Object 5: Page Content Stream
  offsets[5] = cursor;
  pushChunk(
    encodeAscii(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`)
  );
  pushChunk(contentBytes);
  pushChunk(encodeAscii('\nendstream\nendobj\n'));

  // Object 6: Embedded Baseline JPEG Image XObject
  offsets[6] = cursor;
  pushChunk(
    encodeAscii(
      `6 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
    )
  );
  pushChunk(jpegBytes);
  pushChunk(encodeAscii('\nendstream\nendobj\n'));

  // Cross-reference table
  const xrefStart = cursor;
  const xrefLines = ['xref\n', '0 7\n', '0000000000 65535 f \n'];
  for (let i = 1; i <= 6; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushChunk(encodeAscii(xrefLines.join('')));

  // Trailer & EOF
  pushChunk(
    encodeAscii(
      `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
    )
  );

  const pdfBytes = concatUint8Arrays(chunks);
  // Copy into a plain ArrayBuffer so strict TypeScript DOM Blob types accept it cleanly
  const arrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(arrayBuffer).set(pdfBytes);
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });

  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(blob);
  });

  return { blob, dataUrl };
}
