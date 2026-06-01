import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import sharp from "sharp";

import { callProvider, parseJSON } from "../lib/providers";
import { buildCullPrompt } from "../lib/prompts";
import { applyProfileScoring } from "../lib/profile-scoring";
import type {
  CullResponse,
  CullResult,
  DimensionScores,
  IntentPreset,
  ProfileAlignment,
  Rating,
  SessionIntent,
} from "../lib/types";

type Range = [number, number];

type DimensionRanges = Partial<Record<keyof DimensionScores, Range>>;

interface AiEvalCase {
  id: string;
  file: string;
  intent: {
    preset: IntentPreset;
    freeForm?: string;
  };
  profile?: {
    prose: string;
    aestheticTags: string[];
  };
  libraryMatch?: boolean;
  expected: {
    allowedRatings?: Rating[];
    scoreRange?: Range;
    rubricScoreRange?: Range;
    profileDeltaRange?: Range;
    finalScoreRange?: Range;
    profileAlignment?: ProfileAlignment | ProfileAlignment[];
    dimensionRanges?: DimensionRanges;
    matchedTraitsMustMention?: string[];
    contradictedTraitsMustMention?: string[];
    mustMention?: string[];
    mustNotMention?: string[];
  };
}

interface CasesFile {
  version: 1;
  cases: AiEvalCase[];
}

interface AssertionResult {
  name: string;
  pass: boolean;
  actual: unknown;
  expected: unknown;
}

interface CaseResult {
  id: string;
  file: string;
  status: "pass" | "fail" | "error";
  assertions: AssertionResult[];
  rawText?: string;
  parsed?: unknown;
  scored?: CullResult;
  error?: string;
}

interface EvalReport {
  version: 1;
  ranAt: string;
  model: string;
  casesFile: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errored: number;
  };
  cases: CaseResult[];
}

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
    // Fall back to process.env when .env.local is absent.
  }
  return env;
}

