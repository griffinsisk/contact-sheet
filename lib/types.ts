// ── Provider types ──────────────────────────────────────────────────────────

export type Provider = "anthropic" | "openai" | "gemini";

export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  model: string;
}

export const PROVIDER_INFO: Record<Provider, {
  label: string;
  keyUrl: string;
  keyHelp: string;
  models: { id: string; label: string }[];
  placeholder: string;
}> = {
  anthropic: {
    label: "Anthropic (Claude)",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHelp: "Get your API key from the Anthropic Console → Settings → API Keys",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    ],
    placeholder: "sk-ant-api03-…",
  },
  openai: {
    label: "OpenAI (GPT-4o)",
    keyUrl: "https://platform.openai.com/api-keys",
    keyHelp: "Get your API key from OpenAI Platform → API Keys",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini (cheaper)" },
    ],
    placeholder: "sk-proj-…",
  },
  gemini: {
    label: "Google (Gemini)",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyHelp: "Get your API key from Google AI Studio → Get API Key",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
    placeholder: "AIza…",
  },
};

// ── Photo types ─────────────────────────────────────────────────────────────

export interface ExifData {
  make?: string;
  model?: string;
  lens?: string;
  iso?: number;
  aperture?: number;
  shutterSpeed?: string;
  shutterRaw?: number;
  focalLength?: number;
  focalLength35?: number;
  flash?: number;
}

export interface Photo {
  id: string;
  base64: string | null;   // null for restored sessions
  preview: string;          // data URL for display
  name: string;
  width: number;
  height: number;
  mediaType: string;
  exif: ExifData | null;
  isRestored?: boolean;
  originalFile?: File;      // retained for lossless export
}

// ── Analysis types ──────────────────────────────────────────────────────────

export type Rating = "HERO" | "SELECT" | "MAYBE" | "CUT";

export interface CullResult {
  index: number;
  score: number;
  rating: Rating;
  scores?: {
    impact: number;
    composition: number;
    technical: number;
    story: number;
  };
  reason: string;
}

export interface DeepResult {
  index: number;
  rating: Rating;
  score: number;
  scores: {
    impact: number;
    composition: number;
    technical: number;
    style_story: number;
  };
  title: string;
  technical: string;
  style_story: string;
  verdict: string;
}

export interface CullResponse {
  cull: CullResult[];
  _truncated?: boolean;
}

export interface DeepResponse {
  analysis: DeepResult[];
  curatorial_notes: string;
  recommended_sequence: number[];
  _truncated?: boolean;
}

export interface CompareResponse {
  frame_a: { strengths: string; weaknesses: string };
  frame_b: { strengths: string; weaknesses: string };
  pick: "A" | "B";
  reasoning: string;
}

export type ExperienceLevel = "learning" | "enthusiast" | "pro";

// ── Intent types ────────────────────────────────────────────────────────────

export type IntentPreset =
  | "documentary"
  | "street"
  | "film"
  | "wildlife"
  | "landscape"
  | "portrait"
  | "events"
  | "mixed";

export interface SessionIntent {
  preset: IntentPreset;
  freeForm?: string;
}

export const INTENT_LABELS: Record<IntentPreset, { title: string; subtitle: string }> = {
  documentary: { title: "Documentary", subtitle: "Candid, real moments" },
  street:      { title: "Street",      subtitle: "Public life, spontaneous" },
  film:        { title: "Film",        subtitle: "Intentional imperfection" },
  wildlife:    { title: "Wildlife",    subtitle: "Sharp action / sports" },
  landscape:   { title: "Landscape",   subtitle: "Fine-art, scenic" },
  portrait:    { title: "Portrait",    subtitle: "People, expression" },
  events:      { title: "Events",      subtitle: "Weddings, performances" },
  mixed:       { title: "Mixed",       subtitle: "Judge each on its own" },
};

// ── Session types ───────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;
  date: string;
  photoCount: number;
  heroCount: number;
  selectCount: number;
  level: ExperienceLevel;
  hasDeepReview: boolean;
}

export interface SessionData extends SessionSummary {
  cullResults: Record<number, CullResult>;
  deepResults: Record<number, DeepResult>;
  curatorialNotes: string | null;
  recommendedSequence: number[] | null;
  photos: {
    name: string;
    width: number;
    height: number;
    thumb: string | null;
    exif: ExifData | null;
  }[];
}
