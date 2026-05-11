import { expect, test } from "@playwright/test";
import sharp from "sharp";

const RED_DOT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

const BLUE_DOT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAwUBAUl8n7sAAAAASUVORK5CYII=",
  "base64",
);

async function makeFixturePng(seed: number): Promise<Buffer> {
  const width = 32;
  const height = 24;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      data[i] = (seed * 31 + x * 7 + y * 3) % 256;
      data[i + 1] = (seed * 47 + x * 2 + y * 11) % 256;
      data[i + 2] = (seed * 59 + x * 13 + y * 5) % 256;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function makeTasteSeedFiles() {
  return Promise.all(Array.from({ length: 8 }, async (_, i) => ({
    name: `seed-${i}.png`,
    mimeType: "image/png",
    buffer: await makeFixturePng(i),
  })));
}

async function uploadAndCullTwoPhotos(
  page: import("@playwright/test").Page,
  expectedSecond: RegExp = /blue-dot\.png, CUT, score 46/,
) {
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
  await expect(page.getByRole("button", { name: expectedSecond })).toBeVisible();
}

async function overrideEntryCount(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("cs-overrides");
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return parsed.entries?.length ?? 0;
  });
}

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

  await page.route("**/api/deep-review", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        text: JSON.stringify({
          analysis: [
            {
              index: 0,
              rating: "HERO",
              score: 76,
              scores: { impact: 76, composition: 74, rawQuality: 82, craftExecution: 72, story: 70 },
              title: "Red Study",
              editorialRole: "anchor",
              editDirection: "Hold the simple graphic read; deepen contrast while keeping the red field clean.",
              cropOrCompositionNote: "Keep the centered geometry; avoid cropping tighter.",
              technical: "Clean file with enough tonal room for a controlled edit.",
              style_story: "Works as a quiet graphic anchor for the shortlist.",
              verdict: "Use this as the opening anchor if the set leans minimal.",
            },
          ],
          curatorial_notes: "The shortlist reads strongest as a quiet graphic sequence.",
          recommended_sequence: [0],
        }),
        truncated: false,
      }),
    });
  });
});

test("creates and switches local taste profiles", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Upload Favorites" }).click();
  await expect(page.getByRole("button", { name: "My Profile" })).toBeVisible();

  await page.getByRole("button", { name: "New Profile" }).click();
  await page.getByLabel("Profile name").fill("Street");
  await page.getByRole("button", { name: "Create Profile" }).click();

  await expect(page.getByRole("button", { name: "Street" })).toHaveAttribute("aria-pressed", "true");

  const state = await page.evaluate(() => {
    const raw = window.localStorage.getItem("cs-taste-libraries");
    return raw ? JSON.parse(raw) : null;
  });
  expect(state.libraries.map((library: { name: string }) => library.name)).toEqual(["My Profile", "Street"]);
  expect(state.activeId).toBe(state.libraries[1].id);
});

test("keeps profile name input focused and seeds the newly created profile", async ({ page }) => {
  const seedFiles = await makeTasteSeedFiles();
  const now = Date.now();

  await page.route("**/api/taste-profile", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        prose: "You favor street frames with hard light and public gesture.",
        aestheticTags: ["hard_light", "street_gesture"],
        coherence: "high",
        generatedAt: now,
      }),
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "Upload Favorites" }).click();
  await page.getByRole("button", { name: "New Profile" }).click();

  const profileName = page.getByLabel("Profile name");
  await profileName.fill("");
  await profileName.pressSequentially("Street");
  await expect(profileName).toHaveValue("Street");
  await expect(profileName).toBeFocused();
  await expect(page.getByRole("region", { name: "Drop favorites here" })).toHaveCount(0);

  await page.getByRole("button", { name: "Create Profile" }).click();
  await expect(page.getByRole("button", { name: "Street" })).toHaveAttribute("aria-pressed", "true");

  const seedChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("region", { name: "Drop favorites here" }).click();
  const seedChooser = await seedChooserPromise;
  await seedChooser.setFiles(seedFiles);

  await expect(page.getByText("8 / 8–20")).toBeVisible();
  await page.getByRole("button", { name: "ADD TO LIBRARY" }).click();
  await expect(page.getByText("Taste profile ready", { exact: true })).toBeVisible();

  const state = await page.evaluate(() => {
    const raw = window.localStorage.getItem("cs-taste-libraries");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      activeId: parsed.activeId,
      libraries: parsed.libraries.map((library: { id: string; name: string; entries: unknown[]; currentProfile?: unknown }) => ({
        id: library.id,
        name: library.name,
        entryCount: library.entries.length,
        hasProfile: !!library.currentProfile,
      })),
    };
  });

  const main = state?.libraries.find((library: { name: string }) => library.name === "My Profile");
  const street = state?.libraries.find((library: { name: string }) => library.name === "Street");
  expect(main?.entryCount).toBe(0);
  expect(street?.entryCount).toBe(8);
  expect(street?.hasProfile).toBe(true);
  expect(state?.activeId).toBe(street?.id);
});

