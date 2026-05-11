/**
 * File System Access API export — writes XMP sidecars and organized
 * folders directly to the user's chosen directory. Zero quality loss:
 * original files are copied byte-for-byte, never re-encoded.
 */

import { Photo, CullResult, DeepResult, Rating } from "./types";
import { generateXMP, sanitizeFilename } from "./exports";

/** Check if the File System Access API is available */
export function hasFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

interface ExportOptions {
  photos: Photo[];
  cullResults: Record<number, CullResult>;
  deepResults: Record<number, DeepResult>;
  ratingOverrides?: Record<number, Rating>;
  recommendedSequence: number[] | null;
  renameFiles?: boolean;
  onProgress?: (msg: string) => void;
}

const RATING_FOLDERS: Record<string, string> = {
  HERO: "01_heroes",
  SELECT: "02_selects",
  MAYBE: "03_maybes",
  CUT: "04_cuts",
};

export function createExportFolderName(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join("-") + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `contact-sheet-export-${stamp}`;
}

export function sidecarNameForFile(filename: string): string {
  return `${filename.replace(/\.[^.]+$/, "")}.xmp`;
}

async function getOrCreateDir(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  content: string,
) {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function copyOriginalFile(
  dir: FileSystemDirectoryHandle,
  destName: string,
  file: File,
) {
  const fileHandle = await dir.getFileHandle(destName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

/**
 * Export to a user-picked folder using the File System Access API.
 * Returns the number of files written.
 */
export async function exportToFolder(opts: ExportOptions): Promise<number> {
  const {
    photos, cullResults, deepResults, ratingOverrides,
    recommendedSequence, renameFiles = false, onProgress,
  } = opts;

  // Prompt user to pick a destination, then keep the export self-contained.
  const rootDir = await (window as any).showDirectoryPicker({ mode: "readwrite" });
  const exportDir = await getOrCreateDir(rootDir, createExportFolderName());

  let written = 0;
  const total = photos.filter((_, i) => cullResults[i]).length;

  // 1. Create organized folders and copy original files with matching sidecars.
  const byRatingDir = await getOrCreateDir(exportDir, "by_rating");

  // Pre-create rating folders
  const ratingDirs: Record<string, FileSystemDirectoryHandle> = {};
  for (const [rating, folder] of Object.entries(RATING_FOLDERS)) {
    ratingDirs[rating] = await getOrCreateDir(byRatingDir, folder);
  }

  onProgress?.(`Organizing files…`);
  let organized = 0;
  for (let i = 0; i < photos.length; i++) {
    const cull = cullResults[i];
    if (!cull) continue;
    const photo = photos[i];
    if (!photo.originalFile) continue; // skip restored sessions without originals

    const effectiveRating = ratingOverrides?.[i] || cull.rating;
    const destDir = ratingDirs[effectiveRating] || ratingDirs["CUT"];

    let destName = photo.name;
    if (renameFiles) {
      const title = deepResults[i]?.title || cull.reason;
      if (title) {
        const ext = photo.name.split(".").pop() || "jpg";
        const orig = photo.name.replace(/\.[^.]+$/, "");
        destName = `${sanitizeFilename(title)}__${orig}.${ext}`;
      }
    }

    await copyOriginalFile(destDir, destName, photo.originalFile);
    const xmp = generateXMP(destName, cull, deepResults[i], ratingOverrides?.[i]);
    await writeTextFile(destDir, sidecarNameForFile(destName), xmp);
    written += 2;
    organized++;
    onProgress?.(`Organizing: ${organized}/${total}`);
  }

  // 2. Create sequence folder if available.
  if (recommendedSequence?.length) {
    onProgress?.(`Creating sequence…`);
    const seqDir = await getOrCreateDir(exportDir, "sequence");
    for (let n = 0; n < recommendedSequence.length; n++) {
      const idx = recommendedSequence[n];
      const photo = photos[idx];
      if (!photo?.originalFile) continue;
      const cull = cullResults[idx];
      if (!cull) continue;
      const pad = String(n + 1).padStart(3, "0");
      const ext = photo.name.split(".").pop() || "jpg";
      let destName = photo.name;
      if (renameFiles && deepResults[idx]?.title) {
        destName = `${sanitizeFilename(deepResults[idx].title)}.${ext}`;
      }
      const sequencedName = `${pad}_${destName}`;
      await copyOriginalFile(seqDir, sequencedName, photo.originalFile);
      const xmp = generateXMP(sequencedName, cull, deepResults[idx], ratingOverrides?.[idx]);
      await writeTextFile(seqDir, sidecarNameForFile(sequencedName), xmp);
      written += 2;
    }
  }

  onProgress?.(`Done — ${organized} originals with sidecars`);
  return written;
}
