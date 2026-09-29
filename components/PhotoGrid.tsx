"use client";

import { Photo, CullResult, DeepResult, Rating } from "@/lib/types";
import { formatExifLine } from "@/lib/exif";
import TasteStarButton from "./TasteStarButton";

type Phase = "empty" | "uploading" | "ready" | "culling" | "culled" | "reviewing" | "reviewed";

export interface BurstBadge {
  count: number;
  expanded: boolean;
  clusterId: number;
}

interface Props {
  photos: Photo[];
  cullResults: Record<number, CullResult>;
  deepResults: Record<number, DeepResult>;
  deepSelected: Set<number>;
  compareSelected: number[];
  selectedIndex: number | null;
  phase: Phase;
  ratingOverrides: Record<number, Rating>;
  displayIndices: number[];
  onSelect: (index: number) => void;
  onCompareToggle: (index: number) => void;
  onDeepToggle: (index: number) => void;
  sequenceMap: Record<number, number>;
  burstBadges?: Record<number, BurstBadge>;
  burstAlts?: Set<number>;
  onToggleBurst?: (clusterId: number) => void;
}

const RATING_CLASSES: Record<Rating, { badge: string; scoreBorder: string }> = {
  HERO: {
    badge: "bg-primary text-on-primary",
    scoreBorder: "border-primary/30",
  },
  SELECT: {
    badge: "bg-secondary text-on-secondary",
    scoreBorder: "border-on-surface/20",
  },
  MAYBE: {
    badge: "bg-surface-high text-on-surface-variant",
    scoreBorder: "border-on-surface/10",
  },
  CUT: {
    badge: "bg-surface-high text-on-surface-variant",
    scoreBorder: "border-on-surface/10",
  },
};