test("cull uses the selected active taste profile", async ({ page }) => {
  const requests: any[] = [];
  await page.unroute("**/api/cull");
  await page.route("**/api/cull", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        text: JSON.stringify({
          cull: [{
            index: 0,
            score: 72,
            rating: "SELECT",
            scores: { impact: 74, composition: 72, rawQuality: 80, craftExecution: 70, story: 62 },
            reason: "Profile-aware test result.",
          }],
        }),
        truncated: false,
      }),
    });
  });

  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.setItem("cs-taste-libraries", JSON.stringify({
      version: 2,
      activeId: "wedding",
      updatedAt: Date.now(),
      libraries: [
        {
          version: 2,
          id: "wedding",
          name: "Wedding",
          entries: [],
          currentProfile: { prose: "soft ceremony emotion", aestheticTags: ["soft"], generatedAt: 1, generatedFromEntryCount: 8 },
        },
        {
          version: 2,
          id: "street",
          name: "Street",
          entries: [],
          currentProfile: { prose: "hard light public moments", aestheticTags: ["hard_light"], generatedAt: 2, generatedFromEntryCount: 8 },
        },
      ],
    }));
  });
  await page.reload();

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Pick Files" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles([{ name: "red-dot.png", mimeType: "image/png", buffer: RED_DOT_PNG }]);

  await page.getByRole("button", { name: /Mixed/ }).click();
  await page.getByLabel("Taste profile", { exact: true }).selectOption("street");
  await page.getByRole("button", { name: /START CULL/i }).click();

  await expect.poll(() => Promise.resolve(requests[0]?.profile?.prose)).toBe("hard light public moments");
});

test("cull retries omitted photos instead of leaving them loading", async ({ page }) => {
  await page.unroute("**/api/cull");
  let cullCalls = 0;
  await page.route("**/api/cull", async (route) => {
    cullCalls++;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        text: JSON.stringify({
          cull: cullCalls === 1
            ? [
                {
                  index: 0,
                  score: 72,
                  rating: "SELECT",
                  scores: { impact: 74, composition: 72, rawQuality: 80, craftExecution: 70, story: 62 },
                  reason: "Clean color field with enough graphic impact for a first-pass select.",
                },
              ]
            : [
                {
                  index: 0,
                  score: 61,
                  rating: "MAYBE",
                  scores: { impact: 58, composition: 62, rawQuality: 78, craftExecution: 65, story: 45 },
                  reason: "Retry result returned for the omitted blue frame.",
                },
              ],
        }),
        truncated: false,
      }),
    });
  });

  await page.goto("/");

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Pick Files" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles([
    { name: "red-dot.png", mimeType: "image/png", buffer: RED_DOT_PNG },
    { name: "blue-dot.png", mimeType: "image/png", buffer: BLUE_DOT_PNG },
  ]);

  await page.getByRole("button", { name: /Mixed/ }).click();
  await page.getByRole("button", { name: /START CULL/i }).click();

  await expect(page.getByRole("button", { name: /red-dot\.png, SELECT, score 72/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /blue-dot\.png, MAYBE, score 60/ })).toBeVisible();
  expect(cullCalls).toBe(2);
});

test("cull, correction, and star signals are persisted with mocked APIs", async ({ page }) => {
  await uploadAndCullTwoPhotos(page);

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

  await expect.poll(async () => {
    return page.evaluate(() => {
      const raw = window.localStorage.getItem("cs-overrides");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.entries?.[0]?.profileIdAtCull || null;
    });
  }).not.toBeNull();

  await page.getByLabel("Add to taste library").first().click();
  await expect(page.getByText("Saved to library")).toBeVisible();

  await expect.poll(async () => {
    return page.evaluate(() => {
      const raw = window.localStorage.getItem("cs-taste-libraries");
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      const active = parsed.libraries.find((library: { id: string }) => library.id === parsed.activeId) ?? parsed.libraries[0];
      return active?.entries?.length ?? 0;
    });
  }).toBe(1);
});

