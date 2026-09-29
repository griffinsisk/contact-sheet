import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import sharp from "sharp";
import { callProvider } from "@/lib/providers";
import {
  assertArrayLimit,
  readGuardedJson,
  REQUEST_GUARD_LIMITS,
  type GuardFailure,
} from "@/lib/request-guards";

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

PAST CORRECTIONS (optional, may be present after the photo set):
The photographer may have corrected an AI's earlier ratings on past frames. Each correction has a short description, the AI's original rating, and the photographer's revised rating. Use them as DIRECTION signals on top of the visual taste from favorites:
- A correction UP (e.g. CUT → MAYBE, CUT → HERO) means the photographer rescues frames the AI underrated — incorporate the described trait as something they value.
- A correction DOWN (e.g. HERO → CUT, SELECT → MAYBE) means the AI overrated — describe the deprioritized trait so future culls don't repeat the mistake.
- Larger rating gaps carry more weight than one-bucket nudges.
- Corrections are textual evidence; favorites are visual evidence. Prioritize favorites for the core taste read; let corrections refine direction and surface things the favorites alone don't show (especially counter-preferences).
- If correction count is low (<3) or descriptions are noisy, mention them only when they reinforce a clear pattern; don't manufacture a counter-preference from a single downgrade.

DO NOT describe genre ("they shoot landscapes and portraits") — that's obvious and doesn't describe taste.
DO NOT generalize into vague marketing language ("moody, cinematic, atmospheric"). Be specific and grounded in what you see.
DO NOT exceed the evidence. Reserve disclaimer for sets where taste traits genuinely don't survive, OR where non-photographic content dominates.

Write 100–150 words in second person ("You consistently frame…", "Your work favors…"). Lead with the strongest pattern. When corrections meaningfully shape the read, include a sentence like "You've also corrected the AI to deprioritize…" or "Your corrections show you rescue…". Only if taste traits don't survive (or non-photo content dominates), open with "This set doesn't show consistent taste signal yet — " and describe partial patterns.

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

interface RawEntry {
  photoHash: string;
  image: string;
}

const VALID_RATINGS = ["HERO", "SELECT", "MAYBE", "CUT"] as const;
type RatingLit = typeof VALID_RATINGS[number];

interface RawCorrection {
  shortDescription: string;
  originalRating: RatingLit;
  userRating: RatingLit;
  sessionIntent: string;
}

const MAX_CORRECTIONS = 30;

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

function coerceCorrections(raw: unknown): RawCorrection[] | null | "invalid" {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return "invalid";
  const out: RawCorrection[] = [];
  for (const item of raw.slice(0, MAX_CORRECTIONS)) {
    if (!item || typeof item !== "object") return "invalid";
    const r = item as Record<string, unknown>;
    if (typeof r.shortDescription !== "string" || !r.shortDescription.trim()) continue;
    if (typeof r.originalRating !== "string" || !VALID_RATINGS.includes(r.originalRating as RatingLit)) return "invalid";
    if (typeof r.userRating !== "string" || !VALID_RATINGS.includes(r.userRating as RatingLit)) return "invalid";
    if (typeof r.sessionIntent !== "string") return "invalid";
    out.push({
      shortDescription: r.shortDescription.slice(0, 300),
      originalRating: r.originalRating as RatingLit,
      userRating: r.userRating as RatingLit,
      sessionIntent: r.sessionIntent.slice(0, 40),
    });
  }
  return out;
}

const RATING_ORDER: RatingLit[] = ["CUT", "MAYBE", "SELECT", "HERO"];
function correctionDirection(c: RawCorrection): { dir: "UP" | "DOWN" | "FLAT"; magnitude: number } {
  const d = RATING_ORDER.indexOf(c.userRating) - RATING_ORDER.indexOf(c.originalRating);
  if (d > 0) return { dir: "UP", magnitude: d };
  if (d < 0) return { dir: "DOWN", magnitude: -d };
  return { dir: "FLAT", magnitude: 0 };
}

function formatCorrectionsBlock(corrections: RawCorrection[]): string {
  if (corrections.length === 0) return "";
  const lines = corrections.map((c) => {
    const { dir, magnitude } = correctionDirection(c);
    return `- "${c.shortDescription}" — ${c.originalRating} → ${c.userRating} (${dir} ${magnitude}, ${c.sessionIntent})`;
  });
  return `\n\nPAST CORRECTIONS BY THIS PHOTOGRAPHER (${corrections.length}):\n${lines.join("\n")}`;
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
  const { user } = await withAuth();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  // Note: WorkOS doesn't have publicMetadata like Clerk
  // For now, allow all authenticated users; implement tier check via your own database
  const isPro = true; // TODO: Implement tier check via database or WorkOS roles
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
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  const guarded = await readGuardedJson(req, "tasteProfile");
  if (!guarded.ok) return guardResponse(guarded);
  const body: any = guarded.value;

  const entriesLimit = assertArrayLimit(body, {
    field: "entries",
    label: "entries",
    max: REQUEST_GUARD_LIMITS.tasteProfile.maxEntries ?? 30,
  });
  if (!entriesLimit.ok) return guardResponse(entriesLimit);
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

  const corrections = coerceCorrections(body?.corrections);
  if (corrections === "invalid") {
    return NextResponse.json(
      { error: "corrections must be an array of { shortDescription, originalRating, userRating, sessionIntent }" },
      { status: 400 },
    );
  }

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
  const correctionsBlock = corrections ? formatCorrectionsBlock(corrections) : "";
  if (correctionsBlock) textParts.push(correctionsBlock);

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
