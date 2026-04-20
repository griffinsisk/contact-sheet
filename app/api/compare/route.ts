import { NextRequest, NextResponse } from "next/server";
import { callProvider } from "@/lib/providers";
import { COMPARE_PROMPT } from "@/lib/prompts";

// Server-side compare endpoint for the free + pro tiers.
//
// Body: { images: ImagePart[]; textParts: string[]; maxTokens?: number }
// Returns: { text: string; truncated: boolean }

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const { images, textParts, maxTokens = 1000 } = body ?? {};
  if (!Array.isArray(images) || !Array.isArray(textParts)) {
    return NextResponse.json(
      { error: "Body must include images[] and textParts[]" },
      { status: 400 },
    );
  }

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