test("seeded favorite duplicates are recognized during cull scoring", async ({ page }) => {
  const seedFiles = await makeTasteSeedFiles();
  const now = Date.now();

  await page.route("**/api/taste-profile", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        prose: "You favor textured gradients with warm atmospheric color.",
        aestheticTags: ["warm_tones", "textured_color", "atmospheric"],
        coherence: "high",
        generatedAt: now,
      }),
    });
  });

  await page.goto("/");

  const seedChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload Favorites" }).click();
  await page.getByRole("region", { name: "Drop favorites here" }).click();
  const seedChooser = await seedChooserPromise;
  await seedChooser.setFiles(seedFiles);

  await expect(page.getByText("8 / 8–20")).toBeVisible();
  await page.getByRole("button", { name: "ADD TO LIBRARY" }).click();
  await expect(page.getByText("Taste profile ready", { exact: true })).toBeVisible();

  const state = await page.evaluate(() => {
    const raw = window.localStorage.getItem("cs-taste-libraries");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const active = parsed.libraries.find((library: { id: string }) => library.id === parsed.activeId) ?? parsed.libraries[0];
    return { activeName: active.name, entryCount: active.entries.length, hasProfile: !!active.currentProfile };
  });
  expect(state?.entryCount).toBeGreaterThanOrEqual(8);
  expect(state?.hasProfile).toBe(true);

  await page.getByRole("button", { name: "DONE" }).click();

  const cullChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Pick Files" }).click();
  const cullChooser = await cullChooserPromise;
  await cullChooser.setFiles([seedFiles[0]]);

  await expect(page.getByText("1 photo loaded")).toBeVisible();
  await page.getByRole("button", { name: /Mixed/ }).click();
  await page.getByRole("button", { name: /START CULL/i }).click();

  await expect(page.getByRole("button", { name: /seed-0\.png, SELECT, score 74/ })).toBeVisible();
});

test("develop shortlist shows editor notes and secondary score", async ({ page }) => {
  await uploadAndCullTwoPhotos(page);

  await expect(page.getByRole("button", { name: /Develop shortlist for 1 photo/i })).toBeVisible();
  await page.getByRole("button", { name: /Develop shortlist for 1 photo/i }).click();

  await expect(page.getByText("Editor's Notes")).toBeVisible();
  await expect(page.getByText("The shortlist reads strongest as a quiet graphic sequence.")).toBeVisible();

  await page.getByRole("button", { name: /red-dot\.png, SELECT, score 72/ }).click();
  const panel = page.locator("aside");
  await expect(panel.getByText("FINAL SCORE")).toBeVisible();
  await expect(panel.getByText("72", { exact: true })).toBeVisible();
  await expect(page.getByText("ANCHOR", { exact: true })).toBeVisible();
  await expect(page.getByText("EDIT DIRECTION")).toBeVisible();
  await expect(page.getByText("Hold the simple graphic read; deepen contrast while keeping the red field clean.")).toBeVisible();
  await expect(page.getByText("CROP / COMPOSITION")).toBeVisible();
  await expect(page.getByText("Keep the centered geometry; avoid cropping tighter.")).toBeVisible();
  await expect(panel.getByText("TECHNICAL QUALITY")).toBeVisible();
  await expect(panel.getByText("EDITOR'S SCORE")).toBeVisible();
  await expect(panel.getByText("76", { exact: true })).toBeVisible();
});

test("develop shortlist includes photos promoted into select tier", async ({ page }) => {
  let deepReviewPayload: any = null;

  await page.unroute("**/api/cull");
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
              reason: "Clean color field with enough graphic impact for a first-pass select.",
            },
            {
              index: 1,
              score: 58,
              rating: "MAYBE",
              scores: { impact: 54, composition: 58, rawQuality: 75, craftExecution: 60, story: 42 },
              reason: "Marginal frame with enough raw material to reconsider.",
            },
          ],
        }),
        truncated: false,
      }),
    });
  });

  await page.unroute("**/api/deep-review");
  await page.route("**/api/deep-review", async (route) => {
    deepReviewPayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        text: JSON.stringify({
          analysis: [
            {
              index: 0,
              rating: "SELECT",
              score: 76,
              scores: { impact: 76, composition: 74, rawQuality: 82, craftExecution: 72, story: 70 },
              title: "Red Study",
              editorialRole: "anchor",
              editDirection: "Hold the simple graphic read.",
              cropOrCompositionNote: "Keep the centered geometry.",
              technical: "Clean file.",
              style_story: "Quiet graphic anchor.",
              verdict: "Use it.",
            },
            {
              index: 1,
              rating: "SELECT",
              score: 70,
              scores: { impact: 68, composition: 70, rawQuality: 76, craftExecution: 66, story: 62 },
              title: "Blue Study",
              editorialRole: "supporting",
              editDirection: "Use as a quieter supporting frame.",
              cropOrCompositionNote: "Keep it loose.",
              technical: "Usable file.",
              style_story: "Supports the sequence.",
              verdict: "Include if the set needs pacing.",
            },
          ],
          curatorial_notes: "Two-frame shortlist.",
          recommended_sequence: [0, 1],
        }),
        truncated: false,
      }),
    });
  });

  await uploadAndCullTwoPhotos(page, /blue-dot\.png, MAYBE, score 56/);

  await page.getByRole("button", { name: /blue-dot\.png, MAYBE, score 56/ }).click();
  await page.getByRole("button", { name: "Rate as SELECT" }).click();

  await expect(page.getByRole("button", { name: /Develop shortlist for 2 photos/i })).toBeVisible();
  await page.getByRole("button", { name: /Develop shortlist for 2 photos/i }).click();

  await expect.poll(() => deepReviewPayload).not.toBeNull();
  expect(deepReviewPayload.textParts).toHaveLength(2);
  expect(deepReviewPayload.textParts[1]).toContain("blue-dot.png");
});

