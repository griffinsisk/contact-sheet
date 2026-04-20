import { NextRequest, NextResponse } from "next/server";
import { callProvider } from "@/lib/providers";
import { CULL_PROMPT } from "@/lib/prompts";

// Server-side cull endpoint for the free + pro tiers. BYOK users call
// Anthropic directly from the browser and never hit this route.
//
// Body: { images: ImagePart[]; textParts: string[]; maxTokens?: number }
// Returns: { text: string; truncated: boolean }
//
// Auth is not enforced yet. Added in the next iteration alongside Clerk.

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

  const { images, textParts, maxTokens = 4096 } = body ?? {};
  if (!Array.isArray(images) || !Array.isArray(textParts)) {
    return NextResponse.json(
      { error: "Body must include images[] and textParts[]" },
      { status: 400 },
    );
  }

  try {
    const response = await callProvider("anthropic", apiKey, model, {
      system: CULL_PROMPT,
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
