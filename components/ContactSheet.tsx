"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Photo, ProviderConfig, CullResult, DeepResult, Rating,
  ExperienceLevel, CompareResponse, SessionSummary,
} from "@/lib/types";
import { runCull, runDeepReview, runCompare } from "@/lib/api";
import { resolveTier, canProcessPhotos, incrementFreeUsage, getFreeUsage } from "@/lib/tier";
import { runHarness, computeHarnessSummary, downloadHarnessReport } from "@/lib/harness";
import { resizeImage, makeThumb } from "@/lib/resize";
import { isRawFile, isHeicFile } from "@/lib/raw-preview";
import {
  loadProviderConfig, saveProviderConfig, clearProviderConfig,
  loadSessionIndex, saveSession, loadSession, deleteSession,
} from "@/lib/storage";

import Header from "./Header";
import Sidebar from "./Sidebar";
import EmptyState from "./EmptyState";
import ProviderSetup from "./ProviderSetup";
import PhotoGrid from "./PhotoGrid";
import DetailPanel from "./DetailPanel";
import CullBanner from "./CullBanner";
import CompareModal from "./CompareModal";
import ExportModal from "./ExportModal";

type Phase = "empty" | "uploading" | "ready" | "culling" | "culled" | "reviewing" | "reviewed";