function parseArgs(args: string[]): { casesPath: string; help: boolean } {
  const out = { casesPath: "eval-fixtures/cases.json", help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--cases") out.casesPath = args[++i] ?? out.casesPath;
    else if (!arg.startsWith("-")) out.casesPath = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function usage(): string {
  return `Usage: npm run eval:ai -- [--cases eval-fixtures/cases.json]

Requires ANTHROPIC_API_KEY in .env.local or the environment.
Copy eval-fixtures/cases.example.json to eval-fixtures/cases.json and add real photos before running.`;
}

function readCases(casesPath: string): { absolutePath: string; casesDir: string; data: CasesFile } {
  const absolutePath = resolve(process.cwd(), casesPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Cases file not found: ${casesPath}\n\n${usage()}`);
  }

  const parsed = JSON.parse(readFileSync(absolutePath, "utf8")) as CasesFile;
  if (parsed.version !== 1 || !Array.isArray(parsed.cases)) {
    throw new Error("Cases file must be { version: 1, cases: [...] }");
  }
  return { absolutePath, casesDir: dirname(absolutePath), data: parsed };
}

function resolveFixturePath(casesDir: string, file: string): string {
  return isAbsolute(file) ? file : resolve(casesDir, file);
}

async function loadEvalImage(path: string): Promise<{ base64: string; mediaType: string }> {
  const buf = await sharp(path)
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { base64: buf.toString("base64"), mediaType: "image/jpeg" };
}

function inRange(value: number | undefined, range: Range): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= range[0] && value <= range[1];
}

function textIncludesAll(text: string, needles: string[] | undefined): boolean {
  if (!needles || needles.length === 0) return true;
  const haystack = text.toLowerCase();
  return needles.every((needle) => haystack.includes(needle.toLowerCase()));
}

function textIncludesNone(text: string, needles: string[] | undefined): boolean {
  if (!needles || needles.length === 0) return true;
  const haystack = text.toLowerCase();
  return needles.every((needle) => !haystack.includes(needle.toLowerCase()));
}

function traitText(traits: string[] | undefined): string {
  return (traits ?? []).join(" | ");
}

function addAssertion(
  assertions: AssertionResult[],
  name: string,
  pass: boolean,
  actual: unknown,
  expected: unknown,
) {
  assertions.push({ name, pass, actual, expected });
}

function evaluateCase(scored: CullResult, testCase: AiEvalCase): AssertionResult[] {
  const assertions: AssertionResult[] = [];
  const expected = testCase.expected;

  if (expected.allowedRatings) {
    addAssertion(
      assertions,
      "rating is allowed",
      expected.allowedRatings.includes(scored.rating),
      scored.rating,
      expected.allowedRatings,
    );
  }

  if (expected.scoreRange) {
    addAssertion(assertions, "score range", inRange(scored.score, expected.scoreRange), scored.score, expected.scoreRange);
  }
  if (expected.rubricScoreRange) {
    addAssertion(assertions, "rubricScore range", inRange(scored.rubricScore, expected.rubricScoreRange), scored.rubricScore, expected.rubricScoreRange);
  }
  if (expected.profileDeltaRange) {
    addAssertion(assertions, "profileDelta range", inRange(scored.profileDelta, expected.profileDeltaRange), scored.profileDelta, expected.profileDeltaRange);
  }
  if (expected.finalScoreRange) {
    addAssertion(assertions, "finalScore range", inRange(scored.finalScore, expected.finalScoreRange), scored.finalScore, expected.finalScoreRange);
  }

  if (expected.profileAlignment) {
    const allowed = Array.isArray(expected.profileAlignment)
      ? expected.profileAlignment
      : [expected.profileAlignment];
    addAssertion(
      assertions,
      "profile alignment",
      !!scored.profileAffinity && allowed.includes(scored.profileAffinity.alignment),
      scored.profileAffinity?.alignment ?? null,
      allowed,
    );
  }

  for (const [key, range] of Object.entries(expected.dimensionRanges ?? {}) as [keyof DimensionScores, Range][]) {
    addAssertion(
      assertions,
      `${key} dimension range`,
      inRange(scored.scores?.[key], range),
      scored.scores?.[key] ?? null,
      range,
    );
  }

  addAssertion(
    assertions,
    "note includes required terms",
    textIncludesAll(scored.reason, expected.mustMention),
    scored.reason,
    expected.mustMention ?? [],
  );
  addAssertion(
    assertions,
    "note excludes forbidden terms",
    textIncludesNone(scored.reason, expected.mustNotMention),
    scored.reason,
    expected.mustNotMention ?? [],
  );

  const matchedTraits = traitText(scored.profileAffinity?.matchedTraits);
  addAssertion(
    assertions,
    "matched traits include required terms",
    textIncludesAll(matchedTraits, expected.matchedTraitsMustMention),
    scored.profileAffinity?.matchedTraits ?? [],
    expected.matchedTraitsMustMention ?? [],
  );

  const contradictedTraits = traitText(scored.profileAffinity?.contradictedTraits);
  addAssertion(
    assertions,
    "contradicted traits include required terms",
    textIncludesAll(contradictedTraits, expected.contradictedTraitsMustMention),
    scored.profileAffinity?.contradictedTraits ?? [],
    expected.contradictedTraitsMustMention ?? [],
  );

  return assertions;
}

async function runCase(
  testCase: AiEvalCase,
  casesDir: string,
  apiKey: string,
  model: string,
): Promise<CaseResult> {
  const imagePath = resolveFixturePath(casesDir, testCase.file);
  if (!existsSync(imagePath)) {
    return {
      id: testCase.id,
      file: testCase.file,
      status: "error",
      assertions: [],
      error: `Fixture image not found: ${imagePath}`,
    };
  }

  try {
    const image = await loadEvalImage(imagePath);
    const profile = testCase.profile
      ? { prose: testCase.profile.prose, aestheticTags: testCase.profile.aestheticTags }
      : null;
    const intent: SessionIntent = {
      preset: testCase.intent.preset,
      ...(testCase.intent.freeForm ? { freeForm: testCase.intent.freeForm } : {}),
    };

    const response = await callProvider("anthropic", apiKey, model, {
      system: buildCullPrompt(intent, profile),
      images: [image],
      textParts: [`[Photo 0: ${basename(imagePath)}]`],
      maxTokens: 1200,
    });

    const parsed = parseJSON(response.text, response.truncated) as CullResponse;
    const rawResult = parsed.cull?.[0];
    if (!rawResult) {
      throw new Error("Model response did not include cull[0]");
    }

    const scored = applyProfileScoring(
      { ...rawResult, index: 0 },
      { hasProfile: !!profile, libraryMatch: !!testCase.libraryMatch },
    );
    const assertions = evaluateCase(scored, testCase);
    const status = assertions.every((a) => a.pass) ? "pass" : "fail";

    return {
      id: testCase.id,
      file: testCase.file,
      status,
      assertions,
      rawText: response.text,
      parsed,
      scored,
    };
  } catch (err) {
    return {
      id: testCase.id,
      file: testCase.file,
      status: "error",
      assertions: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function writeReport(report: EvalReport): string {
  const dir = join(process.cwd(), "eval-results");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${timestamp()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

function printResult(result: CaseResult): void {
  const marker = result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : "ERROR";
  console.log(`${marker} ${result.id}`);
  if (result.error) {
    console.log(`  ${result.error}`);
    return;
  }
  for (const assertion of result.assertions.filter((a) => !a.pass)) {
    console.log(`  - ${assertion.name}: expected ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(assertion.actual)}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const { absolutePath, casesDir, data } = readCases(args.casesPath);
  if (data.cases.length === 0) {
    throw new Error("Cases file has no cases");
  }

  const env = { ...loadEnvLocal(), ...process.env };
  const apiKey = env.ANTHROPIC_API_KEY;
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not found in .env.local or environment");
  }

  console.log(`AI eval: ${data.cases.length} case${data.cases.length === 1 ? "" : "s"}`);
  console.log(`Cases: ${absolutePath}`);
  console.log(`Model: ${model}\n`);

  const results: CaseResult[] = [];
  for (const testCase of data.cases) {
    const result = await runCase(testCase, casesDir, apiKey, model);
    results.push(result);
    printResult(result);
  }

  const report: EvalReport = {
    version: 1,
    ranAt: new Date().toISOString(),
    model,
    casesFile: absolutePath,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "fail").length,
      errored: results.filter((r) => r.status === "error").length,
    },
    cases: results,
  };

  const reportPath = writeReport(report);
  console.log(`\nResults: ${reportPath}`);
  console.log(`Summary: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.failed} failed, ${report.summary.errored} errored`);

  if (report.summary.failed > 0 || report.summary.errored > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nFAIL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
