/**
 * Standalone validation script for the taste-profile prompt (Phase B.0).
 *
 * Run: npx tsx scripts/test-taste-profile.ts <dir> [--label <name>]
 *
 * Reads all .jpg/.jpeg/.png files from <dir>, resizes each to 512px on long
 * edge, base64-encodes, and runs a two-stage generation against the Anthropic
 * API. Stage 1: prose. Stage 2: extracts aestheticTags from the prose.
 *
 * Use to validate the Phase B design before building UI. Run on 4 sets:
 *   (a) real favorites
 *   (b) wildlife-only or other single-genre set
 *   (c) deliberately incoherent mix
 *   (d) re-run (a) for stability check
 *
 * The gate: output of (a) is recognizably you, (b) differs meaningfully from
 * (a), (c) admits low coherence, (d) is similar to (a).
 *
 * This script is throwaway — once Phase B ships, the same prompts live in
 * app/api/taste-profile/route.ts.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, extname, basename } from "node:path";
import sharp from "sharp";

// ── Env loading (no dotenv dependency; .env.local is a plain KEY=value file) ─

function loadEnvLocal(): Record<string, string> {
  const path = join(process.cwd(), ".env.local");
  const env: Record<string, string> = {};
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  } catch {
    // Script falls back to process.env if .env.local missing
  }
  return env;
}

// ── Anthropic client (direct fetch, no SDK) ─────────────────────────────────

interface ImagePart {
  base64: string;
  mediaType: string;
}

interface Call {
  apiKey: string;
  model: string;
  system: string;
  images: ImagePart[];
  textParts: string[];
  maxTokens: number;
}

async function callAnthropic(c: Call): Promise<string> {
  const content: any[] = [];
  c.images.forEach((img, i) => {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.base64 },
    });
    if (c.textParts[i]) content.push({ type: "text", text: c.textParts[i] });
  });
  if (c.textParts.length > c.images.length) {
    content.push({ type: "text", text: c.textParts.slice(c.images.length).join("\n\n") });
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": c.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: c.model,
      max_tokens: c.maxTokens,
      system: c.system,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = await res.json() as { content: { type: string; text: string }[] };
  return json.content.filter(b => b.type === "text").map(b => b.text).join("");
}

// ── Prompts ─────────────────────────────────────────────────────────────────

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

// ── Image processing ────────────────────────────────────────────────────────

async function loadAndResize(path: string): Promise<ImagePart> {
  const buf = await sharp(path)
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { base64: buf.toString("base64"), mediaType: "image/jpeg" };
}

function isImage(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg" || ext === ".png";
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dir = args[0];
  if (!dir) {
    console.error("Usage: npx tsx scripts/test-taste-profile.ts <dir> [--label <name>]");
    process.exit(1);
  }
  const labelIdx = args.indexOf("--label");
  const label = labelIdx !== -1 ? args[labelIdx + 1] : basename(dir);

  const env = { ...loadEnvLocal(), ...process.env };
  const apiKey = env.ANTHROPIC_API_KEY;
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not found in .env.local or environment");
    process.exit(1);
  }

  const files = readdirSync(dir)
    .filter(isImage)
    .map(f => join(dir, f))
    .sort();

  if (files.length < 4) {
    console.error(`Found only ${files.length} images in ${dir}; need at least 4.`);
    process.exit(1);
  }

  console.log(`\n── Taste profile test: "${label}" ──`);
  console.log(`Source: ${dir}`);
  console.log(`Images: ${files.length}`);
  console.log(`Model: ${model}\n`);

  console.log("Resizing images to 512px…");
  const t0 = Date.now();
  const images = await Promise.all(files.map(loadAndResize));
  const totalBytes = images.reduce((n, img) => n + img.base64.length, 0);
  console.log(`Done in ${Date.now() - t0}ms. Payload: ${(totalBytes / 1024 / 1024).toFixed(2)}MB (base64)\n`);

  console.log("Stage 1: generating prose…");
  const textParts = files.map((f, i) => `[Photo ${i + 1}: ${basename(f)}]`);
  const prose = (await callAnthropic({
    apiKey,
    model,
    system: PROSE_PROMPT,
    images,
    textParts,
    maxTokens: 600,
  })).trim();

  console.log("\n── PROSE ──");
  console.log(prose);

  console.log("\nStage 2: extracting tags from prose…");
  const tagsRaw = await callAnthropic({
    apiKey,
    model,
    system: TAGS_PROMPT,
    images: [],
    textParts: [`PROSE:\n${prose}`],
    maxTokens: 200,
  });

  const jsonMatch = tagsRaw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("Stage 2 returned no JSON; raw output:\n" + tagsRaw);
    process.exit(1);
  }
  const parsed = JSON.parse(jsonMatch[0]) as { aestheticTags: string[] };

  console.log("\n── TAGS ──");
  console.log(JSON.stringify(parsed.aestheticTags, null, 2));

  const coherenceMatch = prose.match(/\[COHERENCE:\s*(high|medium|low)\]/i);
  const coherence = coherenceMatch ? coherenceMatch[1].toLowerCase() : "(missing)";

  console.log("\n── QUICK-READ ──");
  console.log(`Label:      ${label}`);
  console.log(`Photos:     ${files.length}`);
  console.log(`Coherence:  ${coherence}`);
  console.log(`Tag count:  ${parsed.aestheticTags.length}`);
  console.log(`Tags:       ${parsed.aestheticTags.join(", ") || "(none)"}`);
  console.log(`Prose len:  ${prose.length} chars\n`);
}

main().catch(err => {
  console.error("\nFAIL:", err.message || err);
  process.exit(1);
});
