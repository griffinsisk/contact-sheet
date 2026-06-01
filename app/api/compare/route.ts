import { NextRequest, NextResponse } from "next/server";
import { callProvider } from "@/lib/providers";
import { COMPARE_PROMPT } from "@/lib/prompts";
import {
  assertArrayLimit,
  readGuardedJson,
  REQUEST_GUARD_LIMITS,
  type GuardFailure,
} from "@/lib/request-guards";

// Server-side compare endpoint for the free + pro tiers.
//
// Body: { images: ImagePart[]; textParts: string[]; maxTokens?: number }
// Returns: { text: string; truncated: boolean }

export const runtime = "nodejs";
export const maxDuration = 60;

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server misconfigured: ANTHROPIC_API_KEY not set" },
      { status: 500 },
    );
  }
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  const guarded = await readGuardedJson(req, "compare");
  if (!guarded.ok) return guardResponse(guarded);
  const body: any = guarded.value;

  const { images, textParts, maxTokens = 1000 } = body ?? {};
  if (!Array.isArray(images) || !Array.isArray(textParts)) {
    return NextResponse.json(
      { error: "Body must include images[] and textParts[]" },
      { status: 400 },
    );
  }
  const expectedItems = REQUEST_GUARD_LIMITS.compare.maxImages ?? 2;
  const imagesLimit = assertArrayLimit(body, {
    field: "images",
    label: "images",
    min: expectedItems,
    max: expectedItems,
  });
  if (!imagesLimit.ok) return guardResponse(imagesLimit);
  const textPartsLimit = assertArrayLimit(body, {
    field: "textParts",
    label: "textParts",
    min: expectedItems,
    max: expectedItems,
  });
  if (!textPartsLimit.ok) return guardResponse(textPartsLimit);

  try {
    const response = await callProvider("anthropic", apiKey, model, {
      system: COMPARE_PROMPT,
      images,
      textParts,
      maxTokens,
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
