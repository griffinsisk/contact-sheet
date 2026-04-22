export const RATING_CONFIG = {
  HERO:   { color: "#f0c040", bg: "rgba(240,192,64,0.10)",  border: "rgba(240,192,64,0.3)" },
  SELECT: { color: "#6ec87a", bg: "rgba(110,200,122,0.10)", border: "rgba(110,200,122,0.3)" },
  MAYBE:  { color: "#a0a0a0", bg: "rgba(160,160,160,0.08)", border: "rgba(160,160,160,0.2)" },
  CUT:    { color: "#c75050", bg: "rgba(199,80,80,0.08)",   border: "rgba(199,80,80,0.2)" },
} as const;

export const SCORE_DIMENSIONS = {
  impact:         { label: "IMPACT",         color: "#e8a035", weight: "30%" },
  composition:    { label: "COMPOSITION",    color: "#6ea4d4", weight: "25%" },
  rawQuality:     { label: "RAW QUALITY",    color: "#8b5cf6", weight: "15%" },
  craftExecution: { label: "CRAFT",          color: "#b891f5", weight: "10%" },
  story:          { label: "STORY",          color: "#06b6d4", weight: "20%" },
} as const;

export const CULL_BATCH_SIZE = 20;
export const DEEP_BATCH_SIZE = 12;

export const STAR_MAP: Record<string, number> = { HERO: 5, SELECT: 4, MAYBE: 2, CUT: 1 };
export const LABEL_MAP: Record<string, string> = { HERO: "Winner", SELECT: "Second", MAYBE: "Approved", CUT: "Rejected" };
