import { NextRequest, NextResponse } from "next/server";
import { callProvider } from "@/lib/providers";
import { buildCullPrompt } from "@/lib/prompts";
import { SessionIntent, IntentPreset } from "@/lib/types";

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

  try {
    const response = await callProvider("anthropic", apiKey, model, {
      system: buildCullPrompt(intent),
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
