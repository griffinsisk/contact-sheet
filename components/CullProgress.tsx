"use client";

import { useEffect, useState } from "react";

type Phase = "uploading" | "culling" | "reviewing";

interface Props {
  phase: Phase;
  statusMsg: string;
  done: number;
  total: number;
}

const PHRASES: Record<Phase, string[]> = {
  uploading: [
    "Reading pixels",
    "Decoding RAW",
    "Building thumbnails",
    "Checking EXIF",
    "Opening the drawer",
  ],
  culling: [
    "Checking focus",
    "Reading the light",
    "Weighing composition",
    "Counting catchlights",
    "Minding the edges",
    "Chasing the subject",
    "Comparing near-duplicates",
    "Squinting at detail",
    "Measuring separation",
    "Sizing up the frame",
    "Hunting for the moment",
    "Calling HERO or CUT",
  ],
  reviewing: [
    "Writing the critique",
    "Naming what works",
    "Flagging what doesn't",
    "Noticing the gesture",
    "Reading expression",
    "Weighing tonality",
    "Thinking about sequence",
    "Finding the edit",
  ],
};

export default function CullProgress({ phase, statusMsg, done, total }: Props) {
  const phrases = PHRASES[phase];
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * phrases.length));

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % phrases.length);
    }, 2200);
    return () => clearInterval(id);
  }, [phrases.length]);

  const heads = phase === "reviewing" ? "Deep review" : phase === "culling" ? "Culling" : "Loading";

  return (
    <div className="px-8 py-6">
      <div className="flex items-baseline justify-between mb-2">
        <span className="mono-label text-[12px] text-primary" style={{ animation: "pulse 1.5s infinite" }}>
          {statusMsg}
        </span>
        <span
          key={idx}
          className="font-body text-[13px] text-on-surface-variant"
          style={{ animation: "phrase-fade 2.2s ease-in-out" }}
        >
          {phrases[idx]}…
        </span>
      </div>
      <p className="mono-label text-[11px] text-on-surface-variant/60 mb-3 tracking-wider">
        {heads} — this may take a few minutes. Don't close the tab.
      </p>
      <div className="relative h-[2px] w-full bg-surface-high overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full w-1/3 bg-primary"
          style={{ animation: "shimmer 1.6s ease-in-out infinite" }}
        />
      </div>
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes shimmer-tail {
          0%, 100% { opacity: 0.2; transform: translateX(0); }
          50% { opacity: 0.8; transform: translateX(6px); }
        }
        @keyframes phrase-fade {
          0% { opacity: 0; transform: translateY(3px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; }
          100% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
