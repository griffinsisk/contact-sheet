import { NextRequest, NextResponse } from "next/server";
import { callProvider } from "@/lib/providers";
import { DEEP_REVIEW_PROMPT, EXPERIENCE_VOICE } from "@/lib/prompts";

// Server-side deep-review endpoint for the free + pro tiers.
//
// Body: {
//   images: ImagePart[];
//   textParts: string[];
//   maxTokens?: number;
//   level?: "learning" | "enthusiast" | "pro";
// }
// Returns: { text: string; truncated: boolean }

export const runtime = "nodejs";
export const maxDuration = 120;

type Level = keyof typeof EXPERIENCE_VOICE;

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

  const { images, textParts, maxTokens = 16384, level = "enthusiast" } = body ?? {};
  if (!Array.isArray(images) || !Array.isArray(textParts)) {
    return NextResponse.json(
      { error: "Body must include images[] and textParts[]" },
      { status: 400 },
    );
  }

  const voice = EXPERIENCE_VOICE[level as Level] ?? EXPERIENCE_VOICE.enthusiast;
  const system = DEEP_REVIEW_PROMPT + voice;

  try {
    const response = await callProvider("anthropic", apiKey, model, {
      system,
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
