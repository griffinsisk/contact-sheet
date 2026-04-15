"use client";

import { useState } from "react";
import { Photo, CullResult, DeepResult } from "@/lib/types";
import { generateXMP, generateOrgScript, generateManifest, downloadFile } from "@/lib/exports";
import { hasFileSystemAccess, exportToFolder } from "@/lib/fs-export";

interface Props {
  photos: Photo[];
  cullResults: Record<number, CullResult>;
  deepResults: Record<number, DeepResult>;
  curatorialNotes: string | null;
  recommendedSequence: number[] | null;
  onClose: () => void;
}

export default function ExportModal({ photos, cullResults, deepResults, curatorialNotes, recommendedSequence, onClose }: Props) {
  const [renameFiles, setRenameFiles] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const canUseFSAccess = hasFileSystemAccess();
  const analyzedCount = Object.keys(cullResults).length;
  const deepCount = Object.keys(deepResults).length;
  const hasOriginals = photos.some(p => p.originalFile);

  // ── Primary: Export to Folder (File System Access API) ─────────────────

  const handleExportToFolder = async () => {
    setExporting(true);
    setExportError(null);
    setExportDone(false);
    try {
      await exportToFolder({
        photos,
        cullResults,
        deepResults,
        recommendedSequence,
        renameFiles,
        onProgress: setExportProgress,
      });
      setExportDone(true);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        // User cancelled the folder picker
        setExportProgress("");
      } else {
        setExportError(err?.message || "Export failed");
      }
    } finally {
      setExporting(false);
    }
  };

  // ── Fallback downloads ─────────────────────────────────────────────────

  const downloadXMP = () => {
    photos.forEach((p, i) => {
      const cull = cullResults[i];
      if (!cull) return;
      const xmp = generateXMP(p.name, cull, deepResults[i]);
      downloadFile(xmp, `${p.name.replace(/\.[^.]+$/, "")}.xmp`, "application/xml");
    });
  };

  const downloadScript = () => {
    const { content, filename } = generateOrgScript(
      photos, cullResults, deepResults, recommendedSequence, "unix", renameFiles,
    );
    downloadFile(content, filename);
  };

  const downloadManifest = () => {
    const manifest = generateManifest(photos, cullResults, deepResults, curatorialNotes, recommendedSequence);
    downloadFile(manifest, "contact-sheet-manifest.txt");
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/90 backdrop-blur-sm flex items-center justify-center"
      onKeyDown={(e) => { if (e.key === "Escape" && !exporting) onClose(); }}
      tabIndex={-1}
      ref={(el: HTMLDivElement | null) => el?.focus()}
    >
      <div className="w-full max-w-2xl bg-surface-bright p-8 md:p-12 max-h-[90vh] overflow-y-auto" style={{ boxShadow: "0 0 60px -15px rgba(0,0,0,0.8)" }}>
        {/* Header */}
        <div className="flex justify-between items-start mb-10">
          <div>
            <div className="mono-label text-[10px] text-primary mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-primary" />
              EXPORT
            </div>
            <h1 className="text-4xl serif-italic text-on-surface">
              Generate deliverables
            </h1>
            <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-2">
              {analyzedCount} culled · {deepCount} deep reviewed
            </p>
          </div>
          <button onClick={onClose} aria-label="Close export" className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Primary action: Export to Folder */}
        {canUseFSAccess && hasOriginals && (
          <div className="mb-8">
            <button
              onClick={handleExportToFolder}
              disabled={exporting}
              className="w-full bg-primary text-on-primary py-6 mono-label font-bold text-sm tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-3"
            >
              {exporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-on-primary border-t-transparent animate-spin" />
                  {exportProgress}
                </>
              ) : exportDone ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  EXPORT COMPLETE
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">folder_open</span>
                  EXPORT TO FOLDER
                </>
              )}
            </button>

            <div className="mt-4 p-5 bg-surface-low border-l-2 border-primary">
              <p className="font-body text-sm text-on-surface/80 leading-relaxed mb-3">
                Pick your photo folder. We'll write directly into it:
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[14px] text-primary mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                  <span className="font-label text-[11px] text-on-surface-variant">XMP sidecars next to each original — Lightroom picks them up automatically</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[14px] text-primary mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                  <span className="font-label text-[11px] text-on-surface-variant">organized/ folder with files sorted by rating tier</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[14px] text-primary mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                  <span className="font-label text-[11px] text-on-surface-variant">Original files copied byte-for-byte — zero quality loss</span>
                </li>
              </ul>

              {/* Rename option */}
              <button
                onClick={() => setRenameFiles(!renameFiles)}
                className="flex items-center gap-2 font-label text-[10px] text-on-surface-variant uppercase tracking-widest mt-4"
              >
                <div className={`w-4 h-4 border ${renameFiles ? "bg-primary border-primary" : "border-outline-variant"} flex items-center justify-center`}>
                  {renameFiles && <span className="material-symbols-outlined text-[12px] text-on-primary">check</span>}
                </div>
                Rename copies with AI titles
              </button>
            </div>

            {exportError && (
              <div className="mt-3 px-4 py-3 bg-error/10 border-l-2 border-error">
                <span className="mono-label text-[11px] text-error">{exportError}</span>
              </div>
            )}
          </div>
        )}

        {/* Divider when both options available */}
        {canUseFSAccess && hasOriginals && (
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 border-t border-outline-variant/20" />
            <span className="font-label text-[10px] text-on-surface-variant/50 uppercase tracking-widest">Or download individually</span>
            <div className="flex-1 border-t border-outline-variant/20" />
          </div>
        )}

        {/* Secondary: Individual downloads */}
        <div className="space-y-3">
          <button
            onClick={downloadXMP}
            className="w-full bg-surface-high text-on-surface py-4 mono-label text-[12px] hover:bg-surface-highest transition-all active:scale-[0.98] flex items-center justify-between px-6"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[18px]">description</span>
              XMP SIDECARS
            </div>
            <span className="text-[10px] font-normal text-on-surface-variant">Lightroom / Capture One</span>
          </button>

          <button
            onClick={downloadScript}
            className="w-full bg-surface-high text-on-surface py-4 mono-label text-[12px] hover:bg-surface-highest transition-all active:scale-[0.98] flex items-center justify-between px-6"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[18px]">folder_copy</span>
              ORGANIZATION SCRIPT
            </div>
            <span className="text-[10px] font-normal text-on-surface-variant">Bash · {renameFiles ? "Rename" : "Preserve names"}</span>
          </button>

          <button
            onClick={downloadManifest}
            className="w-full bg-surface-high text-on-surface py-4 mono-label text-[12px] hover:bg-surface-highest transition-all active:scale-[0.98] flex items-center justify-between px-6"
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[18px]">analytics</span>
              ANALYSIS MANIFEST
            </div>
            <span className="text-[10px] font-normal text-on-surface-variant">Plain text report</span>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 flex justify-between">
          <span className="font-label text-[9px] text-on-surface-variant/50 uppercase tracking-widest">
            LOSSLESS — ORIGINALS NEVER RE-ENCODED
          </span>
          <span className="font-label text-[9px] text-on-surface-variant/50 uppercase tracking-widest">
            {analyzedCount} FILES
          </span>
        </div>
      </div>
    </div>
  );
}
