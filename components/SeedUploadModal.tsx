"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { TasteEntry, contentHash, generateTasteProfile, getTasteLibraryClient } from "@/lib/taste-library";
import { bucketDelta } from "@/lib/overrides";
import { useTasteLibrary } from "@/hooks/useTasteLibrary";
import { useOverrides } from "@/hooks/useOverrides";
import type { OverrideEntry } from "@/lib/overrides";
import type { Rating } from "@/lib/types";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const REGEN_THROTTLE_MS = 12 * 60 * 60 * 1000; // 12 hours

interface Props {
  onClose: () => void;
  mode?: "manage" | "view";
}

const MIN_FILES = 8;
const MAX_FILES = 20;
const ACCEPT_MIME = ["image/jpeg", "image/jpg", "image/png"];
const ACCEPT_EXT = /\.(jpe?g|png)$/i;

function isValidImage(file: File): boolean {
  if (ACCEPT_MIME.includes(file.type)) return true;
  return ACCEPT_EXT.test(file.name);
}

async function downsizeFileTo512(file: File): Promise<{ bytes: Uint8Array; base64: string }> {
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
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { bytes, base64: btoa(bin) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SeedUploadModal({ onClose, mode = "manage" }: Props) {
  const isViewOnly = mode === "view";
  const { addEntries, library, setProfile, setLastRegenAt } = useTasteLibrary();
  const { user } = useUser();
  const isPro = user?.publicMetadata?.tier === "pro";
  const inputRef = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hashing, setHashing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const [profileStatus, setProfileStatus] = useState<"idle" | "generating" | "done" | "skipped" | "error">("idle");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [regenPending, setRegenPending] = useState(false);

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
    const processEntry = (entry: FileSystemEntry): Promise<void> => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          (entry as FileSystemFileEntry).file((f) => {
            if (isValidImage(f)) files.push(f);
            resolve();
          });
        } else if (entry.isDirectory) {
          const reader = (entry as FileSystemDirectoryEntry).createReader();
          reader.readEntries(async (entries) => {
            await Promise.all(entries.map(processEntry));
            resolve();
          });
        } else {
          resolve();
        }
      });
    };

    const items = e.dataTransfer.items;
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }

    Promise.all(entries.map(processEntry)).then(() => {
      acceptFiles(files);
    });
  }, [acceptFiles, hashing]);

  const handlePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    acceptFiles(Array.from(list));
    e.target.value = "";
  }, [acceptFiles]);

  const { store: overridesStore, remove: removeOverride } = useOverrides();
  const correctionEntries = [...overridesStore.entries].sort((a, b) => b.timestamp - a.timestamp);
  const correctionSignalCount = correctionEntries.filter((e) => e.shortDescription.trim().length > 0).length;
  // Corrections added/changed after the last profile regen still need a fresh
  // regen to actually shape the AI's read. Surface that pending state honestly.
  const lastRegenAt = library.lastRegenAt ?? 0;
  const pendingCorrectionCount = correctionEntries.filter(
    (e) => e.shortDescription.trim().length > 0 && e.timestamp > lastRegenAt,
  ).length;

  const runProfileGeneration = useCallback(async () => {
    if (!isPro) {
      setProfileStatus("skipped");
      setProfileMsg("Pro tier required to generate a taste profile.");
      return;
    }
    setProfileStatus("generating");
    setProfileMsg(null);
    try {
      // Re-read storage to include just-added entries even if hook state hasn't re-rendered yet.
      const fresh = getTasteLibraryClient();
      const { profile, coherence, usedEntryCount } = await generateTasteProfile(fresh, overridesStore.entries);
      if (profile) {
        setProfile(profile);
        setLastRegenAt(Date.now());
        setProfileStatus("done");
        setProfileMsg(`Profile generated from ${usedEntryCount} favorites.`);
      } else {
        setLastRegenAt(Date.now());
        setProfileStatus("skipped");
        setProfileMsg(coherence === "low"
          ? "Set lacks consistent taste signal — no profile generated. Add more cohesive favorites."
          : "Profile generation returned no usable tags.");
      }
    } catch (err: any) {
      setProfileStatus("error");
      setProfileMsg(err?.message || "Profile generation failed.");
    }
  }, [isPro, library, setProfile, setLastRegenAt]);

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
          const { bytes, base64 } = await downsizeFileTo512(file);
          const hash = await contentHash(bytes);
          if (!existing.has(hash) && !entries.some((e) => e.photoHash === hash)) {
            entries.push({ photoHash: hash, addedAt: Date.now(), image: base64 });
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

  // Auto-trigger generation right after seeding, once doneCount lands and library has entries-with-images.
  useEffect(() => {
    if (doneCount === null) return;
    if (profileStatus !== "idle") return;
    const usable = library.entries.filter((e) => !!e.image).length;
    if (usable < 4) {
      setProfileStatus("skipped");
      setProfileMsg(`Need at least 4 favorites with image data; have ${usable}.`);
      return;
    }
    runProfileGeneration();
  }, [doneCount, profileStatus, library.entries, runProfileGeneration]);


  const handleManualRegen = useCallback(async () => {
    if (regenPending) return;
    const last = library.lastRegenAt ?? 0;
    // Throttle protects against unnecessary Sonnet calls, but pending
    // corrections are a legit reason to regen — they don't shape scoring
    // until the profile is rebuilt, so blocking would defeat the loop.
    if (Date.now() - last < REGEN_THROTTLE_MS && pendingCorrectionCount === 0) {
      const wait = Math.ceil((REGEN_THROTTLE_MS - (Date.now() - last)) / (60 * 60 * 1000));
      setProfileStatus("error");
      setProfileMsg(`Manual regen throttled — try again in ~${wait}h, or make a new correction to apply pending changes.`);
      return;
    }
    setRegenPending(true);
    try {
      await runProfileGeneration();
    } finally {
      setRegenPending(false);
    }
  }, [regenPending, library.lastRegenAt, pendingCorrectionCount, runProfileGeneration]);

  const usableEntryCount = library.entries.filter((e) => !!e.image).length;
  const canManualRegen = isPro && usableEntryCount >= 4 && doneCount === null;

  const stagedValid = staged.length >= MIN_FILES && staged.length <= MAX_FILES;

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/90 backdrop-blur-sm flex items-center justify-center"
      onKeyDown={(e) => { if (e.key === "Escape" && !hashing) onClose(); }}
      onDragEnter={(e) => e.stopPropagation()}
      onDragLeave={(e) => e.stopPropagation()}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
      tabIndex={-1}
      ref={(el: HTMLDivElement | null) => el?.focus()}
    >
      <div className="w-full max-w-2xl bg-surface-bright p-8 md:p-12 max-h-[90vh] overflow-y-auto" style={{ boxShadow: "0 0 60px -15px rgba(0,0,0,0.8)" }}>
        <div className="flex justify-between items-start mb-10">
          <div>
            <div className="mono-label text-[10px] text-primary mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-primary" />
              {isViewOnly ? "TASTE PROFILE" : "TASTE LIBRARY"}
            </div>
            <h1 className="text-4xl serif-italic text-on-surface">
              {isViewOnly ? "Your taste profile" : "Seed your favorites"}
            </h1>
            <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-2">
              {isViewOnly
                ? "How future culls read your eye"
                : `Pick ${MIN_FILES}–${MAX_FILES} photos that represent how you see`}
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

            {/* Profile generation status */}
            {profileStatus === "generating" && (
              <div className="p-5 bg-surface-low border-l-2 border-primary flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent animate-spin" />
                <span className="font-label text-[11px] text-on-surface uppercase tracking-widest">
                  Generating taste profile…
                </span>
              </div>
            )}
            {profileStatus === "done" && (
              <div className="p-5 bg-surface-low border-l-2 border-primary">
                <div className="font-label text-[11px] text-primary uppercase tracking-widest mb-2 font-bold">
                  Taste profile ready
                </div>
                <p className="font-body text-sm text-on-surface/80">{profileMsg}</p>
              </div>
            )}
            {profileStatus === "skipped" && (
              <div className="p-5 bg-surface-low border-l-2 border-outline-variant">
                <p className="font-body text-sm text-on-surface-variant">{profileMsg}</p>
              </div>
            )}
            {profileStatus === "error" && (
              <div className="p-5 bg-error/10 border-l-2 border-error">
                <p className="font-body text-sm text-error">{profileMsg}</p>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full bg-primary text-on-primary py-4 mono-label font-bold text-sm tracking-widest hover:brightness-110 active:scale-[0.98] transition-all"
            >
              DONE
            </button>
          </div>
        ) : (
          <>
            {!isViewOnly && (<>
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
            </>)}

            {/* Manual regen — only when library already has usable entries and Pro */}
            {canManualRegen && (
              <div className={isViewOnly ? "" : "mt-6 pt-6 border-t border-outline-variant/30"}>
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <div className="font-label text-[11px] text-on-surface uppercase tracking-widest font-bold">
                      Existing profile
                    </div>
                    <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                      {library.currentProfile
                        ? `${library.currentProfile.aestheticTags.length} tags · from ${library.currentProfile.generatedFromEntryCount} favorites${correctionSignalCount > 0 ? ` + ${correctionSignalCount} correction${correctionSignalCount === 1 ? "" : "s"}` : ""}`
                        : "No profile yet"}
                      {library.lastRegenAt && ` · last run ${new Date(library.lastRegenAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <button
                    onClick={handleManualRegen}
                    disabled={regenPending || profileStatus === "generating"}
                    className="px-4 py-2 font-label text-[10px] uppercase tracking-widest bg-surface-high text-on-surface hover:bg-surface-bright transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[14px]">refresh</span>
                    {profileStatus === "generating" || regenPending ? "REGENERATING…" : "REGENERATE PROFILE"}
                  </button>
                </div>
                {profileStatus === "done" && profileMsg && (
                  <p className="font-body text-[11px] text-primary mt-2">{profileMsg}</p>
                )}
                {profileStatus === "error" && profileMsg && (
                  <p className="font-body text-[11px] text-error mt-2">{profileMsg}</p>
                )}
                {profileStatus === "skipped" && profileMsg && (
                  <p className="font-body text-[11px] text-on-surface-variant mt-2">{profileMsg}</p>
                )}

                {library.currentProfile && (
                  <div className="mt-5 space-y-3">
                    <p className="font-body text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                      {library.currentProfile.prose}
                    </p>
                    {library.currentProfile.aestheticTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {library.currentProfile.aestheticTags.map((tag) => (
                          <span
                            key={tag}
                            className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest px-2 py-1 bg-surface-high"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {correctionEntries.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-outline-variant/30">
                    <div className="mb-3">
                      <div className="font-label text-[11px] text-on-surface uppercase tracking-widest font-bold">
                        Corrections feeding this profile
                      </div>
                      <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                        {correctionEntries.length} {correctionEntries.length === 1 ? "signal" : "signals"}
                        {pendingCorrectionCount > 0 && (
                          <span className="text-primary">
                            {" · "}{pendingCorrectionCount} pending — regen to apply
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {correctionEntries.map((e: OverrideEntry) => {
                        const delta = bucketDelta(e.originalRating, e.userRating);
                        const isBoost = delta > 0;
                        const absDelta = Math.abs(delta);
                        const directionLabel = isBoost ? "Boost" : "Demote";
                        const directionIcon = isBoost ? "north_east" : "south_east";
                        const directionClass = isBoost ? "text-primary" : "text-error";
                        const isPending = e.timestamp > lastRegenAt;
                        return (
                          <div
                            key={e.photoHash + e.timestamp}
                            className="flex items-start gap-3 p-3 bg-surface-low border-l-2 border-outline-variant"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                                <span className={`flex items-center gap-1 font-label text-[10px] uppercase tracking-widest font-bold ${directionClass}`}>
                                  <span className="material-symbols-outlined text-[12px]">{directionIcon}</span>
                                  {directionLabel}
                                </span>
                                <span className="font-label text-[10px] text-on-surface-variant">·</span>
                                <span className="px-1.5 py-0.5 bg-surface-high text-on-surface font-label text-[9px] uppercase tracking-widest">
                                  {e.sessionIntent}
                                </span>
                                <span className="font-label text-[10px] text-on-surface-variant">·</span>
                                <span className="font-mono text-[10px] text-on-surface">
                                  {e.originalRating} → <span className={`font-bold ${directionClass}`}>{e.userRating}</span>
                                </span>
                                <span className="font-label text-[10px] text-on-surface-variant">·</span>
                                <span className="font-label text-[10px] text-on-surface-variant">
                                  {isBoost ? "+" : "−"}{absDelta} {absDelta === 1 ? "bucket" : "buckets"}
                                </span>
                                {isPending && (
                                  <span className="font-label text-[9px] uppercase tracking-widest text-primary">
                                    · pending
                                  </span>
                                )}
                              </div>
                              <div className="font-body text-[11px] text-on-surface-variant italic leading-snug">
                                {e.shortDescription || <span className="opacity-60">Describing…</span>}
                              </div>
                              <div className="font-label text-[9px] uppercase tracking-widest text-on-surface-variant/70 mt-1">
                                {relativeTime(e.timestamp)}
                              </div>
                            </div>
                            <button
                              onClick={() => removeOverride(e.photoHash)}
                              aria-label="Delete correction"
                              title="Delete this correction"
                              className="text-on-surface-variant hover:text-error transition-colors flex-shrink-0 p-1"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isViewOnly && (
              <button
                onClick={onClose}
                className="mt-8 w-full bg-primary text-on-primary py-4 mono-label font-bold text-sm tracking-widest hover:brightness-110 active:scale-[0.98] transition-all"
              >
                CLOSE
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
