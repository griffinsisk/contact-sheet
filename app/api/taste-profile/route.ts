import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import sharp from "sharp";
import { callProvider } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIN_ENTRIES = 4;
const MAX_ENTRIES = 30;

const PROSE_PROMPT = `You're a photo editor looking at a set of images a photographer has marked as favorites — frames they'd happily show as representative of their taste. Your job is to describe their AESTHETIC PREFERENCES — the traits that survive across different genres of work, not the genre itself.

Focus on traits that appear consistently across the set:
- Tonal palette (warm vs cool, muted vs saturated, high vs low contrast)
- Compositional habits (tight crops vs breathing room, negative space, centered vs off-axis, symmetry)
- Moment preference (candid vs posed, action vs stillness, unguarded vs performed)
- Light preference (hard vs soft, directional vs ambient, golden hour vs blue hour, backlit vs frontlit)
- Subject distance (intimate close vs expansive wide)
- What they AVOID (sterile, clinical, over-styled, posed, etc.)

Cross-genre breadth is normal and expected — favorites often span landscapes, portraits, wildlife, street, etc. Find the TASTE traits that survive across that breadth. **Genre breadth alone is not incoherence.**

NON-PHOTOGRAPHIC CONTENT: If a substantial portion of the set is non-photographic (screenshots, memes, illustrations, AI-generated imagery, scanned documents, UI captures), call that out explicitly. Do NOT mine a small photographic minority for a confident taste read — describe surface-level patterns only.

DO NOT describe genre ("they shoot landscapes and portraits") — that's obvious and doesn't describe taste.
DO NOT generalize into vague marketing language ("moody, cinematic, atmospheric"). Be specific and grounded in what you see.
DO NOT exceed the evidence. Reserve disclaimer for sets where taste traits genuinely don't survive, OR where non-photographic content dominates.

Write 100–150 words in second person ("You consistently frame…", "Your work favors…"). Lead with the strongest pattern. Only if taste traits don't survive (or non-photo content dominates), open with "This set doesn't show consistent taste signal yet — " and describe partial patterns.

After your prose, on a final separate line, output exactly one of these markers:
[COHERENCE: high]    — strong consistent taste signal across the set; ship a confident profile
[COHERENCE: medium]  — some patterns survive but evidence is partial; tags should be conservative
[COHERENCE: low]     — set lacks taste signal, dominated by non-photographic content, or photographic minority too small for reliable read

Respond with ONLY the prose followed by the marker line. No preamble, no markdown, no quotes.`;

const TAGS_PROMPT = `Read the prose below describing a photographer's taste. The prose ends with a marker line of the form \`[COHERENCE: high|medium|low]\`.

Coherence rule (mandatory — overrides everything else):
- \`[COHERENCE: low]\` → return an empty array. Not enough signal to ship tags.
- \`[COHERENCE: medium]\` → return 2–4 conservative tags only — the broadest, best-supported observations.
- \`[COHERENCE: high]\` → return 4–8 specific tags.

Tag style: short snake_case strings a downstream system uses as scoring context.

Good tags: warm_tones, tight_crops, candid_over_posed, shallow_dof, high_contrast, natural_light, negative_space_heavy, centered_composition, muted_palette, hard_shadows, environmental_portrait, intimate_distance.

Bad tags: cinematic (vague), moody (marketing), good_light (not a preference), photojournalist (genre not taste), artistic (useless).

Respond ONLY with valid JSON (no markdown, no backticks):
{"aestheticTags": ["tag_one", "tag_two"]}`;

interface RawEntry {
  photoHash: string;
  image: string;
}

function coerceEntries(raw: unknown): RawEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RawEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const r = item as Record<string, unknown>;
    if (typeof r.photoHash !== "string" || typeof r.image !== "string") return null;
    if (!r.photoHash || !r.image) return null;
    out.push({ photoHash: r.photoHash, image: r.image });
  }
  return out;
}

function decodeBase64Image(image: string): { buffer: Buffer; mediaType: string } | null {
  const dataUrlMatch = image.match(/^data:(image\/(?:jpeg|jpg|png));base64,(.+)$/);
  const b64 = dataUrlMatch ? dataUrlMatch[2] : image;
  const mediaType = dataUrlMatch ? dataUrlMatch[1].replace("image/jpg", "image/jpeg") : "image/jpeg";
  try {
    const buffer = Buffer.from(b64, "base64");
    if (buffer.length === 0) return null;
    return { buffer, mediaType };
  } catch {
    return null;
  }
}

async function resizeTo512(image: string): Promise<{ base64: string; mediaType: string } | null> {
  const decoded = decodeBase64Image(image);
  if (!decoded) return null;
  const buf = await sharp(decoded.buffer)
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { base64: buf.toString("base64"), mediaType: "image/jpeg" };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const user = await currentUser();
  const isPro = user?.publicMetadata?.tier === "pro";
  if (!isPro) {
    return NextResponse.json({ error: "Pro tier required" }, { status: 403 });
  }

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

  const entries = coerceEntries(body?.entries);
  if (!entries) {
    return NextResponse.json(
      { error: "Body must include entries[] of { photoHash, image }" },
      { status: 400 },
    );
  }
  if (entries.length < MIN_ENTRIES) {
    return NextResponse.json(
      { error: `Need at least ${MIN_ENTRIES} entries; got ${entries.length}` },
      { status: 400 },
    );
  }
  const capped = entries.slice(0, MAX_ENTRIES);

  let images: { base64: string; mediaType: string }[];
  try {
    const resized = await Promise.all(capped.map(e => resizeTo512(e.image)));
    if (resized.some(r => r === null)) {
      return NextResponse.json({ error: "One or more images failed to decode" }, { status: 400 });
    }
    images = resized as { base64: string; mediaType: string }[];
  } catch (err: any) {
    return NextResponse.json(
      { error: `Image preprocessing failed: ${err?.message || "unknown"}` },
      { status: 400 },
    );
  }

  const textParts = capped.map((_, i) => `[Photo ${i + 1}]`);

  try {
    const stage1 = await callProvider("anthropic", apiKey, model, {
      system: PROSE_PROMPT,
      images,
      textParts,
      maxTokens: 600,
      cacheSystem: false,
    });
    const rawProse = stage1.text.trim();

    const coherenceMatch = rawProse.match(/\[COHERENCE:\s*(high|medium|low)\]/i);
    const coherence = (coherenceMatch ? coherenceMatch[1].toLowerCase() : "medium") as
      | "high"
      | "medium"
      | "low";
    const prose = rawProse.replace(/\n*\[COHERENCE:\s*(?:high|medium|low)\]\s*$/i, "").trim();

    if (coherence === "low") {
      return NextResponse.json({
        prose,
        aestheticTags: [],
        coherence,
        generatedAt: Date.now(),
      });
    }

    const stage2 = await callProvider("anthropic", apiKey, model, {
      system: TAGS_PROMPT,
      images: [],
      textParts: [`PROSE:\n${rawProse}`],
      maxTokens: 200,
      cacheSystem: false,
    });

    const jsonMatch = stage2.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Tag extraction returned no JSON" },
        { status: 502 },
      );
    }
    let parsed: { aestheticTags: unknown };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: "Tag extraction returned invalid JSON" },
        { status: 502 },
      );
    }
    const tags = Array.isArray(parsed.aestheticTags)
      ? parsed.aestheticTags.filter((t): t is string => typeof t === "string")
      : [];

    return NextResponse.json({
      prose,
      aestheticTags: tags,
      coherence,
      generatedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Upstream error" },
      { status: 502 },
    );
  }
}
