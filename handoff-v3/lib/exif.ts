import { ExifData } from "./types";

export function readEXIF(arrayBuffer: ArrayBuffer): ExifData | null {
  try {
    const view = new DataView(arrayBuffer);
    if (view.getUint16(0) !== 0xFFD8) return null;

    let offset = 2;
    while (offset < view.byteLength - 1) {
      const marker = view.getUint16(offset);
      if (marker === 0xFFE1) {
        const length = view.getUint16(offset + 2);
        return parseExifSegment(view, offset + 4, length - 2);
      }
      if ((marker & 0xFF00) !== 0xFF00) break;
      offset += 2 + view.getUint16(offset + 2);
    }
    return null;
  } catch { return null; }
}

function parseExifSegment(view: DataView, start: number, length: number): ExifData | null {
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0x0000) return null;

  const tiffStart = start + 6;
  const le = view.getUint16(tiffStart) === 0x4949;

  const g16 = (o: number) => view.getUint16(tiffStart + o, le);
  const g32 = (o: number) => view.getUint32(tiffStart + o, le);

  const readStr = (o: number, len: number) => {
    let s = "";
    for (let i = 0; i < len; i++) {
      const c = view.getUint8(tiffStart + o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };

  const result: ExifData = {};

  const readIFD = (ifdOffset: number, isExifSub: boolean) => {
    if (ifdOffset + 2 > length) return;
    const count = g16(ifdOffset);
    for (let i = 0; i < count; i++) {
      const entryOff = ifdOffset + 2 + i * 12;
      if (entryOff + 12 > tiffStart + start + length - 6) break;
      const tag = g16(entryOff);
      const type = g16(entryOff + 2);
      const cnt = g32(entryOff + 4);
      const valOff = entryOff + 8;
      const sizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8];
      const dataOff = (cnt * (sizes[type] || 1) > 4) ? g32(valOff) : null;

      switch (tag) {
        case 0x010F: result.make = readStr(dataOff ?? valOff, Math.min(cnt, 64)); break;
        case 0x0110: result.model = readStr(dataOff ?? valOff, Math.min(cnt, 64)); break;
        case 0xA434: result.lens = readStr(dataOff ?? valOff, Math.min(cnt, 128)); break;
        case 0x8827: result.iso = type === 3 ? g16(valOff) : g32(valOff); break;
        case 0x829A:
          if (dataOff !== null) {
            const num = g32(dataOff), den = g32(dataOff + 4);
            if (den && num) {
              result.shutterSpeed = den / num >= 2 ? `1/${Math.round(den / num)}s` : `${(num / den).toFixed(1)}s`;
              result.shutterRaw = num / den;
            }
          }
          break;
        case 0x829D:
          if (dataOff !== null) { const fn = g32(dataOff) / (g32(dataOff + 4) || 1); if (fn) result.aperture = fn; }
          break;
        case 0x920A:
          if (dataOff !== null) { const fl = g32(dataOff) / (g32(dataOff + 4) || 1); if (fl) result.focalLength = Math.round(fl); }
          break;
        case 0xA405: result.focalLength35 = type === 3 ? g16(valOff) : g32(valOff); break;
        case 0x9209: result.flash = g16(valOff); break;
        case 0x8769: if (!isExifSub) readIFD(g32(valOff), true); break;
      }
    }
  };

  readIFD(g32(4), false);

  if (result.make && result.model?.startsWith(result.make)) {
    result.model = result.model.substring(result.make.length).trim();
  }

  return Object.keys(result).length > 0 ? result : null;
}

export function formatExifLine(exif: ExifData | null): string | null {
  if (!exif) return null;
  const parts: string[] = [];
  if (exif.iso) parts.push(`ISO ${exif.iso}`);
  if (exif.focalLength) parts.push(`${exif.focalLength}mm`);
  if (exif.aperture) parts.push(`f/${exif.aperture % 1 === 0 ? exif.aperture.toFixed(0) : exif.aperture.toFixed(1)}`);
  if (exif.shutterSpeed) parts.push(exif.shutterSpeed);
  return parts.length > 0 ? parts.join("  ·  ") : null;
}

export function formatExifCamera(exif: ExifData | null): string | null {
  if (!exif) return null;
  const parts: string[] = [];
  if (exif.make) parts.push(exif.make);
  if (exif.model) parts.push(exif.model);
  const camera = parts.join(" ");
  if (exif.lens) return camera ? `${camera}  ·  ${exif.lens}` : exif.lens;
  return camera || null;
}

export function formatExifForPrompt(exif: ExifData | null): string {
  if (!exif) return "";
  const parts: string[] = [];
  if (exif.iso) parts.push(`ISO ${exif.iso}`);
  if (exif.focalLength) parts.push(`${exif.focalLength}mm`);
  if (exif.aperture) parts.push(`f/${exif.aperture % 1 === 0 ? exif.aperture.toFixed(0) : exif.aperture.toFixed(1)}`);
  if (exif.shutterSpeed) parts.push(exif.shutterSpeed);
  if (exif.make || exif.model) parts.push([exif.make, exif.model].filter(Boolean).join(" "));
  if (exif.lens) parts.push(exif.lens);
  return parts.length > 0 ? ` | ${parts.join(", ")}` : "";
}
