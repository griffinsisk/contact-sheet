"use client";

import { useState } from "react";
import { Photo, CullResult, DeepResult, Rating, ProviderConfig } from "@/lib/types";
import { formatExifLine, formatExifCamera } from "@/lib/exif";
import { SCORE_DIMENSIONS } from "@/lib/constants";
import { runResolutionTest } from "@/lib/api";

interface Props {
  photo: Photo | null;
  cull: CullResult | null;
  deep: DeepResult | null;
  ratingOverride: Rating | null;
  config: ProviderConfig | null;
  onRatingOverride: (rating: Rating) => void;
  onClose: () => void;
}

const RATING_OPTIONS: { rating: Rating; color: string; activeColor: string }[] = [
  { rating: "HERO", color: "text-primary", activeColor: "bg-primary text-on-primary" },
  { rating: "SELECT", color: "text-secondary", activeColor: "bg-secondary text-on-secondary" },
  { rating: "MAYBE", color: "text-on-surface-variant", activeColor: "bg-surface-highest text-on-surface" },
  { rating: "CUT", color: "text-error", activeColor: "bg-error text-on-error-container" },
];

const DIMENSION_COLORS: Record<string, string> = {
  impact: "bg-score-impact",
  composition: "bg-score-composition",
  rawQuality: "bg-score-raw",
  craftExecution: "bg-score-craft",
  story: "bg-score-story",
};

const DIMENSION_TEXT_COLORS: Record<string, string> = {
  impact: "text-score-impact",
  composition: "text-score-composition",
  rawQuality: "text-score-raw",
  craftExecution: "text-score-craft",
  story: "text-score-story",
};

