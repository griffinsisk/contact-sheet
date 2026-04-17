"use client";

import { Photo, CompareResponse } from "@/lib/types";
import { formatExifLine } from "@/lib/exif";

interface Props {
  photoA: Photo;
  photoB: Photo;
  result: CompareResponse | null;
  loading: boolean;
  onConfirm: () => void;
  onKeepBoth: () => void;
  onClose: () => void;
}

export default function CompareModal({ photoA, photoB, result, loading, onConfirm, onKeepBoth, onClose }: Props) {
  const exifA = formatExifLine(photoA.exif);
  const exifB = formatExifLine(photoB.exif);
  const isPick = (frame: "A" | "B") => result?.pick === frame;

  return (
    <main
      className="fixed inset-0 z-[60] bg-background flex flex-col items-center justify-center px-24 py-16 overflow-y-auto"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      {/* Close */}
      <button
        onClick={onClose}
        aria-label="Close comparison"
        className="fixed top-8 right-8 text-on-surface-variant hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-4xl">close</span>
      </button>

      {/* Header */}
      <div className="w-full max-w-7xl mb-12 text-center">
        <h1 className="text-5xl serif-italic text-on-background tracking-tight mb-2">
          Which frame is stronger?
        </h1>
        <p className="mono-label text-[10px] text-primary tracking-[0.3em]">
          AI CURATION COMPARISON
        </p>
      </div>

      {/* Frames */}
      <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-2 gap-12 mb-12 items-start">
        {/* Frame A */}
        <div className="flex flex-col gap-6 group">
          <div className={`aspect-[3/2] w-full bg-surface-lowest overflow-hidden relative transition-transform duration-500 group-hover:scale-[1.01] ${
            isPick("A") ? "ring-4 ring-primary shadow-[0_0_80px_-20px_rgba(240,192,64,0.4)]" : "shadow-2xl"
          }`}>
            <img
              src={photoA.preview}
              alt={photoA.name}
              className={`w-full h-full object-cover transition-all duration-700 ${
                result && !isPick("A") ? "grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100" : ""
              }`}
            />
            <div className="absolute top-4 left-4 bg-surface-lowest/80 px-3 py-1">
              <span className={`mono-label text-[11px] ${isPick("A") ? "text-primary" : "text-on-surface"}`}>FRAME A</span>
            </div>
            {isPick("A") && (
              <div className="absolute top-0 right-0 bg-primary text-background px-6 py-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                <span className="mono-label text-[12px] font-bold">PICK</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className={`flex justify-between items-end pb-2 ${isPick("A") ? "border-b border-primary/30" : "border-b border-outline-variant/30"}`}>
              <span className={`mono-label text-[12px] font-bold ${isPick("A") ? "text-primary" : "text-on-surface"}`}>{photoA.name}</span>
              {exifA && <span className="mono-label text-[10px] text-on-surface-variant">{exifA}</span>}
            </div>
            {result && (
              <div className="flex gap-4">
                <div className={`w-1 h-8 ${isPick("A") ? "bg-primary" : "bg-error/30"}`} />
                <p className="text-[13px] text-on-surface-variant leading-relaxed max-w-md">
                  {isPick("A") ? result.frame_a.strengths : result.frame_a.weaknesses}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Frame B */}
        <div className="flex flex-col gap-6 group">
          <div className={`aspect-[3/2] w-full bg-surface-lowest overflow-hidden relative transition-transform duration-500 group-hover:scale-[1.01] ${
            isPick("B") ? "ring-4 ring-primary shadow-[0_0_80px_-20px_rgba(240,192,64,0.4)]" : "shadow-2xl"
          }`}>
            <img
              src={photoB.preview}
              alt={photoB.name}
              className={`w-full h-full object-cover transition-all duration-700 ${
                result && !isPick("B") ? "grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100" : ""
              }`}
            />
            <div className="absolute top-4 left-4 bg-surface-lowest/80 px-3 py-1">
              <span className={`mono-label text-[11px] ${isPick("B") ? "text-primary" : "text-on-surface"}`}>FRAME B</span>
            </div>
            {isPick("B") && (
              <div className="absolute top-0 right-0 bg-primary text-background px-6 py-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                <span className="mono-label text-[12px] font-bold">PICK</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className={`flex justify-between items-end pb-2 ${isPick("B") ? "border-b border-primary/30" : "border-b border-outline-variant/30"}`}>
              <span className={`mono-label text-[12px] font-bold ${isPick("B") ? "text-primary" : "text-on-surface"}`}>{photoB.name}</span>
              {exifB && <span className="mono-label text-[10px] text-on-surface-variant">{exifB}</span>}
            </div>
            {result && (
              <div className="flex gap-4">
                <div className={`w-1 h-8 ${isPick("B") ? "bg-primary" : "bg-error/30"}`} />
                <p className="text-[13px] text-on-surface-variant leading-relaxed max-w-md">
                  {isPick("B") ? result.frame_b.strengths : result.frame_b.weaknesses}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reasoning + Actions */}
      <div className="w-full max-w-7xl grid grid-cols-12 gap-8 mt-8 items-center border-t border-outline-variant pt-12">
        <div className="col-span-12 lg:col-span-8">
          {loading && (
            <p className="mono-label text-[12px] text-on-surface-variant" style={{ animation: "pulse 1.5s infinite" }}>
              Analyzing frames...
            </p>
          )}
          {result && (
            <>
              <h3 className="mono-label text-[12px] text-on-surface mb-4">AI ANALYSIS REASONING</h3>
              <p className="font-body text-on-surface-variant text-lg leading-relaxed">
                {result.reasoning}
              </p>
            </>
          )}
        </div>
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
          <button
            onClick={onConfirm}
            disabled={!result}
            className="w-full bg-primary text-background py-5 mono-label text-[14px] font-bold hover:bg-primary-dim transition-all active:scale-95 disabled:opacity-30"
          >
            CONFIRM SELECTION
          </button>
          <button
            onClick={onKeepBoth}
            className="w-full bg-surface-high text-on-surface py-5 mono-label text-[14px] hover:bg-surface-bright transition-all active:scale-95"
          >
            KEEP BOTH AS CANDIDATES
          </button>
        </div>
      </div>
    </main>
  );
}