test("reverting a correction back to the AI rating removes the override signal", async ({ page }) => {
  await uploadAndCullTwoPhotos(page);

  await page.getByRole("button", { name: /blue-dot\.png, CUT, score 46/ }).click();
  await page.getByRole("button", { name: "Rate as MAYBE" }).click();

  await expect(page.getByText("Correction saved")).toBeVisible();
  await expect(page.getByText("Corrected")).toBeVisible();
  await expect.poll(() => overrideEntryCount(page)).toBe(1);

  await page.getByRole("button", { name: "Rate as CUT" }).click();

  await expect.poll(() => overrideEntryCount(page)).toBe(0);
  await expect(page.getByText("Corrected")).toHaveCount(0);
  await expect(page.getByText("AI RATING")).toBeVisible();
});

test("correction toast distinguishes first fire, subsequent fire, and undo", async ({ page }) => {
  await uploadAndCullTwoPhotos(page);

  await page.evaluate(() => window.localStorage.removeItem("cs-overrides-toast-seen"));

  await page.getByRole("button", { name: /red-dot\.png, SELECT, score 72/ }).click();
  await page.getByRole("button", { name: "Rate as MAYBE" }).click();

  await expect(page.getByText("Correction saved")).toBeVisible();
  await expect(page.getByText(/Saved as a signal/)).toBeVisible();
  await expect.poll(() => overrideEntryCount(page)).toBe(1);

  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Correction saved")).toHaveCount(0);

  await page.getByRole("button", { name: /blue-dot\.png, CUT, score 46/ }).click();
  await page.getByRole("button", { name: "Rate as MAYBE" }).click();

  await expect(page.getByText("Correction saved")).toBeVisible();
  await expect(page.getByText(/Saved as a signal/)).toHaveCount(0);
  await expect.poll(() => overrideEntryCount(page)).toBe(2);

  await page.getByRole("button", { name: "Undo" }).click();

  await expect.poll(() => overrideEntryCount(page)).toBe(1);
  await expect(page.getByText("AI RATING")).toBeVisible();
  await expect(page.getByText("Correction saved")).toHaveCount(0);
  await expect.poll(async () => {
    return page.evaluate(() => {
      const raw = window.localStorage.getItem("cs-overrides");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.entries?.[0]?.originalRating ?? null;
    });
  }).toBe("SELECT");
});

test("profile modal shows Phase D signals and sends corrections on manual regen", async ({ page }) => {
  const now = Date.now();
  let tasteProfilePayload: any = null;

  await page.addInitScript(({ now, image }) => {
    window.localStorage.setItem("cs-taste-library", JSON.stringify({
      version: 1,
      entries: [0, 1, 2, 3, 4].map((i) => ({
        photoHash: `favorite-${i}`,
        addedAt: i === 4 ? now : now - (10_000 + i),
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
  await expect(page.getByLabel("Remove from library")).toHaveCount(5);
  await expect(page.getByText(/1 favorite pending — regen to apply/)).toBeVisible();
  await expect(page.getByLabel("Pending profile regen")).toHaveCount(1);
  await expect(page.getByText("Corrections feeding this profile")).toBeVisible();
  await expect(page.getByText(/1 pending — regen to apply/)).toBeVisible();
  await expect(page.getByText("Minimal red color field, centered composition, no visible subject or story")).toBeVisible();

  await page.getByRole("button", { name: /REGENERATE PROFILE/i }).click();

  await expect(page.getByText("Profile generated from 5 favorites.")).toBeVisible();
  await expect.poll(() => tasteProfilePayload).not.toBeNull();
  expect(tasteProfilePayload.entries).toHaveLength(5);
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
