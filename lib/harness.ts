import { Photo, ProviderConfig, Rating } from "./types";
import { callProvider, parseJSON } from "./providers";
import { CULL_PROMPT } from "./prompts";
import { resizeToMax } from "./resize";
import { formatExifForPrompt } from "./exif";

export const HARNESS_RUNS_PER_PHOTO = 5;
export const HARNESS_RESOLUTIONS = [1024, 1536] as const;

type HarnessResolution = 1024 | 1536;

export interface HarnessRunResult {
  resolution: HarnessResolution;
  runIndex: number;
  scores: { impact: number; composition: number; rawQuality: number; craftExecution: number; story: number };
  overall: number;
  rating: Rating;
}

export interface HarnessPhoto {
  photoId: string;
  filename: string;
  runs: HarnessRunResult[];
}

export interface HarnessReport {
  version: 1;
  ranAt: string;
  model: string;
  prompt: "cull-v-current";
  photos: HarnessPhoto[];
}

export interface DimensionVariance {
  impact: number;
  composition: number;
  rawQuality: number;
  craftExecution: number;
  story: number;
  overall: number;
}

export interface ResolutionStats {
  resolution: HarnessResolution;
  meanStdDev: DimensionVariance;
  ratingStability: number;
  boundaryCrossings: number;
  noiseFloor: DimensionVariance | null;
}

export interface HarnessSummary {
  totalPhotos: number;
  runsPerPhoto: number;
  resolution1024: ResolutionStats;
  resolution1536: ResolutionStats;
  resolutionDelta: DimensionVariance;
  top5MostVariant1024: {
    photoId: string;
    filename: string;
    overallStdDev: number;
    runs: HarnessRunResult[];
  }[];
}

type ProgressFn = (completed: number, total: number, photoName: string) => void;

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length);
}

function computeResolutionStats(photos: HarnessPhoto[], resolution: HarnessResolution): ResolutionStats {
  const perPhotoStdevs: DimensionVariance[] = [];
  let unanimousCount = 0;
  let boundaryCrossings = 0;
  const cutTierStdevs: DimensionVariance[] = [];

  for (const photo of photos) {
    const runs = photo.runs.filter(r => r.resolution === resolution);
    if (runs.length === 0) continue;

    const pv: DimensionVariance = {
      impact: stddev(runs.map(r => r.scores.impact)),
      composition: stddev(runs.map(r => r.scores.composition)),
      rawQuality: stddev(runs.map(r => r.scores.rawQuality)),
      craftExecution: stddev(runs.map(r => r.scores.craftExecution)),
      story: stddev(runs.map(r => r.scores.story)),
      overall: stddev(runs.map(r => r.overall)),
    };
    perPhotoStdevs.push(pv);

    const ratings = runs.map(r => r.rating);
    const unanimous = ratings.every(r => r === ratings[0]);
    if (unanimous) {
      unanimousCount++;
      if (ratings[0] === "CUT") cutTierStdevs.push(pv);
    } else {
      boundaryCrossings++;
    }
  }

  const n = perPhotoStdevs.length;
  const avg = (key: keyof DimensionVariance) =>
    n > 0 ? perPhotoStdevs.reduce((a, b) => a + b[key], 0) / n : 0;

  const nCut = cutTierStdevs.length;
  const avgCut = (key: keyof DimensionVariance) =>
    nCut > 0 ? cutTierStdevs.reduce((a, b) => a + b[key], 0) / nCut : 0;

  return {
    resolution,
    meanStdDev: {
      impact: avg("impact"),
      composition: avg("composition"),
      rawQuality: avg("rawQuality"),
      craftExecution: avg("craftExecution"),
      story: avg("story"),
      overall: avg("overall"),
    },
    ratingStability: n > 0 ? (unanimousCount / n) * 100 : 0,
    boundaryCrossings,
    noiseFloor: nCut > 0 ? {
      impact: avgCut("impact"),
      composition: avgCut("composition"),
      rawQuality: avgCut("rawQuality"),
      craftExecution: avgCut("craftExecution"),
      story: avgCut("story"),
      overall: avgCut("overall"),
    } : null,
  };
}

