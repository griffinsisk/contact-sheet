"use client";

import { useState } from "react";
import { IntentPreset, INTENT_LABELS } from "@/lib/types";

interface Props {
  preset: IntentPreset | null;
  freeForm: string;
  onPresetChange: (preset: IntentPreset) => void;
  onFreeFormChange: (text: string) => void;
}

const PRESET_ORDER: IntentPreset[] = [
  "documentary", "street", "film", "wildlife",
  "landscape", "portrait", "events", "mixed",
];

export default function IntentPicker({ preset, freeForm, onPresetChange, onFreeFormChange }: Props) {
  const [showFreeForm, setShowFreeForm] = useState(!!freeForm);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-label text-[11px] text-on-surface uppercase tracking-widest mb-1">
          What kind of shoot is this?
        </h4>
        <p className="font-body text-[12px] text-on-surface-variant">
          Helps the AI grade craft against your intent instead of generic photography rules.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PRESET_ORDER.map((p) => {
          const active = preset === p;
          const { title, subtitle } = INTENT_LABELS[p];
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPresetChange(p)}
              className={`text-left px-3 py-2 border transition-colors ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-outline-variant bg-surface-high text-on-surface-variant hover:border-on-surface-variant hover:text-on-surface"
              }`}
            >
              <div className="font-label text-[11px] uppercase tracking-widest font-bold">{title}</div>
              <div className="font-body text-[10px] mt-0.5 opacity-80">{subtitle}</div>
            </button>
          );
        })}
      </div>

      {!showFreeForm ? (
        <button
          type="button"
          onClick={() => setShowFreeForm(true)}
          className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
        >
          + ADD DIRECTION (OPTIONAL)
        </button>
      ) : (
        <div>
          <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">
            Anything else we should know?
          </label>
          <textarea
            value={freeForm}
            onChange={(e) => onFreeFormChange(e.target.value)}
            placeholder="e.g. Couple asked for a 90s disposable vibe. Or: first-time with the Leica — going for raw over technical."
            rows={2}
            className="w-full px-3 py-2 bg-surface-high border border-outline-variant font-body text-[13px] text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary resize-none"
          />
        </div>
      )}
    </div>
  );
}