export default function DetailPanel({ photo, cull, deep, ratingOverride, config, onRatingOverride, onClose }: Props) {
  const [resTest, setResTest] = useState<{ res512: CullResult; res1024: CullResult; res1536: CullResult } | null>(null);
  const [resTestLoading, setResTestLoading] = useState(false);
  if (!photo) return null;

  const analysis = deep || cull;
  const exifParts: { label: string; value: string }[] = [];
  if (photo.exif) {
    if (photo.exif.shutterSpeed) exifParts.push({ label: "SHUTTER", value: photo.exif.shutterSpeed });
    if (photo.exif.aperture) exifParts.push({ label: "APERTURE", value: `F${photo.exif.aperture % 1 === 0 ? photo.exif.aperture.toFixed(0) : photo.exif.aperture.toFixed(1)}` });
    if (photo.exif.iso) exifParts.push({ label: "ISO", value: String(photo.exif.iso) });
    if (photo.exif.focalLength) {
      const val = photo.exif.focalLength35 && photo.exif.focalLength35 !== photo.exif.focalLength
        ? `${photo.exif.focalLength}MM (${photo.exif.focalLength35}eq)`
        : `${photo.exif.focalLength}MM`;
      exifParts.push({ label: "FOCAL", value: val });
    }
  }

  return (
    <aside
      className="fixed right-0 top-0 w-[420px] h-full bg-background z-40 overflow-y-auto pt-16"
      style={{ boxShadow: "-20px 0 60px -15px rgba(0,0,0,0.8)", animation: "slideInRight 0.3s ease" }}
    >
      <div className="p-8">
        {/* Back button */}
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="flex items-center gap-2 mb-6 text-on-surface-variant hover:text-primary transition-colors group"
        >
          <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
          <span className="font-label text-[10px] uppercase tracking-widest">Back to grid</span>
        </button>

        {/* Header */}
        <div className="mb-8">
          <h2 className="font-label text-[12px] text-primary uppercase tracking-widest">METADATA</h2>
          <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
            AI ANALYSIS & EXIF
          </p>
        </div>

        {/* Focus image */}
        <div className="mb-8">
          <img
            src={photo.preview}
            alt={photo.name}
            className="w-full aspect-square object-cover mb-4"
          />

          {/* EXIF bar */}
          {exifParts.length > 0 && (
            <div className="flex justify-between bg-surface-low p-3">
              {exifParts.map((part, i) => (
                <div key={part.label} className={`flex flex-col ${i > 0 ? "border-l border-outline-variant/30 pl-4" : ""}`}>
                  <span className="font-label text-[9px] text-on-surface-variant">{part.label}</span>
                  <span className="font-label text-[11px] text-on-surface">{part.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Title + Score */}
        {analysis && (
          <div className="flex justify-between items-baseline mb-8">
            <h1 className="font-headline italic text-3xl text-on-surface leading-tight pr-4">
              {deep?.title || photo.name.replace(/\.[^.]+$/, "")}
            </h1>
            <div className="text-right flex-shrink-0">
              <span className="block font-label text-[10px] text-on-surface-variant">FINAL SCORE</span>
              <span className="font-label text-5xl font-black text-primary">{analysis.score}</span>
            </div>
          </div>
        )}

        {/* Rating override — human > AI */}
        {analysis && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
                {ratingOverride ? "YOUR RATING" : "AI RATING"}
              </span>
              {ratingOverride && (
                <span className="font-label text-[9px] text-on-surface-variant/60 uppercase tracking-widest">
                  AI: {analysis.rating}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {RATING_OPTIONS.map(({ rating, color, activeColor }) => {
                const isActive = ratingOverride ? ratingOverride === rating : analysis.rating === rating;
                return (
                  <button
                    key={rating}
                    onClick={() => onRatingOverride(rating)}
                    aria-label={`Rate as ${rating}`}
                    className={`py-2 font-label text-[11px] font-bold uppercase tracking-widest transition-colors ${
                      isActive ? activeColor : `bg-surface-low ${color} hover:bg-surface-high`
                    }`}
                  >
                    {rating}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Score dimension bars (deep review only) */}
        {deep?.scores && (
          <div className="space-y-6 mb-12">
            {(Object.entries(SCORE_DIMENSIONS) as [string, { label: string; color: string; weight: string }][]).map(([key, dim]) => {
              const score = deep.scores[key as keyof typeof deep.scores];
              return (
                <div key={key} className="space-y-2">
                  <div className="flex justify-between font-label text-[10px] tracking-widest uppercase">
                    <span className="text-on-surface-variant">{dim.label}</span>
                    <span className={DIMENSION_TEXT_COLORS[key]}>{score}%</span>
                  </div>
                  <div className="h-[2px] w-full bg-surface-high">
                    <div
                      className={`h-full ${DIMENSION_COLORS[key]} transition-all duration-1000 ease-out`}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Feedback sections */}
        {deep && (
          <div className="space-y-8">
            <section>
              <h3 className="font-label text-[11px] text-on-surface-variant border-l-2 border-primary/40 pl-3 mb-4 uppercase tracking-widest">
                TECHNICAL & COMPOSITION
              </h3>
              <p className="font-body text-sm text-on-surface/80 leading-relaxed">
                {deep.technical}
              </p>
            </section>
            <section>
              <h3 className="font-label text-[11px] text-on-surface-variant border-l-2 border-primary/40 pl-3 mb-4 uppercase tracking-widest">
                STYLE & STORY
              </h3>
              <p className="font-body text-sm text-on-surface/80 leading-relaxed">
                {deep.style_story}
              </p>
            </section>
            <section>
              <h3 className="font-label text-[11px] text-on-surface-variant border-l-2 border-primary/40 pl-3 mb-4 uppercase tracking-widest">
                VERDICT
              </h3>
              <p className="font-body text-sm text-on-surface leading-relaxed font-medium">
                {deep.verdict}
              </p>
            </section>
          </div>
        )}

        {/* Cull-only reason */}
        {!deep && cull && (
          <div>
            <h3 className="font-label text-[11px] text-on-surface-variant border-l-2 border-primary/40 pl-3 mb-4 uppercase tracking-widest">
              CULL NOTE
            </h3>
            <p className="font-body text-sm text-on-surface/80 leading-relaxed">
              {cull.reason}
            </p>
          </div>
        )}

        {/* Dev: Resolution A/B Test */}
        {config && photo && (
          <div className="mt-8 pt-8 border-t border-outline-variant/10">
            <button
              onClick={async () => {
                if (!config || !photo) return;
                setResTestLoading(true);
                setResTest(null);
                try {
                  const result = await runResolutionTest(photo, config);
                  setResTest(result);
                } catch (err: any) {
                  console.error("Resolution test failed:", err);
                } finally {
                  setResTestLoading(false);
                }
              }}
              disabled={resTestLoading}
              className="flex items-center gap-2 font-label text-[10px] text-on-surface-variant hover:text-primary transition-colors uppercase tracking-widest"
            >
              <span className="material-symbols-outlined text-[16px]">science</span>
              {resTestLoading ? "Testing 3 resolutions…" : "Test Resolution Impact"}
            </button>

            {resTest && (
              <div className="mt-4 space-y-3">
                <div className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">
                  Same cull prompt, 3 resolutions
                </div>
                {([
                  { label: "512px", data: resTest.res512 },
                  { label: "1024px", data: resTest.res1024 },
                  { label: "1536px", data: resTest.res1536 },
                ] as const).map(({ label, data }) => (
                  <div key={label} className="flex items-center justify-between p-3 bg-surface-low">
                    <div className="flex items-center gap-3">
                      <span className="font-label text-[11px] text-on-surface-variant w-14">{label}</span>
                      <span className={`font-label text-[10px] font-bold px-2 py-0.5 ${
                        data.rating === "HERO" ? "bg-primary text-on-primary" :
                        data.rating === "SELECT" ? "bg-secondary text-on-secondary" :
                        data.rating === "CUT" ? "bg-surface-high text-on-surface-variant" :
                        "bg-surface-high text-on-surface-variant"
                      }`}>{data.rating}</span>
                    </div>
                    <span className={`font-label text-2xl font-black ${
                      data.rating === "HERO" ? "text-primary" :
                      data.rating === "SELECT" ? "text-secondary" :
                      "text-on-surface-variant"
                    }`}>{data.score}</span>
                  </div>
                ))}
                <p className="font-body text-[11px] text-on-surface-variant/60 italic leading-relaxed mt-2">
                  Delta: {Math.abs(resTest.res1024.score - resTest.res512.score)} pts between 512→1024,{" "}
                  {Math.abs(resTest.res1536.score - resTest.res1024.score)} pts between 1024→1536
                </p>
              </div>
            )}
          </div>
        )}

        {/* Camera info */}
        {photo.exif && (
          <div className="mt-8 pt-8 border-t border-outline-variant/10">
            <span className="font-label text-[9px] text-on-surface-variant/50 uppercase tracking-widest">
              {formatExifCamera(photo.exif)}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