export default function PhotoGrid({
  photos, cullResults, deepResults, deepSelected, compareSelected,
  selectedIndex, phase, ratingOverrides, displayIndices, onSelect, onCompareToggle, onDeepToggle, sequenceMap,
  burstBadges, burstAlts, onToggleBurst,
}: Props) {
  return (
    <div className="p-8 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
      {displayIndices.map((index) => {
        const photo = photos[index];
        const cull = cullResults[index];
        const deep = deepResults[index];
        const analysis = cull || deep;
        const rating = ratingOverrides[index] || cull?.rating || deep?.rating;
        const isOverridden = !!ratingOverrides[index];
        const ratingStyle = rating ? RATING_CLASSES[rating] : null;
        const isSelected = selectedIndex === index;
        const isCompare = compareSelected.includes(index);
        const compareLabel = isCompare ? (compareSelected.indexOf(index) === 0 ? "A" : "B") : null;
        const isDeepSelected = deepSelected.has(index);
        const isCut = rating === "CUT" || rating === "MAYBE";
        const seqNum = sequenceMap[index];
        const exifLine = formatExifLine(photo.exif);
        const burst = burstBadges?.[index];
        const isBurstAlt = burstAlts?.has(index) ?? false;

        return (
          <div
            key={photo.id}
            className="group flex flex-col gap-3"
          >
            <div
              onClick={() => onSelect(index)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(index); } }}
              tabIndex={0}
              role="button"
              aria-label={`${photo.name}${analysis && rating ? `, ${rating}, score ${analysis.score}` : ""}`}
              className={`relative aspect-square bg-surface-lowest overflow-hidden cursor-pointer transition-all duration-200 ${
                isSelected ? "outline outline-2 outline-primary" : isCompare ? "outline outline-2 outline-primary" : ""
              }`}
              style={burst && !burst.expanded ? {
                // Stacked-paper effect: the rest of the burst sits behind the lead
                boxShadow: "6px 6px 0 -1px rgba(255,255,255,0.07), 12px 12px 0 -2px rgba(255,255,255,0.035)",
              } : undefined}
            >
              <img
                src={photo.preview}
                alt={photo.name}
                className={`w-full h-full object-cover transition-all duration-700 group-hover:scale-105 ${
                  isCut ? "opacity-50 grayscale" : ""
                }`}
              />

              {/* Shimmer for unanalyzed */}
              {!analysis && phase !== "empty" && (
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s ease-in-out infinite",
                  }}
                />
              )}

              {/* Rating badge */}
              {ratingStyle && (
                <div className="absolute top-0 left-0 p-3 flex items-center gap-1">
                  <span className={`${ratingStyle.badge} font-label text-[10px] font-black px-2 py-1`}>
                    {rating}
                  </span>
                  {isOverridden && (
                    <span
                      className="flex items-center gap-1 bg-primary/90 text-on-primary font-label text-[9px] font-black uppercase tracking-widest px-1.5 py-1"
                      title="You corrected this rating — feeds your taste profile on the next regen"
                    >
                      <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>tune</span>
                      Corrected
                    </span>
                  )}
                </div>
              )}

              {/* Score badge */}
              {analysis && (
                <div className="absolute top-0 right-0 p-3">
                  <div className={`w-10 h-10 glass-loupe flex items-center justify-center border ${ratingStyle?.scoreBorder}`}>
                    <span className={`font-label text-[12px] font-bold ${
                      rating === "HERO" ? "text-primary" : isCut ? "text-on-surface/40" : "text-on-surface"
                    }`}>
                      {analysis.score}
                    </span>
                  </div>
                </div>
              )}

              {/* Favorite star */}
              <div
                className="absolute top-0 right-0 pt-14 pr-3"
                onClick={(e) => e.stopPropagation()}
              >
                <TasteStarButton photo={photo} rating={rating ?? null} size="sm" className="glass-loupe w-7 h-7 flex items-center justify-center" />
              </div>

              {/* Shortlist development toggle (after cull) */}
              {(phase === "culled") && cull && (
                <div className="absolute bottom-3 left-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeepToggle(index); }}
                    aria-label={`${isDeepSelected ? "Remove from" : "Add to"} shortlist development: ${photo.name}`}
                    aria-pressed={isDeepSelected}
                    className={`px-3 py-1 font-label text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 transition-colors ${
                      isDeepSelected
                        ? "bg-primary text-on-primary"
                        : "bg-surface-bright/80 text-on-surface hover:bg-primary hover:text-on-primary"
                    }`}
                  >
                    {isDeepSelected && (
                      <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'wght' 700" }}>check</span>
                    )}
                    DEVELOP
                  </button>
                </div>
              )}

              {/* Compare checkbox */}
              {analysis && (
                <div className="absolute bottom-3 right-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); onCompareToggle(index); }}
                    aria-label={`${isCompare ? "Remove from" : "Add to"} comparison: ${photo.name}`}
                    aria-pressed={isCompare}
                    className={`glass-loupe px-2 py-1 flex items-center gap-2 ${
                      isCompare ? "border border-primary" : ""
                    }`}
                  >
                    {compareLabel ? (
                      <span className="font-label text-[11px] font-bold text-primary">{compareLabel}</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px] text-on-surface/60">compare_arrows</span>
                    )}
                  </button>
                </div>
              )}

              {/* Sequence number */}
              {seqNum != null && (
                <div className="absolute bottom-3 left-3 w-6 h-6 bg-black/80 border border-on-surface/20 flex items-center justify-center">
                  <span className="font-label text-[11px] font-bold text-on-surface">{seqNum}</span>
                </div>
              )}
            </div>

            {/* Burst chip — lead frame of a collapsed/expanded burst */}
            {burst && onToggleBurst && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleBurst(burst.clusterId); }}
                aria-expanded={burst.expanded}
                aria-label={`${burst.expanded ? "Collapse" : "Expand"} burst of ${burst.count} similar frames led by ${photo.name}`}
                className={`self-start flex items-center gap-1.5 px-2 py-1 font-label text-[9px] font-bold uppercase tracking-widest transition-colors ${
                  burst.expanded
                    ? "bg-primary/20 text-primary"
                    : "bg-surface-high text-on-surface-variant hover:bg-surface-bright hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">burst_mode</span>
                BEST OF {burst.count}
                <span className="material-symbols-outlined text-[13px]">
                  {burst.expanded ? "unfold_less" : "unfold_more"}
                </span>
              </button>
            )}

            {/* Filename + EXIF below thumbnail */}
            <div className="font-label text-[9px] uppercase tracking-widest text-on-surface/40 flex justify-between">
              <span className="truncate flex items-center gap-1.5">
                {isBurstAlt && (
                  <span className="flex-shrink-0 px-1 py-px bg-surface-high text-on-surface-variant font-bold" title="Alternate frame from a burst">
                    ALT
                  </span>
                )}
                <span className="truncate">{photo.name}</span>
              </span>
              {exifLine && <span className="flex-shrink-0 ml-2">{exifLine}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
