import { Photo } from "./types";
import { readEXIF } from "./exif";
import { isRawFile, isRawByMagic, extractJpegPreview } from "./raw-preview";

/**
 * Load an image from a File, resize for preview, and extract EXIF.
 * For RAW files, extracts the embedded JPEG preview first.
 */
export function resizeImage(file: File, maxDim = 2048): Promise<Photo> {
  return new Promise((resolve, reject) => {
    // Read the file as ArrayBuffer first (needed for EXIF and RAW extraction)
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = async (event) => {
      const buffer = event.target!.result as ArrayBuffer;
      const exif = readEXIF(buffer);

      // Determine the image source
      let imgSrc: string;
      let revokeOnDone = true;

      const treatAsRaw = isRawFile(file) || isRawByMagic(buffer);

      if (treatAsRaw) {
        // Extract embedded JPEG from RAW
        const jpegBlob = extractJpegPreview(buffer);
        if (!jpegBlob) {
          reject(new Error(`No preview found in ${file.name}`));
          return;
        }
        imgSrc = URL.createObjectURL(jpegBlob);
      } else {
        // Standard image — use the original File directly (it's already a Blob)
        imgSrc = URL.createObjectURL(file);
      }

      // Decode and resize
      const img = new Image();
      let retried = false;
      img.onerror = () => {
        URL.revokeObjectURL(imgSrc);
        if (!retried && !treatAsRaw) {
          // Browser can't decode — check if it's actually a RAW with wrong extension
          retried = true;
          const jpegBlob = extractJpegPreview(buffer);
          if (jpegBlob) {
            imgSrc = URL.createObjectURL(jpegBlob);
            img.src = imgSrc;
            return;
          }
        }
        reject(new Error(`Failed to decode ${file.name}`));
      };
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = (h * maxDim) / w; w = maxDim; }
        else if (h > maxDim) { w = (w * maxDim) / h; h = maxDim; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(imgSrc);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        resolve({
          id: crypto.randomUUID(),
          base64: dataUrl.split(",")[1],
          preview: dataUrl,
          name: file.name,
          width: Math.round(w),
          height: Math.round(h),
          mediaType: "image/jpeg",
          exif,
          originalFile: file,
        });
      };
      img.src = imgSrc;
    };
    reader.readAsArrayBuffer(file);
  });
}

export function resizeToMax(photo: Photo, maxDim: number, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = (h * maxDim) / w; w = maxDim; }
      else if (h > maxDim) { w = (w * maxDim) / h; h = maxDim; }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
    };
    img.onerror = () => resolve(photo.base64 || "");
    img.src = photo.preview;
  });
}

export function downsizeForCull(photo: Photo): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxDim = 512;
      let w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = (h * maxDim) / w; w = maxDim; }
      else if (h > maxDim) { w = (w * maxDim) / h; h = maxDim; }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = () => resolve(photo.base64 || "");
    img.src = photo.preview;
  });
}

export function makeThumb(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 160;
      let w = img.width, h = img.height;
      if (w > h) { h = (h * size) / w; w = size; } else { w = (w * size) / h; h = size; }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
