import { expect, test } from "@playwright/test";

const RED_DOT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

const BLUE_DOT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAwUBAUl8n7sAAAAASUVORK5CYII=",
  "base64",
);

test.beforeEach(async ({ page }) => {
  await page.route("**/api/cull", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        text: JSON.stringify({
          cull: [
            {
              index: 0,
              score: 72,
              rating: "SELECT",
              scores: { impact: 74, composition: 72, rawQuality: 80, craftExecution: 70, story: 62 },
              reason: "Clean color field with enough graphic impact for a first-pass select. Outside your library's strong traits, scored on standalone merits.",
            },
            {
              index: 1,
              score: 48,
              rating: "CUT",
              scores: { impact: 40, composition: 45, rawQuality: 75, craftExecution: 60, story: 25 },
              reason: "Too little subject or moment to develop beyond a color test. Outside your library's strong traits, scored on standalone merits.",
            },
          ],
        }),
        truncated: false,
      }),
    });
  });

  await page.route("**/api/override-describe", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        description: "Minimal red color field, centered composition, no visible subject or story",
      }),
    });
  });
});

test("cull, correction, and star signals are persisted with mocked APIs", async ({ page }) => {
  await page.goto("/");

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Pick Files" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles([
    { name: "red-dot.png", mimeType: "image/png", buffer: RED_DOT_PNG },
    { name: "blue-dot.png", mimeType: "image/png", buffer: BLUE_DOT_PNG },
  ]);

  await expect(page.getByText("2 photos loaded")).toBeVisible();
  await page.getByRole("button", { name: /Mixed/ }).click();
  await page.getByRole("button", { name: /START CULL/i }).click();

  await expect(page.getByRole("button", { name: /red-dot\.png, SELECT, score 72/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /blue-dot\.png, CUT, score 48/ })).toBeVisible();

  await page.getByRole("button", { name: /red-dot\.png, SELECT, score 72/ }).click();
  await page.getByRole("button", { name: "Rate as MAYBE" }).click();

  await expect(page.getByText("Correction saved")).toBeVisible();
  await expect(page.getByText("Corrected")).toBeVisible();

  await expect.poll(async () => {
    return page.evaluate(() => {
      const raw = window.localStorage.getItem("cs-overrides");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.entries?.[0]?.shortDescription || null;
    });
  }).toBe("Minimal red color field, centered composition, no visible subject or story");

  await page.getByLabel("Add to taste library").first().click();
  await expect(page.getByText("Saved to library")).toBeVisible();

  await expect.poll(async () => {
    return page.evaluate(() => {
      const raw = window.localStorage.getItem("cs-taste-library");
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return parsed.entries?.length ?? 0;
    });
  }).toBe(1);
});

test("profile modal shows Phase D signals and sends corrections on manual regen", async ({ page }) => {
  const now = Date.now();
  let tasteProfilePayload: any = null;

  await page.addInitScript(({ now, image }) => {
    window.localStorage.setItem("cs-taste-library", JSON.stringify({
      version: 1,
      entries: [0, 1, 2, 3].map((i) => ({
        photoHash: `favorite-${i}`,
        addedAt: now - (10_000 + i),
        originalRating: "SELECT",
        image,
      })),
      currentProfile: {
        prose: "You favor warm color fields, quiet geometry, and simple subject isolation.",
        aestheticTags: ["warm_tones", "quiet_geometry", "subject_isolation"],
        generatedAt: now - 5_000,
        generatedFromEntryCount: 4,
      },
      lastRegenAt: now - 1_000,
    }));
    window.localStorage.setItem("cs-overrides", JSON.stringify({
      version: 1,
      entries: [
        {
          photoHash: "override-1",
          shortDescription: "Minimal red color field, centered composition, no visible subject or story",
          sessionIntent: "mixed",
          originalScore: 48,
          originalRating: "CUT",
          userRating: "SELECT",
          timestamp: now,
        },
      ],
    }));
  }, { now, image: RED_DOT_PNG.toString("base64") });

  await page.route("**/api/taste-profile", async (route) => {
    tasteProfilePayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        prose: "You favor warm color fields, quiet geometry, and corrected rescues with simple subject isolation.",
        aestheticTags: ["warm_tones", "quiet_geometry", "rescued_minimal_frames"],
        coherence: "high",
        generatedAt: now + 1_000,
      }),
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "View Profile" }).click();
  await expect(page.getByText("Favorites feeding this profile")).toBeVisible();
  await expect(page.getByLabel("Remove from library")).toHaveCount(4);
  await expect(page.getByText("Corrections feeding this profile")).toBeVisible();
  await expect(page.getByText(/1 pending — regen to apply/)).toBeVisible();
  await expect(page.getByText("Minimal red color field, centered composition, no visible subject or story")).toBeVisible();

  await page.getByRole("button", { name: /REGENERATE PROFILE/i }).click();

  await expect(page.getByText("Profile generated from 4 favorites.")).toBeVisible();
  await expect.poll(() => tasteProfilePayload).not.toBeNull();
  expect(tasteProfilePayload.entries).toHaveLength(4);
  expect(tasteProfilePayload.corrections).toEqual([
    {
      shortDescription: "Minimal red color field, centered composition, no visible subject or story",
      originalRating: "CUT",
      userRating: "SELECT",
      sessionIntent: "mixed",
    },
  ]);

  await expect(page.getByText(/pending — regen to apply/)).toHaveCount(0);
});
