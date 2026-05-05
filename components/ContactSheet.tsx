"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Photo, ProviderConfig, CullResult, DeepResult, Rating,
  ExperienceLevel, CompareResponse, SessionSummary, IntentPreset,
} from "@/lib/types";
import { runCull, runDeepReview, runCompare } from "@/lib/api";
import { useTasteLibrary } from "@/hooks/useTasteLibrary";
import { useOverrides } from "@/hooks/useOverrides";
import { generateTasteProfile } from "@/lib/taste-library";
import { computePhotoHash } from "@/lib/photo-hash";
import { loadSessionIntent, saveSessionIntent } from "@/lib/session-intent";
import { isE2EMockPro } from "@/lib/e2e";
import { CULL_BATCH_SIZE, DEEP_BATCH_SIZE } from "@/lib/constants";
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
import CullProgress from "./CullProgress";
import IntentPicker from "./IntentPicker";
import CompareModal from "./CompareModal";
import ExportModal from "./ExportModal";
import SessionsModal from "./SessionsModal";

type Phase = "empty" | "uploading" | "ready" | "culling" | "culled" | "reviewing" | "reviewed";

export default function ContactSheet() {
  // Clerk — publicMetadata.tier is set by Stripe webhook
  const { user } = useUser();
  const isPro = isE2EMockPro() || user?.publicMetadata?.tier === "pro";

  // Taste library (Pro-only profile injection — soft bias under intent)
  const {
    library: tasteLibrary,
    collection: tasteCollection,
    activeId: activeTasteProfileId,
    setActiveId: setActiveTasteProfileId,
    setProfile: setTasteProfile,
    setLastRegenAt: setTasteLastRegenAt,
  } = useTasteLibrary();
  const { store: overridesStore, add: addOverride, remove: removeOverride } = useOverrides();

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

  // Session intent (sticky per browser tab via sessionStorage)
  const [intentPreset, setIntentPreset] = useState<IntentPreset | null>(null);
  const [intentFreeForm, setIntentFreeForm] = useState<string>("");

  // Per-cull opt-out from taste profile (resets after each cull starts)
  const [ignoreTasteProfile, setIgnoreTasteProfile] = useState(false);

  // Taste profile regen status (used to gate cull while auto-regen runs)
  const [regenStatus, setRegenStatus] = useState<"idle" | "generating">("idle");

  // Override toast — fires on every override with an Undo affordance.
  // First fire per browser shows expanded educational copy; subsequent fires
  // are short. The toast carries enough state to revert the last action.
  const [overrideToast, setOverrideToast] = useState<{
    photoHash: string;
    index: number;
    prevRating: Rating | undefined;
    isFirst: boolean;
  } | null>(null);
  const overrideToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Star toast — fires on every taste-library add. First fire per browser
  // gets the longer educational copy (mirrors the override toast pattern).
  const [starToast, setStarToast] = useState<{ isFirst: boolean } | null>(null);
  const starToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate intent from sessionStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const saved = loadSessionIntent();
    if (saved) {
      setIntentPreset(saved.preset);
      setIntentFreeForm(saved.freeForm || "");
    }
  }, []);

  // Listen for taste library additions and surface a toast so the user knows
  // the star has the same downstream impact as a correction (feeds regen).
  useEffect(() => {
    const onAdded = () => {
      const isFirst = !localStorage.getItem("cs-star-toast-seen");
      if (isFirst) localStorage.setItem("cs-star-toast-seen", "1");
      if (starToastTimerRef.current) clearTimeout(starToastTimerRef.current);
      setStarToast({ isFirst });
      starToastTimerRef.current = setTimeout(
        () => setStarToast(null),
        isFirst ? 7000 : 4000,
      );
    };
    window.addEventListener("cs-taste-library-entry-added", onAdded);
    return () => window.removeEventListener("cs-taste-library-entry-added", onAdded);
  }, []);

  const handleIntentPreset = useCallback((p: IntentPreset) => {
    setIntentPreset(p);
    saveSessionIntent({ preset: p, freeForm: intentFreeForm });
  }, [intentFreeForm]);

  const handleIntentFreeForm = useCallback((text: string) => {
    setIntentFreeForm(text);
    if (intentPreset) saveSessionIntent({ preset: intentPreset, freeForm: text });
  }, [intentPreset]);

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
  const [showSessions, setShowSessions] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const processingFiles = useRef(false);
  const [sortBy, setSortBy] = useState<"default" | "score-desc" | "score-asc">("default");
  const [filterRating, setFilterRating] = useState<Rating | "ALL">("ALL");
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [progressDone, setProgressDone] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
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

  // ── Auto-regen taste profile (fire-and-forget) ─────────────────────────

  const maybeAutoRegenProfile = useCallback(() => {
    if (!isPro) return;
    const usable = tasteLibrary.entries.filter(e => !!e.image);
    const FLOOR = 8;
    const DELTA_TRIGGER = 5;
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (usable.length < FLOOR) return;
    const baseline = tasteLibrary.currentProfile?.generatedFromEntryCount ?? 0;
    const delta = usable.length - baseline;
    if (delta < DELTA_TRIGGER) return;
    const last = tasteLibrary.lastRegenAt ?? 0;
    if (Date.now() - last < SEVEN_DAYS) return;

    // Fire-and-forget; surface state via regenStatus so user can wait if needed.
    setRegenStatus("generating");
    generateTasteProfile(tasteLibrary, overridesStore.entries)
      .then(({ profile }) => {
        if (profile) setTasteProfile(profile);
        setTasteLastRegenAt(Date.now());
      })
      .catch((err) => {
        console.warn("Auto-regen taste profile failed:", err?.message || err);
      })
      .finally(() => {
        setRegenStatus("idle");
      });
  }, [isPro, tasteLibrary, overridesStore.entries, setTasteProfile, setTasteLastRegenAt]);

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
    setProgressDone(0);
    setProgressTotal(target.length);
    setCullResults({});
    setDeepResults({});
    setCuratorialNotes(null);
    setRecommendedSequence(null);

    // Auto-regen taste profile if drift threshold + throttle allow (fire-and-forget).
    maybeAutoRegenProfile();

    try {
      const effectiveIntent = intentPreset
        ? { preset: intentPreset, freeForm: intentFreeForm.trim() || undefined }
        : { preset: "mixed" as IntentPreset };
      const profile = !ignoreTasteProfile && tasteLibrary.currentProfile
        ? {
            prose: tasteLibrary.currentProfile.prose,
            aestheticTags: tasteLibrary.currentProfile.aestheticTags,
            libraryPhotoHashes: tasteLibrary.entries.map(e => e.photoHash),
          }
        : null;
      const results = await runCull(target, config, effectiveIntent, (msg, batch, total) => {
        setProgressMsg(msg);
        setProgressPct(Math.round(((batch + 1) / total) * 100));
        setProgressDone(Math.min(batch * CULL_BATCH_SIZE, target.length));
      }, profile);
      setProgressDone(target.length);
      setCullResults(results);
      if (tier === "free") incrementFreeUsage(target.length);

      // Auto-select HERO + SELECT for shortlist development
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
  }, [config, photos, isPro, intentPreset, intentFreeForm, tasteLibrary.currentProfile, tasteLibrary.entries, ignoreTasteProfile, maybeAutoRegenProfile]);

  // ── Shortlist development ───────────────────────────────────────────────

  const startDeepReview = useCallback(async () => {
    const indices = Array.from(deepSelected).sort((a, b) => a - b);
    if (indices.length === 0) return;

    if (indices.some(i => !photos[i]?.base64)) {
      setError("Restored sessions can't build new editor's notes — re-import the originals.");
      return;
    }

    const tier = resolveTier(config, isPro);
    const gate = canProcessPhotos(tier, indices.length);
    if (!gate.canProcess) {
      setError(gate.reason || "Cannot process photos");
      return;
    }

    setPhase("reviewing");
    setError(null);
    setProgressPct(0);
    setProgressDone(0);
    setProgressTotal(indices.length);

    try {
      const effectiveIntent = intentPreset
        ? { preset: intentPreset, freeForm: intentFreeForm.trim() || undefined }
        : { preset: "mixed" as IntentPreset };
      const profile = !ignoreTasteProfile && tasteLibrary.currentProfile
        ? { prose: tasteLibrary.currentProfile.prose, aestheticTags: tasteLibrary.currentProfile.aestheticTags }
        : null;
      const { analyses, curatorialNotes: notes, recommendedSequence: seq } =
        await runDeepReview(photos, indices, config, level, effectiveIntent, (msg, batch, total) => {
          setProgressMsg(msg);
          setProgressPct(Math.round(((batch + 1) / total) * 100));
          setProgressDone(Math.min(batch * DEEP_BATCH_SIZE, indices.length));
        }, profile);
      setProgressDone(indices.length);

      setDeepResults(analyses);
      setCuratorialNotes(notes);
      setRecommendedSequence(seq);
      setPhase("reviewed");
      setProgressMsg("");
      if (tier === "free") incrementFreeUsage(indices.length);

      // Save session
      persistSession(photos, cullResults, analyses, notes, seq, true);
    } catch (err: any) {
      setError(err.message || "Shortlist development failed");
      setPhase("culled");
      setProgressMsg("");
    }
  }, [config, photos, deepSelected, level, cullResults, isPro, intentPreset, intentFreeForm, tasteLibrary.currentProfile, ignoreTasteProfile]);

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

    if (compareSelected.some(i => !photos[i]?.base64)) {
      setError("Restored sessions can't run new compare — re-import the originals.");
      return;
    }

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
    const prevRating = ratingOverrides[index];
    const cull = cullResults[index];
    const photo = photos[index];
    const syncShortlistSelection = (effectiveRating: Rating) => {
      setDeepSelected(prev => {
        const next = new Set(prev);
        if (effectiveRating === "HERO" || effectiveRating === "SELECT") {
          next.add(index);
        } else {
          next.delete(index);
        }
        return next;
      });
    };

    // User reverted to the AI's original rating — clean up any saved
    // override for this frame so it stops weighting future culls and stops
    // rendering as a correction locally.
    if (cull?.rating === rating) {
      setRatingOverrides(prev => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      if (photo?.base64) {
        computePhotoHash(photo)
          .then(({ hash }) => removeOverride(hash))
          .catch(() => { /* hash failure is harmless here */ });
      }
      syncShortlistSelection(cull.rating);
      return;
    }

    setRatingOverrides(prev => ({ ...prev, [index]: rating }));
    syncShortlistSelection(rating);

    // Capture the correction as a signal feeding the taste-profile regen
    // (Phase D). shortDescription is filled in by the describe call below; an
    // empty description is dropped at regen time, so the entry is harmless
    // until the description lands.
    if (!cull || !photo || !intentPreset) return;
    if (!photo.base64) return; // restored sessions: no pixels to hash

    computePhotoHash(photo).then(async ({ hash, image }) => {
      const baseEntry = {
        photoHash: hash,
        shortDescription: "",
        sessionIntent: intentPreset,
        originalScore: cull.score,
        originalRating: cull.rating,
        userRating: rating,
        timestamp: Date.now(),
      };
      addOverride(baseEntry);

      // Fire toast every override; first-fire per browser gets expanded copy.
      const isFirst = typeof window !== "undefined"
        && !localStorage.getItem("cs-overrides-toast-seen");
      if (typeof window !== "undefined" && isFirst) {
        localStorage.setItem("cs-overrides-toast-seen", "1");
      }
      if (overrideToastTimerRef.current) clearTimeout(overrideToastTimerRef.current);
      setOverrideToast({ photoHash: hash, index, prevRating, isFirst });
      overrideToastTimerRef.current = setTimeout(
        () => setOverrideToast(null),
        isFirst ? 7000 : 4000,
      );

      // Backfill shortDescription via tiny model call (Pro-gated server-side).
      try {
        const res = await fetch("/api/override-describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (typeof json?.description === "string" && json.description) {
          addOverride({ ...baseEntry, shortDescription: json.description });
        }
      } catch {
        // describe is best-effort; entries without a description are filtered
        // out at regen time, so the correction is silent until the call returns
      }
    }).catch(() => { /* hash failure shouldn't block UI override */ });
  }, [cullResults, photos, intentPreset, addOverride, removeOverride, ratingOverrides]);

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
  const isRestoredSession = photos.length > 0 && photos.every(p => p.isRestored);
  // Effective rating = override > cull. Editor notes are secondary metadata.
  const getEffectiveRating = (index: number) => {
    if (ratingOverrides[index]) return ratingOverrides[index];
    if (cullResults[index]) return cullResults[index].rating;
    if (deepResults[index]) return deepResults[index].rating;
    return null;
  };
  const heroCount = photos.reduce((n, _, i) => n + (getEffectiveRating(i) === "HERO" ? 1 : 0), 0);
  const selectCount = photos.reduce((n, _, i) => n + (getEffectiveRating(i) === "SELECT" ? 1 : 0), 0);

  // ── Sort & filter ──────────────────────────────────────────────────────

  const getScore = (index: number) => {
    if (cullResults[index]) return cullResults[index].score;
    if (deepResults[index]) return deepResults[index].score;
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
    return <ProviderSetup onSave={handleConfigSave} initial={config} onCancel={() => setShowSettings(false)} />;
  }

  const tier = resolveTier(config, isPro);
  const allowMultipleTasteProfiles = tier === "pro" || tier === "byok";
  const freeUsage = tier === "free" ? getFreeUsage() : null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Header
        onHistory={() => setShowSessions(true)}
        onSettings={() => setShowSettings(true)}
        onAddFiles={() => fileInputRef.current?.click()}
        allowMultipleProfiles={allowMultipleTasteProfiles}
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
            onOpenSettings={() => setShowSettings(true)}
            allowMultipleProfiles={allowMultipleTasteProfiles}
          />
        )}

        {/* Progress indicator — shimmer + cycling photography phrases */}
        {(phase === "uploading" || phase === "culling" || phase === "reviewing") && (
          <CullProgress
            phase={phase}
            statusMsg={progressMsg}
            done={progressDone}
            total={progressTotal}
          />
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
          <div className="mx-8 mt-6 p-6 bg-surface-low border-l-2 border-primary space-y-6">
            <div className="flex justify-between items-start gap-6">
              <div>
                <h3 className="font-label text-[12px] text-on-surface uppercase tracking-widest mb-1">
                  {photos.length} {photos.length === 1 ? "photo" : "photos"} loaded
                </h3>
                <p className="font-body text-sm text-on-surface-variant">
                  Pick an intent below, then start the cull.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
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
                  disabled={regenStatus === "generating"}
                  title={regenStatus === "generating" ? "Generating your taste profile…" : undefined}
                  className="px-6 py-3 font-label text-[11px] font-bold uppercase tracking-widest bg-primary text-on-primary hover:bg-primary-dim transition-colors flex items-center gap-2 disabled:bg-surface-high disabled:text-on-surface-variant disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[16px]">auto_awesome_motion</span>
                  START CULL
                </button>
              </div>
            </div>

            {regenStatus === "generating" && (
              <div className="mt-3 flex items-center justify-end gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                <span className="font-label text-[11px] uppercase tracking-widest">
                  Updating your taste profile…
                </span>
              </div>
            )}

            <div className="pt-4 border-t border-outline-variant">
              {tasteCollection.libraries.length > 1 && (
                <div className="mb-4 flex items-center justify-between gap-3">
                  <label htmlFor="taste-profile-picker" className="font-label text-[11px] text-on-surface uppercase tracking-widest">
                    Taste profile
                  </label>
                  <select
                    id="taste-profile-picker"
                    aria-label="Taste profile"
                    value={activeTasteProfileId ?? ""}
                    onChange={(e) => setActiveTasteProfileId(e.target.value || null)}
                    className="bg-surface-high text-on-surface px-3 py-2 font-label text-[11px] uppercase tracking-widest border border-outline-variant"
                  >
                    {tasteCollection.libraries.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {tasteCollection.libraries.length === 1 && tasteLibrary.currentProfile && (
                <div className="mb-4 font-label text-[11px] text-on-surface-variant uppercase tracking-widest">
                  Taste profile: {tasteLibrary.name}
                </div>
              )}
              <IntentPicker
                preset={intentPreset}
                freeForm={intentFreeForm}
                onPresetChange={handleIntentPreset}
                onFreeFormChange={handleIntentFreeForm}
              />
              {tasteLibrary.currentProfile && (
                <label className="flex items-start gap-3 mt-4 pt-4 border-t border-outline-variant cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={ignoreTasteProfile}
                    onChange={(e) => setIgnoreTasteProfile(e.target.checked)}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <div className="font-label text-[11px] text-on-surface uppercase tracking-widest mb-1">
                      Cull this shoot without my taste profile
                    </div>
                    <div className="font-body text-[12px] text-on-surface-variant">
                      Use when this shoot is intentionally outside your usual style. Your library and profile stay intact.
                    </div>
                  </div>
                </label>
              )}
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
              {compareSelected.length === 2 && !isRestoredSession && (
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

        {/* Cull banner — always show after cull so user can develop the shortlist */}
        {phase === "culled" && (
          <CullBanner
            deepCount={deepSelected.size}
            onStartDeepReview={startDeepReview}
            isRestored={isRestoredSession}
          />
        )}

        {/* Editor's notes banner (after shortlist development) */}
        {phase === "reviewed" && curatorialNotes && (
          <div className="mx-8 mt-4 p-6 bg-surface-low border-l-2 border-primary">
            <h3 className="font-label text-[11px] text-primary tracking-widest mb-3">Editor's Notes</h3>
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
          ratingOverrides={ratingOverrides}
          curatorialNotes={curatorialNotes}
          recommendedSequence={recommendedSequence}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Sessions / history modal */}
      {showSessions && (
        <SessionsModal
          sessions={sessions}
          onRestore={handleRestoreSession}
          onClose={() => setShowSessions(false)}
        />
      )}

      {/* Override toast — fires on every override with an Undo affordance.
          First fire per browser shows expanded educational copy. */}
      {overrideToast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 max-w-sm bg-surface-highest border-l-2 border-primary shadow-lg px-4 py-3 flex items-start gap-3"
        >
          <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">tune</span>
          <div className="flex-1 min-w-0">
            <div className="font-label text-[11px] uppercase tracking-widest text-on-surface mb-1">
              Correction saved
            </div>
            {overrideToast.isFirst && (
              <div className="font-body text-[12px] text-on-surface-variant mb-2">
                Saved as a signal — your taste profile will incorporate it on the next regen, shaping how the AI reads similar frames.
              </div>
            )}
            <button
              onClick={() => {
                if (!overrideToast) return;
                removeOverride(overrideToast.photoHash);
                setRatingOverrides(prev => {
                  const next = { ...prev };
                  if (overrideToast.prevRating === undefined) delete next[overrideToast.index];
                  else next[overrideToast.index] = overrideToast.prevRating;
                  return next;
                });
                if (overrideToastTimerRef.current) clearTimeout(overrideToastTimerRef.current);
                setOverrideToast(null);
              }}
              className="font-label text-[11px] uppercase tracking-widest text-primary hover:text-primary-dim transition-colors"
            >
              Undo
            </button>
          </div>
          <button
            onClick={() => {
              if (overrideToastTimerRef.current) clearTimeout(overrideToastTimerRef.current);
              setOverrideToast(null);
            }}
            aria-label="Dismiss"
            className="text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Star toast — fires on every taste-library add so the user sees the
          downstream impact (parity with the override toast). Stacked above
          the override toast so a quick correction-after-star doesn't clobber. */}
      {starToast && (
        <div
          role="status"
          className={`fixed right-6 z-50 max-w-sm bg-surface-highest border-l-2 border-primary shadow-lg px-4 py-3 flex items-start gap-3 ${overrideToast ? "bottom-32" : "bottom-6"}`}
        >
          <span
            className="material-symbols-outlined text-[18px] text-primary mt-0.5"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            star
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-label text-[11px] uppercase tracking-widest text-on-surface mb-1">
              Saved to library
            </div>
            {starToast.isFirst && (
              <div className="font-body text-[12px] text-on-surface-variant">
                Stars feed your taste profile — the next regen will use this frame to shape how the AI reads similar work. Manage your library from the palette icon.
              </div>
            )}
          </div>
          <button
            onClick={() => {
              if (starToastTimerRef.current) clearTimeout(starToastTimerRef.current);
              setStarToast(null);
            }}
            aria-label="Dismiss"
            className="text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}
    </div>
  );
}
