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
  editorialRole: "anchor",
  editDirection: "Hold the simple graphic read; deepen contrast while keeping the red field clean.",
  cropOrCompositionNote: "Keep the centered geometry; avoid cropping tighter.",
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

test("generateXMP keeps cull score primary when editor notes exist", () => {
  const xmp = generateXMP(photo.name, cull, deep);

  assert.match(xmp, /xmp:Rating="4"/);
  assert.match(xmp, /Warm &lt;Light&gt; &amp; Waiting/);
  assert.match(xmp, /Score:72/);
});

test("generateOrgScript sorts by effective rating when an override exists", () => {
  const script = generateOrgScript([photo], { 0: cull }, {}, null, "unix", false, { 0: "CUT" });

  assert.match(script.content, /mkdir -p "organized\/by_rating\/04_cuts"/);
  assert.match(script.content, /cp "DSC_0001.JPG" "organized\/by_rating\/04_cuts\/DSC_0001.JPG"/);
});

test("generateOrgScript keeps cull rating primary when editor notes differ", () => {
  const script = generateOrgScript([photo], { 0: cull }, { 0: deep }, null, "unix");

  assert.match(script.content, /mkdir -p "organized\/by_rating\/02_selects"/);
  assert.match(script.content, /cp "DSC_0001.JPG" "organized\/by_rating\/02_selects\/DSC_0001.JPG"/);
  assert.doesNotMatch(script.content, /organized\/by_rating\/01_heroes/);
});

test("generateManifest shows the AI rating when a human override differs", () => {
  const manifest = generateManifest([photo], { 0: cull }, {}, null, null, { 0: "CUT" });

  assert.match(manifest, /Rating: CUT \(human override; AI rated SELECT\)/);
});

test("generateManifest includes editor notes fields for deep results", () => {
  const manifest = generateManifest(
    [photo],
    { 0: cull },
    { 0: deep },
    "The shortlist reads strongest as a quiet graphic sequence.",
    [0],
  );

  assert.match(manifest, /EDITOR'S NOTES/);
  assert.match(manifest, /1\. DSC_0001\.JPG \(SELECT — 72\)/);
  assert.match(manifest, /Rating: SELECT \| Cull Score: 72\/100/);
  assert.match(manifest, /Editor's Score: 88\/100/);
  assert.match(manifest, /Editorial Role: anchor/);
  assert.match(manifest, /Edit Direction: Hold the simple graphic read; deepen contrast while keeping the red field clean\./);
  assert.match(manifest, /Crop \/ Composition: Keep the centered geometry; avoid cropping tighter\./);
});
