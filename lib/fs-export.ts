/**
 * File System Access API export — writes XMP sidecars and organized
 * folders directly to the user's chosen directory. Zero quality loss:
 * original files are copied byte-for-byte, never re-encoded.
 */

import { Photo, CullResult, DeepResult } from "./types";
import { generateXMP, sanitizeFilename } from "./exports";

/** Check if the File System Access API is available */
export function hasFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

interface ExportOptions {
  photos: Photo[];
  cullResults: Record<number, CullResult>;
  deepResults: Record<number, DeepResult>;
  ratingOverrides?: Record<number, string>;
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

  // Prompt user to pick a directory
  const rootDir = await (window as any).showDirectoryPicker({ mode: "readwrite" });

  let written = 0;
  const total = photos.filter((_, i) => cullResults[i]).length;

  // 1. Write XMP sidecars next to originals (in the root dir)
  onProgress?.(`Writing XMP sidecars…`);
  for (let i = 0; i < photos.length; i++) {
    const cull = cullResults[i];
    if (!cull) continue;
    const deep = deepResults[i];
    const baseName = photos[i].name.replace(/\.[^.]+$/, "");
    const xmp = generateXMP(photos[i].name, cull, deep);
    await writeTextFile(rootDir, `${baseName}.xmp`, xmp);
    written++;
    onProgress?.(`XMP sidecars: ${written}/${total}`);
  }

  // 2. Create organized folders and copy original files
  const organizedDir = await getOrCreateDir(rootDir, "organized");
  const byRatingDir = await getOrCreateDir(organizedDir, "by_rating");

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

    const effectiveRating = ratingOverrides?.[i] || deepResults[i]?.rating || cull.rating;
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
    organized++;
    onProgress?.(`Organizing: ${organized}/${total}`);
  }

  // 3. Create sequence folder if available
  if (recommendedSequence?.length) {
    onProgress?.(`Creating sequence…`);
    const seqDir = await getOrCreateDir(organizedDir, "sequence");
    for (let n = 0; n < recommendedSequence.length; n++) {
      const idx = recommendedSequence[n];
      const photo = photos[idx];
      if (!photo?.originalFile) continue;
      const pad = String(n + 1).padStart(3, "0");
      const ext = photo.name.split(".").pop() || "jpg";
      let destName = photo.name;
      if (renameFiles && deepResults[idx]?.title) {
        destName = `${sanitizeFilename(deepResults[idx].title)}.${ext}`;
      }
      await copyOriginalFile(seqDir, `${pad}_${destName}`, photo.originalFile);
    }
  }

  onProgress?.(`Done — ${written} sidecars + ${organized} files organized`);
  return written + organized;
}