export default function ContactSheet() {
  // Clerk — publicMetadata.tier is set by Stripe webhook
  const { user } = useUser();
  const isPro = user?.publicMetadata?.tier === "pro";

  // Provider
  const [config, setConfig] = useState<ProviderConfig | null>(() => loadProviderConfig());

  // Photos & analysis
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cullResults, setCullResults] = useState<Record<number, CullResult>>({});
  const [deepResults, setDeepResults] = useState<Record<number, DeepResult>>({});
  const [deepSelected, setDeepSelected] = useState<Set<number>>(new Set());
  const [curatorialNotes, setCuratorialNotes] = useState<string | null>(null);
  const [recommendedSequence, setRecommendedSequence] = useState<number[] | null>(null);

  // Rating overrides (human > AI)
  const [ratingOverrides, setRatingOverrides] = useState<Record<number, Rating>>({});

  // UI state
  const [phase, setPhase] = useState<Phase>("empty");
  const [level, setLevel] = useState<ExperienceLevel>("enthusiast");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [compareSelected, setCompareSelected] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const processingFiles = useRef(false);
  const [sortBy, setSortBy] = useState<"default" | "score-desc" | "score-asc">("default");
  const [filterRating, setFilterRating] = useState<Rating | "ALL">("ALL");
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [harnessRunning, setHarnessRunning] = useState(false);
  const [harnessProgress, setHarnessProgress] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>(() => loadSessionIndex());
  const sessionIdRef = useRef(crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Prevent browser from opening dropped files ──────────────────────────

  useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault(); };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  // ── Provider setup ──────────────────────────────────────────────────────

  const handleConfigSave = useCallback((c: ProviderConfig) => {
    saveProviderConfig(c);
    setConfig(c);
    setShowSettings(false);
  }, []);

  // ── File handling ───────────────────────────────────────────────────────

  const handleFiles = useCallback(async (files: File[]) => {
    if (processingFiles.current) return;
    processingFiles.current = true;
    setIsDragging(false);
    dragCounter.current = 0;
    setPhase("uploading");
    setError(null);
    setProgressPct(0);
    setProgressMsg(`Processing ${files.length} file${files.length !== 1 ? "s" : ""}…`);

    const imageFiles = files.filter(f => f.type.startsWith("image/") || isRawFile(f));
    const processed: Photo[] = [];

    const skipped: string[] = [];
    for (let i = 0; i < imageFiles.length; i++) {
      setProgressMsg(`Loading ${i + 1} of ${imageFiles.length}…`);
      setProgressPct(Math.round(((i + 1) / imageFiles.length) * 100));
      try {
        const photo = await resizeImage(imageFiles[i]);
        processed.push(photo);
      } catch (err) {
        console.error(`Failed to process ${imageFiles[i].name}:`, err);
        skipped.push(imageFiles[i].name);
      }
    }

    if (processed.length === 0) {
      setError(`No supported images found${skipped.length > 0 ? `. Skipped: ${skipped.join(", ")}` : ""}`);
      setPhase("empty");
      processingFiles.current = false;
      return;
    }

    if (skipped.length > 0) {
      setError(`Skipped ${skipped.length} unsupported file${skipped.length > 1 ? "s" : ""}: ${skipped.join(", ")}`);
    }

    // Deduplicate by filename against existing photos
    setPhotos(prev => {
      const existingNames = new Set(prev.map(p => p.name));
      const unique = processed.filter(p => !existingNames.has(p.name));
      return unique.length > 0 ? [...prev, ...unique] : prev;
    });
    setPhase(Object.keys(cullResults).length > 0 ? "culled" : "ready");
    setProgressMsg("");
    processingFiles.current = false;
  }, [cullResults]);

  // ── Cull ────────────────────────────────────────────────────────────────

  const startCull = useCallback(async (photosToProcess?: Photo[]) => {
    const target = photosToProcess || photos;
    if (target.length === 0) return;

    const tier = resolveTier(config, isPro);
    const gate = canProcessPhotos(tier, target.length);
    if (!gate.canProcess) {
      setError(gate.reason || "Cannot process photos");
      return;
    }

    setPhase("culling");
    setError(null);
    setProgressPct(0);
    setCullResults({});
    setDeepResults({});
    setCuratorialNotes(null);
    setRecommendedSequence(null);

    try {
      const results = await runCull(target, config, (msg, batch, total) => {
        setProgressMsg(msg);
        setProgressPct(Math.round(((batch + 1) / total) * 100));
      });
      setCullResults(results);
      if (tier === "free") incrementFreeUsage(target.length);

      // Auto-select HERO + SELECT for deep review
      const autoSelected = new Set<number>();
      Object.entries(results).forEach(([idx, r]) => {
        if (r.rating === "HERO" || r.rating === "SELECT") {
          autoSelected.add(Number(idx));
        }
      });
      setDeepSelected(autoSelected);

      setPhase("culled");
      setProgressMsg("");

      // Save session
      persistSession(target, results, {}, null, null, false);
    } catch (err: any) {
      setError(err.message || "Cull failed");
      setPhase(Object.keys(cullResults).length > 0 ? "culled" : "empty");
      setProgressMsg("");
    }
  }, [config, photos, isPro]);

  // ── Deep review ─────────────────────────────────────────────────────────

  const startDeepReview = useCallback(async () => {
    const indices = Array.from(deepSelected).sort((a, b) => a - b);
    if (indices.length === 0) return;

    const tier = resolveTier(config, isPro);
    const gate = canProcessPhotos(tier, indices.length);
    if (!gate.canProcess) {
      setError(gate.reason || "Cannot process photos");
      return;
    }

    setPhase("reviewing");
    setError(null);
    setProgressPct(0);

    try {
      const { analyses, curatorialNotes: notes, recommendedSequence: seq } =
        await runDeepReview(photos, indices, config, level, (msg, batch, total) => {
          setProgressMsg(msg);
          setProgressPct(Math.round(((batch + 1) / total) * 100));
        });

      setDeepResults(analyses);
      setCuratorialNotes(notes);
      setRecommendedSequence(seq);
      setPhase("reviewed");
      setProgressMsg("");
      if (tier === "free") incrementFreeUsage(indices.length);

      // Save session
      persistSession(photos, cullResults, analyses, notes, seq, true);
    } catch (err: any) {
      setError(err.message || "Deep review failed");
      setPhase("culled");
      setProgressMsg("");
    }
  }, [config, photos, deepSelected, level, cullResults, isPro]);

  // ── Compare ─────────────────────────────────────────────────────────────

  const handleCompareToggle = useCallback((index: number) => {
    setCompareSelected(prev => {
      if (prev.includes(index)) return prev.filter(i => i !== index);
      if (prev.length >= 2) return [prev[1], index];
      return [...prev, index];
    });
  }, []);

  const startCompare = useCallback(async () => {
    if (compareSelected.length !== 2) return;

    const tier = resolveTier(config, isPro);
    const gate = canProcessPhotos(tier, 2);
    if (!gate.canProcess) {
      setError(gate.reason || "Cannot process photos");
      return;
    }

    setShowCompare(true);
    setCompareLoading(true);
    setCompareResult(null);

    try {
      const result = await runCompare(photos[compareSelected[0]], photos[compareSelected[1]], config);
      setCompareResult(result);
    } catch (err: any) {
      setError(err.message || "Compare failed");
    } finally {
      setCompareLoading(false);
    }
  }, [config, compareSelected, photos, isPro]);

  // ── Deep selection toggle ───────────────────────────────────────────────

  const handleDeepToggle = useCallback((index: number) => {
    setDeepSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // ── Session persistence ─────────────────────────────────────────────────

  const persistSession = useCallback(async (
    sessionPhotos: Photo[],
    cull: Record<number, CullResult>,
    deep: Record<number, DeepResult>,
    notes: string | null,
    seq: number[] | null,
    hasDeep: boolean,
  ) => {
    const thumbs = await Promise.all(sessionPhotos.map(p => makeThumb(p.preview)));
    const heroCount = Object.values(cull).filter(r => r.rating === "HERO").length;
    const selectCount = Object.values(cull).filter(r => r.rating === "SELECT").length;

    saveSession(sessionIdRef.current, {
      id: sessionIdRef.current,
      date: new Date().toISOString().split("T")[0],
      photoCount: sessionPhotos.length,
      heroCount,
      selectCount,
      level,
      hasDeepReview: hasDeep,
      cullResults: cull,
      deepResults: deep,
      curatorialNotes: notes,
      recommendedSequence: seq,
      photos: sessionPhotos.map((p, i) => ({
        name: p.name,
        width: p.width,
        height: p.height,
        thumb: thumbs[i],
        exif: p.exif,
      })),
    });
    setSessions(loadSessionIndex());
  }, [level]);

  const handleRestoreSession = useCallback((id: string) => {
    const data = loadSession(id);
    if (!data) return;

    const restoredPhotos: Photo[] = data.photos.map((p, i) => ({
      id: crypto.randomUUID(),
      base64: null,
      preview: p.thumb || "",
      name: p.name,
      width: p.width,
      height: p.height,
      mediaType: "image/jpeg",
      exif: p.exif,
      isRestored: true,
    }));

    setPhotos(restoredPhotos);
    setCullResults(data.cullResults);
    setDeepResults(data.deepResults);
    setCuratorialNotes(data.curatorialNotes);
    setRecommendedSequence(data.recommendedSequence);
    setLevel(data.level);
    sessionIdRef.current = id;

    const autoSelected = new Set<number>();
    Object.entries(data.cullResults).forEach(([idx, r]) => {
      if (r.rating === "HERO" || r.rating === "SELECT") autoSelected.add(Number(idx));
    });
    setDeepSelected(autoSelected);

    setPhase(data.hasDeepReview ? "reviewed" : "culled");
  }, []);

  // ── Rating override ─────────────────────────────────────────────────────

  const handleRatingOverride = useCallback((index: number, rating: Rating) => {
    setRatingOverrides(prev => ({ ...prev, [index]: rating }));
  }, []);

  // ── Main area drag-and-drop ──────────────────────────────────────────────

  const handleMainDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const items = e.dataTransfer.items;
    const files: File[] = [];

    const processEntry = (entry: FileSystemEntry): Promise<void> => {
      return new Promise((resolve) => {
        if (entry.isFile) {
          (entry as FileSystemFileEntry).file((f) => {
            if (f.type.startsWith("image/") || isRawFile(f)) files.push(f);
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

    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }

    Promise.all(entries.map(processEntry)).then(() => {
      if (files.length > 0) handleFiles(files);
    });
  }, [handleFiles]);

  const handleMainDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (dragCounter.current === 1) setIsDragging(true);
  }, []);

  const handleMainDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleMainDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // ── Sequence map for grid ───────────────────────────────────────────────

  const sequenceMap: Record<number, number> = {};
  if (recommendedSequence) {
    recommendedSequence.forEach((idx, i) => { sequenceMap[idx] = i + 1; });
  }

  // ── Toolbar area (shown when photos exist) ─────────────────────────────

  const showToolbar = photos.length > 0 && phase !== "empty" && phase !== "uploading" && phase !== "ready";
  // Effective rating = override > deep > cull
  const getEffectiveRating = (index: number) => {
    if (ratingOverrides[index]) return ratingOverrides[index];
    if (deepResults[index]) return deepResults[index].rating;
    if (cullResults[index]) return cullResults[index].rating;
    return null;
  };
  const heroCount = photos.reduce((n, _, i) => n + (getEffectiveRating(i) === "HERO" ? 1 : 0), 0);
  const selectCount = photos.reduce((n, _, i) => n + (getEffectiveRating(i) === "SELECT" ? 1 : 0), 0);

  // ── Sort & filter ──────────────────────────────────────────────────────

  const getScore = (index: number) => {
    if (deepResults[index]) return deepResults[index].score;
    if (cullResults[index]) return cullResults[index].score;
    return 0;
  };

  const displayIndices = (() => {
    let indices = photos.map((_, i) => i);

    // Filter
    if (filterRating !== "ALL") {
      indices = indices.filter(i => getEffectiveRating(i) === filterRating);
    }

    // Sort
    if (sortBy === "score-desc") {
      indices.sort((a, b) => getScore(b) - getScore(a));
    } else if (sortBy === "score-asc") {
      indices.sort((a, b) => getScore(a) - getScore(b));
    }

    return indices;
  })();

  // ── Render ──────────────────────────────────────────────────────────────

  // Provider setup — only shown when user explicitly opens settings.
  // Free tier users can proceed without a BYOK config; the API proxy
  // handles them server-side.
  if (showSettings) {
    return <ProviderSetup onSave={handleConfigSave} initial={config} />;
  }

  const tier = resolveTier(config, isPro);
  const freeUsage = tier === "free" ? getFreeUsage() : null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Header
        onHistory={() => {}}
        onSettings={() => setShowSettings(true)}
        onAddFiles={() => fileInputRef.current?.click()}
      />
      <Sidebar phase={phase} />

      {/* Hidden file input for header add button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2,.dng,.pef,.raw"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files).filter(f => f.type.startsWith("image/") || isRawFile(f)) : [];
          if (files.length > 0) handleFiles(files);
          e.target.value = "";
        }}
      />

      {/* Main content */}
      <main
        className={`flex-1 ml-20 pt-16 min-h-screen bg-background overflow-y-auto relative ${
          selectedIndex !== null ? "mr-[420px]" : ""
        }`}
        onDrop={handleMainDrop}
        onDragEnter={handleMainDragEnter}
        onDragLeave={handleMainDragLeave}
        onDragOver={handleMainDragOver}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-20 bg-background/80 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <span className="material-symbols-outlined text-5xl text-primary mb-4 block">add_photo_alternate</span>
              <span className="mono-label text-[12px] text-primary tracking-[0.2em]">DROP TO ADD PHOTOS</span>
            </div>
          </div>
        )}
        {/* Empty state */}
        {phase === "empty" && photos.length === 0 && (
          <EmptyState
            level={level}
            onLevelChange={setLevel}
            onFiles={handleFiles}
            sessions={sessions}
            onRestoreSession={handleRestoreSession}
          />
        )}

        {/* Progress indicator */}
        {(phase === "uploading" || phase === "culling" || phase === "reviewing") && (
          <div className="px-8 py-6">
            <div className="flex items-center justify-between mb-2">
              <span className="mono-label text-[12px] text-primary" style={{ animation: "pulse 1.5s infinite" }}>
                {progressMsg}
              </span>
            </div>
            <div className="h-[2px] w-full bg-surface-high overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{
                  width: phase === "uploading"
                    ? `${progressPct}%`
                    : `${Math.min(progressPct + 40, 99)}%`,
                  transition: phase === "uploading"
                    ? "width 0.3s ease-out"
                    : `width ${progressPct === 0 ? "0.3s" : "20s"} ${progressPct === 0 ? "ease-out" : "cubic-bezier(0.1, 0.5, 0.1, 1)"}`,
                }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-8 mt-4 px-6 py-4 bg-error/10 border-l-2 border-error">
            <div className="flex justify-between items-center">
              <span className="mono-label text-[11px] text-error">{error}</span>
              <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-error hover:text-on-surface transition-colors">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          </div>
        )}

        {/* Ready banner — user uploaded photos, confirm before culling */}
        {phase === "ready" && photos.length > 0 && (
          <div className="mx-8 mt-6 p-6 bg-surface-low border-l-2 border-primary">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-label text-[12px] text-on-surface uppercase tracking-widest mb-1">
                  {photos.length} {photos.length === 1 ? "photo" : "photos"} loaded
                </h3>
                <p className="font-body text-sm text-on-surface-variant">
                  Add more files with the button above, or start the AI cull when ready.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-6">
                {config && config.provider === "anthropic" && (
                  <button
                    onClick={async () => {
                      if (harnessRunning) return;
                      setHarnessRunning(true);
                      setHarnessProgress("Starting harness…");
                      setError(null);
                      try {
                        const report = await runHarness(photos, config, (done, total, name) => {
                          setHarnessProgress(name ? `Harness ${done + 1}/${total} — ${name}` : `Harness complete`);
                        });
                        const summary = computeHarnessSummary(report);
                        downloadHarnessReport(report, summary);
                      } catch (err: any) {
                        setError(err.message || "Harness failed");
                      } finally {
                        setHarnessRunning(false);
                        setHarnessProgress("");
                      }
                    }}
                    disabled={harnessRunning}
                    title={`Dev: variance harness — ${photos.length} photos × 5 runs × 2 resolutions = ${photos.length * 10} API calls`}
                    className="px-4 py-3 font-label text-[11px] uppercase tracking-widest text-on-surface-variant hover:text-primary hover:bg-surface-high transition-colors flex items-center gap-2 border border-outline-variant disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">science</span>
                    {harnessRunning ? harnessProgress : "HARNESS"}
                  </button>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-3 font-label text-[11px] uppercase tracking-widest bg-surface-high text-on-surface hover:bg-surface-bright transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">add_photo_alternate</span>
                  ADD MORE
                </button>
                <button
                  onClick={() => startCull()}
                  className="px-6 py-3 font-label text-[11px] font-bold uppercase tracking-widest bg-primary text-on-primary hover:bg-primary-dim transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">auto_awesome_motion</span>
                  START CULL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        {showToolbar && (
          <div className="px-8 py-6 flex justify-between items-center bg-surface-low/50 backdrop-blur-xs sticky top-0 z-30">
            <div className="flex gap-4">
              {heroCount > 0 && (
                <div className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest bg-surface-highest px-3 py-2 border-l-2 border-primary">
                  <span className="text-on-surface-variant">Heroes:</span>
                  <span className="text-primary font-bold">{heroCount}</span>
                </div>
              )}
              {selectCount > 0 && (
                <div className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest bg-surface-highest px-3 py-2 border-l-2 border-secondary">
                  <span className="text-on-surface-variant">Selects:</span>
                  <span className="text-secondary font-bold">{selectCount}</span>
                </div>
              )}
              {compareSelected.length === 2 && (
                <button
                  onClick={startCompare}
                  className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest bg-primary text-on-primary px-3 py-2 hover:bg-primary-dim transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">compare_arrows</span>
                  COMPARE
                </button>
              )}
            </div>
            {/* Sort & Filter */}
            <div className="flex items-center gap-3">
              {/* Filter by rating */}
              {(["ALL", "HERO", "SELECT", "MAYBE", "CUT"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setFilterRating(r)}
                  className={`font-label text-[10px] px-2 py-1 uppercase tracking-widest transition-colors ${
                    filterRating === r
                      ? r === "ALL" ? "bg-surface-highest text-on-surface" : r === "HERO" ? "bg-primary/20 text-primary" : r === "SELECT" ? "bg-secondary/20 text-secondary" : r === "CUT" ? "bg-error/20 text-error" : "bg-surface-highest text-on-surface-variant"
                      : "text-on-surface-variant/50 hover:text-on-surface-variant"
                  }`}
                >
                  {r}
                </button>
              ))}

              <span className="text-outline-variant mx-1">|</span>

              {/* Sort */}
              <button
                onClick={() => setSortBy(sortBy === "score-desc" ? "score-asc" : sortBy === "score-asc" ? "default" : "score-desc")}
                className="flex items-center gap-1 font-label text-[10px] text-on-surface-variant hover:text-on-surface transition-colors uppercase tracking-widest px-2 py-1"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {sortBy === "score-desc" ? "arrow_downward" : sortBy === "score-asc" ? "arrow_upward" : "swap_vert"}
                </span>
                {sortBy === "default" ? "SCORE" : sortBy === "score-desc" ? "HIGH→LOW" : "LOW→HIGH"}
              </button>
            </div>

            <div className="flex items-center gap-4">
              {(phase === "culled" || phase === "reviewed") && (
                <button
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest bg-surface-high text-on-surface px-3 py-2 hover:bg-surface-bright transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  EXPORT
                </button>
              )}
              {/* Dev: Variance Harness */}
              {config && photos.length > 0 && config.provider === "anthropic" && (
                <button
                  onClick={async () => {
                    if (harnessRunning) return;
                    setHarnessRunning(true);
                    setHarnessProgress("Starting harness…");
                    setError(null);
                    try {
                      const report = await runHarness(photos, config, (done, total, name) => {
                        setHarnessProgress(name ? `Harness ${done + 1}/${total} — ${name}` : `Harness complete`);
                      });
                      const summary = computeHarnessSummary(report);
                      downloadHarnessReport(report, summary);
                    } catch (err: any) {
                      setError(err.message || "Harness failed");
                    } finally {
                      setHarnessRunning(false);
                      setHarnessProgress("");
                    }
                  }}
                  disabled={harnessRunning}
                  title={`Run variance harness: ${photos.length} photos × 5 runs × 2 resolutions = ${photos.length * 10} API calls`}
                  className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors px-2 py-2"
                >
                  <span className="material-symbols-outlined text-[16px]">science</span>
                  {harnessRunning ? harnessProgress : "HARNESS"}
                </button>
              )}
              <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-tighter">
                <span className="text-on-surface font-bold">{displayIndices.length}</span>{filterRating !== "ALL" ? `/${photos.length}` : ""} Photos
              </div>
              {tier === "free" && freeUsage && (
                <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                  <span className="text-on-surface font-bold">{freeUsage.remaining}</span> of {freeUsage.limit} free photos remaining
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cull banner — always show after cull so user can trigger deep review */}
        {phase === "culled" && (
          <CullBanner deepCount={deepSelected.size} onStartDeepReview={startDeepReview} />
        )}

        {/* Curatorial notes banner (after deep review) */}
        {phase === "reviewed" && curatorialNotes && (
          <div className="mx-8 mt-4 p-6 bg-surface-low border-l-2 border-primary">
            <h3 className="font-label text-[11px] text-primary uppercase tracking-widest mb-3">CURATORIAL NOTES</h3>
            <p className="font-body text-sm text-on-surface/80 leading-relaxed italic">{curatorialNotes}</p>
          </div>
        )}

        {/* Photo grid */}
        {photos.length > 0 && (
          <PhotoGrid
            photos={photos}
            cullResults={cullResults}
            deepResults={deepResults}
            deepSelected={deepSelected}
            compareSelected={compareSelected}
            selectedIndex={selectedIndex}
            phase={phase}
            ratingOverrides={ratingOverrides}
            displayIndices={displayIndices}
            onSelect={setSelectedIndex}
            onCompareToggle={handleCompareToggle}
            onDeepToggle={handleDeepToggle}
            sequenceMap={sequenceMap}
          />
        )}

      </main>

      {/* Detail panel */}
      {selectedIndex !== null && (
        <DetailPanel
          photo={photos[selectedIndex] || null}
          cull={cullResults[selectedIndex] || null}
          deep={deepResults[selectedIndex] || null}
          ratingOverride={ratingOverrides[selectedIndex] || null}
          config={config}
          onRatingOverride={(rating) => handleRatingOverride(selectedIndex!, rating)}
          onClose={() => setSelectedIndex(null)}
        />
      )}

      {/* Compare modal */}
      {showCompare && compareSelected.length === 2 && (
        <CompareModal
          photoA={photos[compareSelected[0]]}
          photoB={photos[compareSelected[1]]}
          result={compareResult}
          loading={compareLoading}
          onConfirm={() => { setShowCompare(false); setCompareSelected([]); setCompareResult(null); }}
          onKeepBoth={() => { setShowCompare(false); setCompareSelected([]); setCompareResult(null); }}
          onClose={() => { setShowCompare(false); setCompareResult(null); }}
        />
      )}

      {/* Export modal */}
      {showExport && (
        <ExportModal
          photos={photos}
          cullResults={cullResults}
          deepResults={deepResults}
          curatorialNotes={curatorialNotes}
          recommendedSequence={recommendedSequence}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