export function computeHarnessSummary(report: HarnessReport): HarnessSummary {
  const stats1024 = computeResolutionStats(report.photos, 1024);
  const stats1536 = computeResolutionStats(report.photos, 1536);

  const delta = (key: keyof DimensionVariance) =>
    stats1024.meanStdDev[key] - stats1536.meanStdDev[key];

  const photoVariance = report.photos
    .map(photo => {
      const runs1024 = photo.runs.filter(r => r.resolution === 1024);
      return {
        photoId: photo.photoId,
        filename: photo.filename,
        overallStdDev: stddev(runs1024.map(r => r.overall)),
        runs: runs1024,
      };
    })
    .sort((a, b) => b.overallStdDev - a.overallStdDev);

  return {
    totalPhotos: report.photos.length,
    runsPerPhoto: HARNESS_RUNS_PER_PHOTO,
    resolution1024: stats1024,
    resolution1536: stats1536,
    resolutionDelta: {
      impact: delta("impact"),
      composition: delta("composition"),
      rawQuality: delta("rawQuality"),
      craftExecution: delta("craftExecution"),
      story: delta("story"),
      overall: delta("overall"),
    },
    top5MostVariant1024: photoVariance.slice(0, 5),
  };
}

export function downloadHarnessReport(report: HarnessReport, summary: HarnessSummary): void {
  const output = { ...report, summary };
  const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cs-harness-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  let delay = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes("429") ||
        msg.includes("529") ||
        msg.includes("503") ||
        msg.toLowerCase().includes("overloaded") ||
        msg.toLowerCase().includes("rate");
      if (!retryable || attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error("callWithRetry: unreachable");
}

export async function runHarness(
  photos: Photo[],
  config: ProviderConfig,
  onProgress?: ProgressFn,
): Promise<HarnessReport> {
  if (config.provider !== "anthropic") {
    throw new Error("Harness is Anthropic-only in v1");
  }

  const totalCalls = photos.length * HARNESS_RESOLUTIONS.length * HARNESS_RUNS_PER_PHOTO;
  let completed = 0;
  const harnessPhotos: HarnessPhoto[] = [];

  for (const photo of photos) {
    const runs: HarnessRunResult[] = [];

    for (const resolution of HARNESS_RESOLUTIONS) {
      const b64 = await resizeToMax(photo, resolution, 0.85);

      for (let runIndex = 0; runIndex < HARNESS_RUNS_PER_PHOTO; runIndex++) {
        onProgress?.(completed, totalCalls, photo.name);

        try {
          const response = await callWithRetry(() =>
            callProvider(config.provider, config.apiKey, config.model, {
              system: CULL_PROMPT,
              images: [{ base64: b64, mediaType: "image/jpeg" }],
              textParts: [`[Photo 0: ${photo.name}${formatExifForPrompt(photo.exif)}]`],
              maxTokens: 512,
            }),
          );

          const parsed = parseJSON(response.text, response.truncated);
          const result = parsed.cull?.[0];
          const s = result?.scores;

          if (
            result &&
            s &&
            typeof s.impact === "number" &&
            typeof s.composition === "number" &&
            typeof s.rawQuality === "number" &&
            typeof s.craftExecution === "number" &&
            typeof s.story === "number"
          ) {
            runs.push({
              resolution,
              runIndex,
              scores: {
                impact: s.impact,
                composition: s.composition,
                rawQuality: s.rawQuality,
                craftExecution: s.craftExecution,
                story: s.story,
              },
              overall: result.score,
              rating: result.rating as Rating,
            });
          } else {
            console.warn(
              `[harness] ${photo.name} run ${runIndex} @ ${resolution}px: missing dimension scores — skipping`,
              result,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[harness] ${photo.name} run ${runIndex} @ ${resolution}px failed after retries: ${msg}`,
          );
        }

        completed++;
      }
    }

    harnessPhotos.push({ photoId: photo.id, filename: photo.name, runs });
  }

  onProgress?.(totalCalls, totalCalls, "");

  return {
    version: 1,
    ranAt: new Date().toISOString(),
    model: config.model,
    prompt: "cull-v-current",
    photos: harnessPhotos,
  };
}
