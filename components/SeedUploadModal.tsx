"use client";

import { useCallback, useRef, useState } from "react";
import { TasteEntry, contentHash } from "@/lib/taste-library";
import { useTasteLibrary } from "@/hooks/useTasteLibrary";

interface Props {
  onClose: () => void;
}

const MIN_FILES = 8;
const MAX_FILES = 20;
const ACCEPT_MIME = ["image/jpeg", "image/jpg", "image/png"];
const ACCEPT_EXT = /\.(jpe?g|png)$/i;

function isValidImage(file: File): boolean {
  if (ACCEPT_MIME.includes(file.type)) return true;
  return ACCEPT_EXT.test(file.name);
}

async function downsizeFileTo512(file: File): Promise<Uint8Array> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Failed to decode ${file.name}`));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    const maxDim = 512;
    let w = img.width, h = img.height;
    if (w > h && w > maxDim) { h = (h * maxDim) / w; w = maxDim; }
    else if (h > maxDim) { w = (w * maxDim) / h; h = maxDim; }
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("toBlob failed")), "image/jpeg", 0.7);
    });
    const buf = await blob.arrayBuffer();
    return new Uint8Array(buf);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SeedUploadModal({ onClose }: Props) {
  const { addEntries, library } = useTasteLibrary();
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [doneCount, setDoneCount] = useState<number | null>(null);

  const acceptFiles = useCallback((files: File[]) => {
    const valid = files.filter(isValidImage);
    const skipped = files.length - valid.length;
    if (valid.length === 0) {
      setError(`No supported images. Use JPEG or PNG.`);
      return;
    }
    if (valid.length > MAX_FILES) {
      setError(`Pick at most ${MAX_FILES} files. You selected ${valid.length}.`);
      setStaged(valid.slice(0, MAX_FILES));
      return;
    }
    setStaged(valid);
    setError(skipped > 0 ? `Skipped ${skipped} non-image file${skipped > 1 ? "s" : ""}.` : null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hashing) return;
    const files: File[] = [];
    const items = e.dataTransfer.items;
    for (let i = 0; i < items.length; i++) {
      const f = items[i].getAsFile();
      if (f) files.push(f);
    }
    acceptFiles(files);
  }, [acceptFiles, hashing]);

  const handlePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    acceptFiles(Array.from(list));
    e.target.value = "";
  }, [acceptFiles]);

  const handleConfirm = useCallback(async () => {
    if (staged.length < MIN_FILES) {
      setError(`Pick at least ${MIN_FILES} favorites.`);
      return;
    }
    if (staged.length > MAX_FILES) {
      setError(`Pick at most ${MAX_FILES} favorites.`);
      return;
    }
    setError(null);
    setHashing(true);
    setProgress({ done: 0, total: staged.length });
    const existing = new Set(library.entries.map((e) => e.photoHash));
    const entries: TasteEntry[] = [];
    try {
      for (let i = 0; i < staged.length; i++) {
        const file = staged[i];
        try {
          const bytes = await downsizeFileTo512(file);
          const hash = await contentHash(bytes);
          if (!existing.has(hash) && !entries.some((e) => e.photoHash === hash)) {
            entries.push({ photoHash: hash, addedAt: Date.now() });
          }
        } catch (err) {
          console.error(`Failed to process ${file.name}:`, err);
        }
        setProgress({ done: i + 1, total: staged.length });
      }
      addEntries(entries);
      setDoneCount(entries.length);
    } finally {
      setHashing(false);
    }
  }, [staged, library.entries, addEntries]);

  const stagedValid = staged.length >= MIN_FILES && staged.length <= MAX_FILES;

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/90 backdrop-blur-sm flex items-center justify-center"
      onKeyDown={(e) => { if (e.key === "Escape" && !hashing) onClose(); }}
      tabIndex={-1}
      ref={(el: HTMLDivElement | null) => el?.focus()}
    >
      <div className="w-full max-w-2xl bg-surface-bright p-8 md:p-12 max-h-[90vh] overflow-y-auto" style={{ boxShadow: "0 0 60px -15px rgba(0,0,0,0.8)" }}>
        <div className="flex justify-between items-start mb-10">
          <div>
            <div className="mono-label text-[10px] text-primary mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-primary" />
              TASTE LIBRARY
            </div>
            <h1 className="text-4xl serif-italic text-on-surface">
              Seed your favorites
            </h1>
            <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-2">
              Pick {MIN_FILES}–{MAX_FILES} photos that represent how you see
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={hashing}
            aria-label="Close seed upload"
            className="text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {doneCount !== null ? (
          <div className="space-y-6">
            <div className="p-6 bg-surface-low border-l-2 border-primary">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <span className="font-label text-[12px] text-on-surface uppercase tracking-widest font-bold">
                  Library seeded with {doneCount} favorite{doneCount === 1 ? "" : "s"}
                </span>
              </div>
              {doneCount < staged.length && (
                <p className="font-body text-sm text-on-surface-variant mt-2">
                  {staged.length - doneCount} skipped (already in library or failed to decode).
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-full bg-primary text-on-primary py-4 mono-label font-bold text-sm tracking-widest hover:brightness-110 active:scale-[0.98] transition-all"
            >
              DONE
            </button>
          </div>
        ) : (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              role="region"
              aria-label="Drop favorites here"
              tabIndex={0}
              onKeyDown={(e) => { if (!hashing && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); inputRef.current?.click(); } }}
              className="w-full aspect-[16/7] border-2 border-dashed border-outline-variant flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors duration-300 bg-surface-lowest/30 mb-6"
              onClick={() => { if (!hashing) inputRef.current?.click(); }}
            >
              <span className="material-symbols-outlined text-5xl text-outline mb-4 block">photo_library</span>
              <span className="serif-italic text-2xl text-on-surface mb-2">
                {staged.length === 0 ? "Drop favorites here" : `${staged.length} ready`}
              </span>
              <span className="mono-label text-[10px] text-on-surface-variant tracking-[0.2em]">
                JPEG OR PNG · {MIN_FILES}–{MAX_FILES} FRAMES
              </span>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              multiple
              className="hidden"
              onChange={handlePick}
            />

            {staged.length > 0 && !hashing && (
              <div className="mb-6 p-4 bg-surface-low">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                    Selected
                  </span>
                  <span className={`font-label text-[10px] font-bold uppercase tracking-widest ${stagedValid ? "text-primary" : "text-error"}`}>
                    {staged.length} / {MIN_FILES}–{MAX_FILES}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {staged.slice(0, 12).map((f, i) => (
                    <span key={i} className="font-label text-[9px] text-on-surface-variant/70 truncate max-w-[180px]">
                      {f.name}
                    </span>
                  ))}
                  {staged.length > 12 && (
                    <span className="font-label text-[9px] text-on-surface-variant/50">
                      +{staged.length - 12} more
                    </span>
                  )}
                </div>
              </div>
            )}

            {hashing && (
              <div className="mb-6 p-4 bg-surface-low border-l-2 border-primary">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent animate-spin" />
                  <span className="font-label text-[11px] text-on-surface uppercase tracking-widest">
                    Hashing {progress.done} / {progress.total}…
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-6 px-4 py-3 bg-error/10 border-l-2 border-error">
                <span className="mono-label text-[11px] text-error">{error}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={hashing}
                className="flex-1 bg-transparent border border-outline-variant text-on-surface py-4 mono-label text-[12px] uppercase tracking-widest hover:bg-surface-high transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!stagedValid || hashing}
                className="flex-1 bg-primary text-on-primary py-4 mono-label font-bold text-[12px] tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {hashing ? "ADDING…" : "ADD TO LIBRARY"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
