/**
 * Extract the embedded JPEG preview from a RAW camera file.
 *
 * Nearly all RAW formats (CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG, etc.)
 * embed a full-resolution JPEG preview. We scan for the largest JPEG
 * block in the file and return it as a Blob.
 *
 * This avoids needing a full RAW decoder — the browser can display
 * the extracted JPEG natively.
 */

const RAW_EXTENSIONS = new Set([
  "cr2", "cr3", "nef", "nrw", "arw", "srf", "sr2",
  "raf", "orf", "rw2", "rwl", "dng", "pef", "ptx",
  "3fr", "fff", "iiq", "mrw", "mdc", "kdc", "dcr",
  "raw", "erf", "mef", "mos", "x3f",
]);

export function isRawFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return RAW_EXTENSIONS.has(ext);
}

/** Check magic bytes to detect RAW files regardless of extension */
export function isRawByMagic(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(32, buffer.byteLength));
  const header = String.fromCharCode(...bytes.slice(0, 16));
  // Fuji RAF
  if (header.startsWith("FUJIFILMCCD-RAW")) return true;
  // Canon CR2 (TIFF with CR2 marker)
  if (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[8] === 0x43 && bytes[9] === 0x52) return true;
  // Nikon NEF / DNG / other TIFF-based RAW (check for TIFF magic but not standard TIFF)
  // These need more nuanced detection, handled by extension check
  return false;
}

export function isHeicFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return ext === "heic" || ext === "heif";
}

/**
 * Scan an ArrayBuffer for embedded JPEG images and return the largest one.
 * JPEGs start with 0xFFD8 and end with 0xFFD9.
 */
export function extractJpegPreview(buffer: ArrayBuffer): Blob | null {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;

  let bestStart = -1;
  let bestLen = 0;

  // Scan for JPEG SOI markers (0xFF 0xD8)
  for (let i = 0; i < len - 1; i++) {
    if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8) {
      // Found a JPEG start — now find its end (0xFF 0xD9)
      for (let j = i + 2; j < len - 1; j++) {
        if (bytes[j] === 0xFF && bytes[j + 1] === 0xD9) {
          const jpegLen = j + 2 - i;
          // Keep the largest JPEG (the full-res preview, not the thumbnail)
          if (jpegLen > bestLen) {
            bestStart = i;
            bestLen = jpegLen;
          }
          break;
        }
      }
    }
  }

  if (bestStart < 0 || bestLen < 1000) return null; // too small to be useful

  return new Blob(
    [bytes.slice(bestStart, bestStart + bestLen)],
    { type: "image/jpeg" }
  );
}
