import test from "node:test";
import assert from "node:assert/strict";

import { generateManifest, generateOrgScript, generateXMP, sanitizeFilename } from "../../lib/exports";
import type { CullResult, DeepResult, Photo } from "../../lib/types";

const photo: Photo = {
  id: "p1",
  base64: null,
  preview: "",
  name: "DSC_0001.JPG",
  width: 100,
  height: 100,
  mediaType: "image/jpeg",
  exif: null,
};

const cull: CullResult = {
  index: 0,
  score: 72,
  rating: "SELECT",
  reason: "Strong frame with clean geometry",
};

const deep: DeepResult = {
  index: 0,
  rating: "HERO",
  score: 88,
  scores: { impact: 90, composition: 88, rawQuality: 84, craftExecution: 86, story: 90 },
  title: "Warm <Light> & Waiting",
  technical: "Good dynamic range.",
  style_story: "Human moment lands.",
  verdict: "Portfolio candidate.",
};

test("sanitizeFilename normalizes titles for script-safe file names", () => {
  assert.equal(sanitizeFilename(" Warm <Light> & Waiting!! "), "warm_light_waiting");
});

test("generateXMP escapes XML and records human overrides", () => {
  const xmp = generateXMP(photo.name, cull, deep, "MAYBE");

  assert.match(xmp, /xmp:Rating="2"/);
  assert.match(xmp, /Warm &lt;Light&gt; &amp; Waiting/);
  assert.match(xmp, /HumanOverride/);
});

test("generateOrgScript sorts by effective rating when an override exists", () => {
  const script = generateOrgScript([photo], { 0: cull }, {}, null, "unix", false, { 0: "CUT" });

  assert.match(script.content, /mkdir -p "organized\/by_rating\/04_cuts"/);
  assert.match(script.content, /cp "DSC_0001.JPG" "organized\/by_rating\/04_cuts\/DSC_0001.JPG"/);
});

test("generateManifest shows the AI rating when a human override differs", () => {
  const manifest = generateManifest([photo], { 0: cull }, {}, null, null, { 0: "CUT" });

  assert.match(manifest, /Rating: CUT \(human override; AI rated SELECT\)/);
});
