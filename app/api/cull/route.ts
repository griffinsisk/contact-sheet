import { NextRequest, NextResponse } from "next/server";
import { callProvider } from "@/lib/providers";
import { buildCullPrompt, type OverrideHint } from "@/lib/prompts";
import { SessionIntent, IntentPreset, Rating } from "@/lib/types";

// Server-side cull endpoint for the free + pro tiers. BYOK users call
// Anthropic directly from the browser and never hit this route.
//
// Body: { images; textParts; maxTokens?; intent?: SessionIntent }
// Returns: { text: string; truncated: boolean }

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_PRESETS: IntentPreset[] = [
  "documentary", "street", "film", "wildlife",
  "landscape", "portrait", "events", "mixed",
];

function coerceIntent(raw: unknown): SessionIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const preset = r.preset;
  if (typeof preset !== "string" || !VALID_PRESETS.includes(preset as IntentPreset)) return null;
  const freeForm = typeof r.freeForm === "string" ? r.freeForm.slice(0, 500) : undefined;
  return { preset: preset as IntentPreset, freeForm };
}

type ProfilePayload = { prose: string; aestheticTags: string[] };

function coerceProfile(raw: unknown): ProfilePayload | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") return "invalid";
  const r = raw as Record<string, unknown>;
  if (typeof r.prose !== "string") return "invalid";
  if (!Array.isArray(r.aestheticTags) || !r.aestheticTags.every(t => typeof t === "string")) return "invalid";
  return { prose: r.prose, aestheticTags: r.aestheticTags as string[] };
}

const VALID_RATINGS: Rating[] = ["HERO", "SELECT", "MAYBE", "CUT"];
const MAX_OVERRIDES = 10;

function coerceOverrides(raw: unknown): OverrideHint[] | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return "invalid";
  const out: OverrideHint[] = [];
  for (const item of raw.slice(0, MAX_OVERRIDES)) {
    if (!item || typeof item !== "object") return "invalid";
    const r = item as Record<string, unknown>;
    if (typeof r.shortDescription !== "string") return "invalid";
    if (typeof r.originalScore !== "number") return "invalid";
    if (typeof r.originalRating !== "string" || !VALID_RATINGS.includes(r.originalRating as Rating)) return "invalid";
    if (typeof r.userRating !== "string" || !VALID_RATINGS.includes(r.userRating as Rating)) return "invalid";
    out.push({
      shortDescription: r.shortDescription.slice(0, 300),
      originalScore: r.originalScore,
      originalRating: r.originalRating as Rating,
      userRating: r.userRating as Rating,
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfigured: ANTHROPIC_API_KEY not set" },
      { status: 500 },
    );
  }
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { images, textParts, maxTokens = 4096 } = body ?? {};
  if (!Array.isArray(images) || !Array.isArray(textParts)) {
    return NextResponse.json(
      { error: "Body must include images[] and textParts[]" },
      { status: 400 },
    );
  }

  const intent = coerceIntent(body?.intent);

  const profile = coerceProfile(body?.profile);
  if (profile === "invalid") {
    return NextResponse.json(
      { error: "profile must be { prose: string, aestheticTags: string[] }" },
      { status: 400 },
    );
  }

  const overrides = coerceOverrides(body?.overrides);
  if (overrides === "invalid") {
    return NextResponse.json(
      { error: "overrides must be an array of { shortDescription, originalScore, originalRating, userRating }" },
      { status: 400 },
    );
  }

  try {
    const response = await callProvider("anthropic", apiKey, model, {
      system: buildCullPrompt(intent, profile, overrides),
      images,
      textParts,
      maxTokens,
      // Intent-aware prompt varies per cull — disable system-prompt cache so
      // the cache doesn't lock in whichever intent was hit first.
      cacheSystem: false,
    });
    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Upstream error" },
      { status: 502 },
    );
  }
}
