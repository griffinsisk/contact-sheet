import { NextRequest, NextResponse } from "next/server";
import { callProvider } from "@/lib/providers";
import { buildCullPrompt } from "@/lib/prompts";
import {
  assertArrayLimit,
  readGuardedJson,
  REQUEST_GUARD_LIMITS,
  type GuardFailure,
} from "@/lib/request-guards";
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

function guardResponse(failure: GuardFailure) {
  return NextResponse.json(
    { error: failure.error },
    {
      status: failure.status,
      headers: failure.retryAfterSeconds
        ? { "Retry-After": String(failure.retryAfterSeconds) }
        : undefined,
    },
  );
}

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfigured: ANTHROPIC_API_KEY not set" },
      { status: 500 },
    );
  }
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  const guarded = await readGuardedJson(req, "cull");
  if (!guarded.ok) return guardResponse(guarded);
  const body: any = guarded.value;

  const { images, textParts, maxTokens = 4096 } = body ?? {};
  if (!Array.isArray(images) || !Array.isArray(textParts)) {
    return NextResponse.json(
      { error: "Body must include images[] and textParts[]" },
      { status: 400 },
    );
  }
  const maxImages = REQUEST_GUARD_LIMITS.cull.maxImages ?? 20;
  const imagesLimit = assertArrayLimit(body, { field: "images", label: "images", max: maxImages });
  if (!imagesLimit.ok) return guardResponse(imagesLimit);
  const textPartsLimit = assertArrayLimit(body, { field: "textParts", label: "textParts", max: maxImages });
  if (!textPartsLimit.ok) return guardResponse(textPartsLimit);

  const intent = coerceIntent(body?.intent);

  const profile = coerceProfile(body?.profile);
  if (profile === "invalid") {
    return NextResponse.json(
      { error: "profile must be { prose: string, aestheticTags: string[] }" },
      { status: 400 },
    );
  }

  try {
    const response = await callProvider("anthropic", apiKey, model, {
      system: buildCullPrompt(intent, profile),
      images,
      textParts,
      maxTokens,
      // Anthropic's prompt cache is keyed by exact prefix content — each
      // (intent, profile) variant gets its own entry, so there's no
      // cross-intent contamination. Within one cull session every batch
      // sends an identical system prompt, so batches 2..N read the cache.
      cacheSystem: true,
    });
    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Upstream error" },
      { status: 502 },
    );
  }
}
