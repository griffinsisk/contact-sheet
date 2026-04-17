import { useState, useRef, useCallback, useEffect, useMemo } from "react";

// ── EXIF Parser ─────────────────────────────────────────────────────────────
// Minimal JPEG EXIF reader — extracts camera settings from APP1 segment

function readEXIF(arrayBuffer) {
  try {
    const view = new DataView(arrayBuffer);
    if (view.getUint16(0) !== 0xFFD8) return null; // not JPEG

    let offset = 2;
    while (offset < view.byteLength - 1) {
      const marker = view.getUint16(offset);
      if (marker === 0xFFE1) { // APP1 — EXIF
        const length = view.getUint16(offset + 2);
        return parseExifSegment(view, offset + 4, length - 2);
      }
      if ((marker & 0xFF00) !== 0xFF00) break;
      offset += 2 + view.getUint16(offset + 2);
    }
    return null;
  } catch { return null; }
}

function parseExifSegment(view, start, length) {
  // Check for "Exif\0\0"
  if (view.getUint32(start) !== 0x45786966 || view.getUint16(start + 4) !== 0x0000) return null;

  const tiffStart = start + 6;
  const endian = view.getUint16(tiffStart);
  const le = endian === 0x4949; // little-endian (Intel)

  const g16 = (o) => view.getUint16(tiffStart + o, le);
  const g32 = (o) => view.getUint32(tiffStart + o, le);

  const readStr = (o, len) => {
    let s = "";
    for (let i = 0; i < len; i++) {
      const c = view.getUint8(tiffStart + o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };

  const readRational = (o) => {
    const num = g32(o);
    const den = g32(o + 4);
    return den ? num / den : 0;
  };

  const result = {};

  const readIFD = (ifdOffset, isExifSub) => {
    if (ifdOffset + 2 > length) return;
    const count = g16(ifdOffset);
    for (let i = 0; i < count; i++) {
      const entryOff = ifdOffset + 2 + i * 12;
      if (entryOff + 12 > tiffStart + start + length - 6) break;
      const tag = g16(entryOff);
      const type = g16(entryOff + 2);
      const cnt = g32(entryOff + 4);
      const valOff = entryOff + 8;

      // Value or pointer to value
      const dataOff = (type === 2 && cnt > 4) || (type === 5 && cnt >= 1) || (type === 10 && cnt >= 1) || (cnt * [0,1,1,2,4,8,1,1,2,4,8][type] > 4)
        ? g32(valOff) : null;

      switch (tag) {
        case 0x010F: // Make
          result.make = readStr(dataOff !== null ? dataOff : valOff, Math.min(cnt, 64));
          break;
        case 0x0110: // Model
          result.model = readStr(dataOff !== null ? dataOff : valOff, Math.min(cnt, 64));
          break;
        case 0xA434: // LensModel
          result.lens = readStr(dataOff !== null ? dataOff : valOff, Math.min(cnt, 128));
          break;
        case 0x8827: // ISO
          result.iso = type === 3 ? g16(valOff) : g32(valOff);
          break;
        case 0x829A: // ExposureTime
          if (dataOff !== null) {
            const num = g32(dataOff);
            const den = g32(dataOff + 4);
            if (den && num) {
              result.shutterSpeed = den / num >= 2 ? `1/${Math.round(den / num)}s` : `${(num / den).toFixed(1)}s`;
              result.shutterRaw = num / den;
            }
          }
          break;
        case 0x829D: // FNumber
          if (dataOff !== null) {
            const fn = readRational(dataOff);
            if (fn) result.aperture = fn;
          }
          break;
        case 0x920A: // FocalLength
          if (dataOff !== null) {
            const fl = readRational(dataOff);
            if (fl) result.focalLength = Math.round(fl);
          }
          break;
        case 0xA405: // FocalLengthIn35mm
          result.focalLength35 = type === 3 ? g16(valOff) : g32(valOff);
          break;
        case 0x9209: // Flash
          result.flash = g16(valOff);
          break;
        case 0x8769: // ExifIFD pointer
          if (!isExifSub) {
            readIFD(g32(valOff), true);
          }
          break;
      }
    }
  };

  const firstIFDOff = g32(4);
  readIFD(firstIFDOff, false);

  // Clean up model — remove make prefix if duplicated
  if (result.make && result.model && result.model.startsWith(result.make)) {
    result.model = result.model.substring(result.make.length).trim();
  }

  return Object.keys(result).length > 0 ? result : null;
}

function formatExifLine(exif) {
  if (!exif) return null;
  const parts = [];
  if (exif.iso) parts.push(`ISO ${exif.iso}`);
  if (exif.focalLength) parts.push(`${exif.focalLength}mm`);
  if (exif.aperture) parts.push(`f/${exif.aperture % 1 === 0 ? exif.aperture.toFixed(0) : exif.aperture.toFixed(1)}`);
  if (exif.shutterSpeed) parts.push(exif.shutterSpeed);
  return parts.length > 0 ? parts.join("  ·  ") : null;
}

function formatExifCamera(exif) {
  if (!exif) return null;
  const parts = [];
  if (exif.make) parts.push(exif.make);
  if (exif.model) parts.push(exif.model);
  const camera = parts.join(" ");
  if (exif.lens) return camera ? `${camera}  ·  ${exif.lens}` : exif.lens;
  return camera || null;
}

// Build text for sending to Claude alongside the image
function formatExifForPrompt(exif) {
  if (!exif) return "";
  const parts = [];
  if (exif.iso) parts.push(`ISO ${exif.iso}`);
  if (exif.focalLength) parts.push(`${exif.focalLength}mm`);
  if (exif.aperture) parts.push(`f/${exif.aperture % 1 === 0 ? exif.aperture.toFixed(0) : exif.aperture.toFixed(1)}`);
  if (exif.shutterSpeed) parts.push(exif.shutterSpeed);
  if (exif.make || exif.model) parts.push([exif.make, exif.model].filter(Boolean).join(" "));
  if (exif.lens) parts.push(exif.lens);
  return parts.length > 0 ? ` | ${parts.join(", ")}` : "";
}


// ── Prompts ──────────────────────────────────────────────────────────────────

const CULL_PROMPT = `You're a photo editor doing a first pass on a batch of photos straight from the camera. This is the cull — fast, decisive, no hand-holding. You're sorting the pile into keepers and cuts.

You're evaluating these BEFORE post-processing. Don't penalize flat contrast, muted colors, or lack of color grading — that's what Lightroom is for. Judge what can't be fixed in post: focus accuracy, composition, moment, light quality, dynamic range.

If camera settings (ISO, focal length, aperture, shutter speed) are provided, factor them in — a soft shot at 1/30s handheld is a different problem than soft at 1/500s.

Score each photo on a single 0–100 scale:
- 85-100: HERO — Portfolio-worthy. Stop-you-in-your-tracks good.
- 70-84: SELECT — Strong, publishable. Worth developing.
- 50-69: MAYBE — Something there but not fully realized.
- 0-49: CUT — Move on. Technical failure, missed moment, or redundant to a stronger frame.

CALIBRATION: 50 is a competent but unremarkable photo. Below 40 means real problems. Above 80 is genuinely special. Use the full range.

Be honest. If two frames capture the same moment, flag the weaker one. Don't cluster scores — differentiate.

Respond ONLY with valid JSON (no markdown, no backticks, no preamble):
{
  "cull": [
    {
      "index": 0,
      "score": 72,
      "rating": "SELECT",
      "reason": "One concise sentence — what makes this a keeper or a cut"
    }
  ]
}`;

const DEEP_REVIEW_PROMPT = `You're a photo editor and photographer who's been in the game for years — you've shot editorially, shown in galleries, and you genuinely love looking at other people's work. You're the friend photographers trust because you're honest without being harsh, specific without being clinical.

Your critiques are grounded in real frameworks — PPA 12 Elements, Feldman's critical method, Cartier-Bresson's decisive moment — but you don't lecture. You just naturally think that way.

These photos have already been culled from a larger set — they're the ones the photographer wants to go deeper on. Give them your full attention.

You're evaluating these BEFORE post-processing. Don't penalize flat contrast, muted colors, or lack of grading. Judge what can't be fixed in post: focus accuracy, dynamic range, exposure recoverability, light quality, depth of field choices. If camera settings are provided, reference them — "at f/1.4 some softness is expected" or "plenty of room at ISO 400 to push the shadows."

Score each photo across four dimensions (each 0–100):

IMPACT (30% of overall) — Did this one stop you? Does it make you feel something before you even start analyzing?

COMPOSITION (30% of overall) — How the frame is built. Eye flow, geometry, negative space, figure-ground. Does it feel inevitable?

TECHNICAL EXCELLENCE (20% of overall) — The raw material. Is focus nailed? Is there dynamic range to work with? Is the light quality good? Don't penalize unedited look — score whether the foundation is there.

STYLE & STORY (20% of overall) — Decisive moment, narrative pull, authenticity. Would you want to know what happened next?

OVERALL SCORE: (impact × 0.30) + (composition × 0.30) + (technical × 0.20) + (style_story × 0.20). Round to integer.

RATING: 85-100 HERO, 70-84 SELECT, 50-69 MAYBE, 0-49 CUT.

VOICE:
- You're reviewing at the cull stage — before editing. Judge what was captured, not how it looks out of camera.
- Talk about what you actually see in the frame, not abstractions.
- When images look unedited, note the potential: "plenty of tonal range here" not "colors feel muddy."
- Titles should be evocative — what you'd scribble on the back of a print.
- Curatorial notes: like talking over coffee about what you see across the set.

Respond ONLY with valid JSON (no markdown, no backticks, no preamble):
{
  "analysis": [
    {
      "index": 0,
      "rating": "HERO",
      "score": 87,
      "scores": { "impact": 90, "composition": 88, "technical": 82, "style_story": 85 },
      "title": "Short evocative title",
      "technical": "2-3 sentences on craft, composition, raw potential — what's sharp, recoverable, what the light is doing",
      "style_story": "2-3 sentences on feeling, story, moment, photographer's eye",
      "verdict": "1 sentence — the honest takeaway"
    }
  ],
  "curatorial_notes": "2-3 sentences about the set — themes, which frames talk to each other, what story this set tells",
  "recommended_sequence": [0, 2, 1]
}

SCORING CALIBRATION ANCHORS:
- Technically sound but emotionally flat landscape (sharp, good range, nothing happening): impact 30, comp 70, tech 88, style 25 → ~50
- Strong candid moment, slightly soft focus, tilted horizon (moment is there, material is workable): impact 75, comp 55, tech 45, style 80 → ~64
- Well-composed portrait, great light quality, genuine expression, tonal range to grade: impact 82, comp 85, tech 80, style 78 → ~82
- Once-in-a-lifetime — perfect timing, geometry, emotion, sharp where it matters: impact 96, comp 94, tech 90, style 95 → ~94`;

const COMPARE_PROMPT = `You're a photo editor comparing two frames. This is the cull stage — before editing. Which frame has more potential? Be decisive. Reference what you see in each frame and factor in camera settings if provided.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "frame_a": { "strengths": "Specific strengths", "weaknesses": "Where it falls short" },
  "frame_b": { "strengths": "Specific strengths", "weaknesses": "Where it falls short" },
  "pick": "A" or "B",
  "reasoning": "2-3 sentences on what tips the decision"
}`;

const EXPERIENCE_VOICE = {
  pro: `\nVOICE — PRO: Full technical shorthand. Don't explain concepts. "DOF at f/2.8 is giving you busy bokeh — stop down." Direct, efficient.`,
  enthusiast: `\nVOICE — ENTHUSIAST: Conversational. Name techniques naturally but don't assume they know every term. Specific to the frame.`,
  learning: `\nVOICE — LEARNING: Every critique is a micro-lesson. Explain concepts in context of their photo: "See how the bright window pulls your eye? That's a competing center of interest." Connect to what they can try next time.`,
};

// ── Constants ────────────────────────────────────────────────────────────────

const RATING_CONFIG = {
  HERO:   { color: "#f0c040", bg: "rgba(240,192,64,0.10)",  border: "rgba(240,192,64,0.3)" },
  SELECT: { color: "#6ec87a", bg: "rgba(110,200,122,0.10)", border: "rgba(110,200,122,0.3)" },
  MAYBE:  { color: "#a0a0a0", bg: "rgba(160,160,160,0.08)", border: "rgba(160,160,160,0.2)" },
  CUT:    { color: "#c75050", bg: "rgba(199,80,80,0.08)",   border: "rgba(199,80,80,0.2)" },
};

const SCORE_DIMENSIONS = {
  impact:      { label: "IMPACT",        color: "#e8a035", weight: "30%" },
  composition: { label: "COMPOSITION",   color: "#6ea4d4", weight: "30%" },
  technical:   { label: "TECHNICAL",     color: "#8b5cf6", weight: "20%" },
  style_story: { label: "STYLE & STORY", color: "#06b6d4", weight: "20%" },
};

const CULL_BATCH = 20;
const DEEP_BATCH = 12;

// ── Storage ──────────────────────────────────────────────────────────────────

async function saveSession(sessionId, data) {
  try {
    await window.storage.set(`session:${sessionId}`, JSON.stringify(data));
    let index = [];
    try { const e = await window.storage.get("session-index"); index = JSON.parse(e.value); } catch {}
    index = index.filter(s => s.id !== sessionId);
    index.unshift({ id: sessionId, date: data.date, photoCount: data.photoCount, heroCount: data.heroCount, selectCount: data.selectCount, level: data.level, hasDeepReview: data.hasDeepReview || false });
    index = index.slice(0, 20);
    await window.storage.set("session-index", JSON.stringify(index));
  } catch (e) { console.error("Save failed:", e); }
}

async function loadSessionIndex() {
  try { const r = await window.storage.get("session-index"); return JSON.parse(r.value); } catch { return []; }
}

async function loadSession(id) {
  try { const r = await window.storage.get(`session:${id}`); return JSON.parse(r.value); } catch { return null; }
}

async function deleteSession(id) {
  try {
    await window.storage.delete(`session:${id}`);
    let index = [];
    try { const e = await window.storage.get("session-index"); index = JSON.parse(e.value); } catch {}
    index = index.filter(s => s.id !== id);
    await window.storage.set("session-index", JSON.stringify(index));
  } catch (e) { console.error("Delete failed:", e); }
}

function makeThumb(dataUrl) {
  return new Promise(r => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const s = 160; let w = img.width, h = img.height;
      if (w > h) { h = (h * s) / w; w = s; } else { w = (w * s) / h; h = s; }
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      r(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => r(null);
    img.src = dataUrl;
  });
}

// ── Export ────────────────────────────────────────────────────────────────────

const STAR_MAP = { HERO: 5, SELECT: 4, MAYBE: 2, CUT: 1 };
const LABEL_MAP = { HERO: "Winner", SELECT: "Second", MAYBE: "Approved", CUT: "Rejected" };

function generateXMP(filename, analysis, deepAnalysis) {
  const a = deepAnalysis || analysis;
  const stars = STAR_MAP[a.rating] || 0;
  const label = LABEL_MAP[a.rating] || "";
  const title = deepAnalysis?.title || "";
  const desc = deepAnalysis
    ? `${deepAnalysis.technical || ""}\n\n${deepAnalysis.style_story || ""}\n\n${deepAnalysis.verdict || ""}`.trim()
    : a.reason || "";
  const score = a.score || 0;
  const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
      xmp:Rating="${stars}"
      xmp:Label="${label}"
      ${title ? `photoshop:Headline="${esc(title)}"` : ""}
    >
      ${title ? `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title>` : ""}
      ${desc ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${esc(desc)}</rdf:li></rdf:Alt></dc:description>` : ""}
      <dc:subject><rdf:Bag>
        <rdf:li>ContactSheet</rdf:li>
        <rdf:li>${a.rating}</rdf:li>
        <rdf:li>Score:${score}</rdf:li>
      </rdf:Bag></dc:subject>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;
}

function sanitizeFilename(title) {
  return title.replace(/[^\w\s-]/g,"").replace(/\s+/g,"_").replace(/_+/g,"_").replace(/^_|_$/g,"").substring(0,60).toLowerCase();
}

function generateOrgScript(photos, analyses, deepAnalyses, recommendedSequence, platform = "unix", renameFiles = false) {
  const rf = { HERO: "01_heroes", SELECT: "02_selects", MAYBE: "03_maybes", CUT: "04_cuts" };
  const isWin = platform === "windows";
  const mkdir = isWin ? "mkdir" : "mkdir -p";
  const cp = isWin ? "copy" : "cp";
  const sep = isWin ? "\\" : "/";
  const ext = isWin ? ".bat" : ".sh";
  const cmt = isWin ? "REM" : "#";
  let s = (isWin ? "@echo off\n" : "#!/bin/bash\n");
  s += `${cmt} Contact Sheet — File Organization Script\n`;
  s += `${cmt} Generated ${new Date().toISOString()}\n`;
  s += `${cmt} Copies files — originals are never moved or deleted.\n`;
  if (renameFiles) s += `${cmt} RENAME MODE: Files renamed with AI titles, original name as suffix.\n`;
  s += "\n";

  const folders = new Set();
  photos.forEach((p, i) => { const a = analyses[i]; if (a) folders.add(rf[a.rating] || "04_cuts"); });
  s += `${cmt} === Rating Tier Folders ===\n`;
  folders.forEach(f => { s += `${mkdir} "organized${sep}by_rating${sep}${f}"\n`; });
  s += "\n";

  photos.forEach((p, i) => {
    const a = analyses[i]; if (!a) return;
    const folder = rf[a.rating] || "04_cuts";
    const fileExt = p.name.split(".").pop();
    let destName = p.name;
    if (renameFiles) {
      const da = deepAnalyses?.[i];
      const title = da?.title || a.reason;
      if (title) { const safe = sanitizeFilename(title); const orig = p.name.replace(/\.[^.]+$/,""); destName = `${safe}__${orig}.${fileExt}`; }
    }
    s += `${cp} "${p.name}" "organized${sep}by_rating${sep}${folder}${sep}${destName}"\n`;
  });

  if (recommendedSequence?.length > 0) {
    s += `\n${cmt} === Narrative Sequence ===\n`;
    s += `${mkdir} "organized${sep}sequence"\n`;
    recommendedSequence.forEach((idx, n) => {
      const p = photos[idx]; if (!p) return;
      const pad = String(n + 1).padStart(3, "0");
      const fileExt = p.name.split(".").pop();
      let destName = p.name;
      if (renameFiles) { const da = deepAnalyses?.[idx]; if (da?.title) destName = `${sanitizeFilename(da.title)}.${fileExt}`; }
      s += `${cp} "${p.name}" "organized${sep}sequence${sep}${pad}_${destName}"\n`;
    });
  }
  return { content: s, filename: `organize${ext}` };
}

function generateManifest(photos, analyses, deepAnalyses, curatorialNotes, recommendedSequence) {
  let t = "CONTACT SHEET — ANALYSIS MANIFEST\n" + `Generated: ${new Date().toISOString()}\n` + "=".repeat(60) + "\n\n";
  if (curatorialNotes) t += "CURATORIAL NOTES\n" + "-".repeat(40) + "\n" + curatorialNotes + "\n\n";
  if (recommendedSequence?.length) {
    t += "RECOMMENDED SEQUENCE\n" + "-".repeat(40) + "\n";
    recommendedSequence.forEach((idx, i) => { const p = photos[idx]; const a = analyses[idx]; if (p && a) t += `${i+1}. ${p.name} (${a.rating} — ${a.score})\n`; });
    t += "\n";
  }
  t += "PER-PHOTO ANALYSIS\n" + "=".repeat(60) + "\n\n";
  photos.forEach((p, i) => {
    const a = analyses[i]; if (!a) return;
    const da = deepAnalyses?.[i];
    t += `${p.name}\n` + "-".repeat(40) + "\n";
    t += `Rating: ${a.rating} | Overall: ${a.score}/100\n`;
    if (da?.scores) t += `Impact: ${da.scores.impact} | Composition: ${da.scores.composition} | Technical: ${da.scores.technical} | Style & Story: ${da.scores.style_story}\n`;
    if (da?.title) t += `Title: ${da.title}\n`;
    t += `\n`;
    if (da) {
      t += `Technical & Composition:\n${da.technical}\n\nStyle & Story:\n${da.style_story}\n\nVerdict: ${da.verdict}\n`;
    } else {
      t += `Cull note: ${a.reason}\n`;
    }
    if (p.exif) { const el = formatExifLine(p.exif); const ec = formatExifCamera(p.exif); if (el) t += `Settings: ${el}\n`; if (ec) t += `Camera: ${ec}\n`; }
    t += "\n" + "=".repeat(60) + "\n\n";
  });
  t += "Scoring: PPA 12 Elements · Feldman Method · Decisive Moment\nWeights: Impact 30% · Composition 30% · Technical 20% · Style & Story 20%\n";
  return t;
}

function downloadFile(content, filename, type = "text/plain") {
  const b = new Blob([content], { type }); const u = URL.createObjectURL(b);
  const a = document.createElement("a"); a.href = u; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
}

// ── Image utilities ──────────────────────────────────────────────────────────

function resizeImage(file, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    // First read as ArrayBuffer for EXIF
    const exifReader = new FileReader();
    exifReader.onerror = () => reject(new Error("Failed to read file"));
    exifReader.onload = (exifEvent) => {
      const exif = readEXIF(exifEvent.target.result);

      // Then read as data URL for the Image element
      const imgReader = new FileReader();
      imgReader.onerror = () => reject(new Error("Failed to read file"));
      imgReader.onload = (imgEvent) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let w = img.width, h = img.height;
          if (w > h && w > maxDim) { h = (h * maxDim) / w; w = maxDim; }
          else if (h > maxDim) { w = (w * maxDim) / h; h = maxDim; }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          resolve({
            id: crypto.randomUUID(),
            base64: dataUrl.split(",")[1],
            preview: dataUrl,
            name: file.name,
            width: Math.round(w), height: Math.round(h),
            mediaType: "image/jpeg",
            exif: exif,
          });
        };
        img.src = imgEvent.target.result;
      };
      imgReader.readAsDataURL(file);
    };
    exifReader.readAsArrayBuffer(file);
  });
}

// Make a smaller version for the cull pass
function downsizeForCull(photo) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxDim = 512;
      let w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = (h * maxDim) / w; w = maxDim; }
      else if (h > maxDim) { w = (w * maxDim) / h; h = maxDim; }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = () => resolve(photo.base64); // fallback to original
    img.src = photo.preview;
  });
}

// ── API calls ────────────────────────────────────────────────────────────────

async function apiCall(systemPrompt, imageContent, maxTokens = 8192) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: imageContent }],
    }),
  });
  if (!response.ok) { const err = await response.text().catch(() => ""); throw new Error(`API ${response.status}: ${err.slice(0, 200)}`); }
  const data = await response.json();
  if (data.error) throw new Error(`API error: ${data.error?.message || JSON.stringify(data.error)}`);
  const text = data.content?.filter(c => c.type === "text").map(c => c.text).join("") || "";
  if (!text) throw new Error("Empty API response");
  const clean = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); }
  catch {
    // Attempt repair for truncated JSON
    if (data.stop_reason === "max_tokens") {
      const repaired = repairJSON(clean);
      if (repaired) return repaired;
      throw new Error("Response truncated — try fewer photos per batch");
    }
    throw new Error(`JSON parse failed: ${clean.slice(0, 200)}`);
  }
}

function repairJSON(text) {
  try {
    // Find last complete object by looking for last "reason" or "verdict" field
    const pat = /"(?:reason|verdict)"\s*:\s*"[^"]*"/g;
    let last = null, m;
    while ((m = pat.exec(text)) !== null) last = m;
    if (!last) return null;
    let pos = last.index + last[0].length;
    let depth = 0;
    for (let i = pos; i < text.length; i++) {
      if (text[i] === "{") depth++;
      if (text[i] === "}") { if (depth === 0) { pos = i + 1; break; } depth--; }
    }
    let repaired = text.substring(0, pos);
    // Detect which structure we're in
    if (text.includes('"cull"')) {
      repaired += "] }";
    } else {
      repaired += '], "curatorial_notes": "Analysis was partially truncated.", "recommended_sequence": [] }';
    }
    const parsed = JSON.parse(repaired);
    parsed._truncated = true;
    return parsed;
  } catch { return null; }
}

async function runCullBatch(photos, onProgress) {
  const allResults = {};
  const batches = [];
  for (let i = 0; i < photos.length; i += CULL_BATCH) {
    batches.push(photos.slice(i, i + CULL_BATCH).map((p, j) => ({ ...p, globalIndex: i + j })));
  }

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    onProgress?.(`Culling batch ${bi + 1} of ${batches.length}…`, bi, batches.length);

    // Downsize images for cull pass
    const cullImages = await Promise.all(batch.map(p => downsizeForCull(p)));

    const content = batch.map((p, i) => [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: cullImages[i] } },
      { type: "text", text: `[Photo ${i}: ${p.name}${formatExifForPrompt(p.exif)}]` },
    ]).flat();

    const result = await apiCall(CULL_PROMPT, content, 4096);
    const cullData = result.cull || result.analysis || [];
    cullData.forEach(c => {
      const gIdx = batch[c.index]?.globalIndex ?? c.index;
      allResults[gIdx] = { ...c, index: gIdx };
    });
  }
  return allResults;
}

async function runDeepReview(photos, indices, level = "enthusiast", onProgress) {
  const subset = indices.map(i => ({ ...photos[i], globalIndex: i }));
  const batches = [];
  for (let i = 0; i < subset.length; i += DEEP_BATCH) {
    batches.push(subset.slice(i, i + DEEP_BATCH));
  }

  const allResults = {};
  let lastNotes = null;
  let lastSequence = null;

  const prompt = DEEP_REVIEW_PROMPT + (EXPERIENCE_VOICE[level] || EXPERIENCE_VOICE.enthusiast);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    onProgress?.(`Deep review ${bi + 1} of ${batches.length}…`, bi, batches.length);

    const content = batch.map((p, i) => [
      { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } },
      { type: "text", text: `[Photo ${i}: ${p.name}${formatExifForPrompt(p.exif)}]` },
    ]).flat();

    const result = await apiCall(prompt, content, 16384);
    (result.analysis || []).forEach(a => {
      const gIdx = batch[a.index]?.globalIndex ?? a.index;
      allResults[gIdx] = { ...a, index: gIdx };
    });
    lastNotes = result.curatorial_notes;
    lastSequence = result.recommended_sequence?.map(i => batch[i]?.globalIndex ?? i);
  }
  return { analyses: allResults, curatorialNotes: lastNotes, recommendedSequence: lastSequence };
}

async function compareImages(a, b) {
  const content = [
    { type: "image", source: { type: "base64", media_type: a.mediaType, data: a.base64 } },
    { type: "text", text: `[Frame A: ${a.name}${formatExifForPrompt(a.exif)}]` },
    { type: "image", source: { type: "base64", media_type: b.mediaType, data: b.base64 } },
    { type: "text", text: `[Frame B: ${b.name}${formatExifForPrompt(b.exif)}]\n\nCompare these two frames. Which is stronger?` },
  ];
  return apiCall(COMPARE_PROMPT, content, 1000);
}


// ── UI Components ────────────────────────────────────────────────────────────

function ScoreBar({ label, score, color, showValue }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.35)", marginBottom: 3, letterSpacing: "0.1em" }}>
        <span>{label}</span>
        {showValue && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>{score}</span>}
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 1s cubic-bezier(0.16,1,0.3,1)" }} />
      </div>
    </div>
  );
}

function RatingBadge({ rating, size = "sm" }) {
  const rc = RATING_CONFIG[rating] || RATING_CONFIG.CUT;
  const sm = size === "sm";
  return (
    <span style={{
      display: "inline-block", padding: sm ? "2px 7px" : "4px 12px", borderRadius: 3,
      fontSize: sm ? 9 : 11, fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.1em",
      color: rc.color, background: rc.bg, border: `1px solid ${rc.border}`,
    }}>{rating}</span>
  );
}

function ExifBar({ exif }) {
  const line = formatExifLine(exif);
  const camera = formatExifCamera(exif);
  if (!line && !camera) return null;
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
      padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 4,
      fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", letterSpacing: "0.04em",
    }}>
      {line && <span>{line}</span>}
      {camera && <span style={{ color: "rgba(255,255,255,0.18)" }}>{camera}</span>}
    </div>
  );
}

function Thumbnail({ photo, index, cullData, deepData, isSelected, isCompareSelected, compareLabel, isDeepSelected, onClick, onCompareClick, onDeepToggle, sequenceNumber, phase }) {
  const analysis = deepData || cullData;
  const rc = analysis ? (RATING_CONFIG[analysis.rating] || RATING_CONFIG.CUT) : null;
  const borderColor = isCompareSelected ? "#f0c040" : isSelected ? "#fff" : "rgba(255,255,255,0.06)";

  return (
    <div
      onClick={() => onClick(index)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(index); } }}
      tabIndex={0}
      role="button"
      aria-label={`${photo.name}${analysis ? `, ${analysis.rating}, score ${analysis.score}` : ""}`}
      style={{
        position: "relative", cursor: "pointer", borderRadius: 6, overflow: "hidden",
        background: "#111", border: `2px solid ${borderColor}`, transition: "border-color 0.2s", outline: "none",
      }}
    >
      <div style={{ position: "relative", aspectRatio: "1/1", overflow: "hidden" }}>
        <img src={photo.preview} alt={photo.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />

        {!analysis && (
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite" }} />
        )}

        {analysis && (
          <div style={{ position: "absolute", top: 8, left: 8 }}><RatingBadge rating={analysis.rating} /></div>
        )}

        {analysis && (
          <div style={{
            position: "absolute", top: 8, right: 8, minWidth: 32, height: 32, borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#fff",
            background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", border: `1.5px solid ${rc.color}`,
          }}>{analysis.score}</div>
        )}

        {sequenceNumber != null && (
          <div style={{ position: "absolute", bottom: 8, left: 8, width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "#fff", background: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.2)" }}>{sequenceNumber}</div>
        )}

        {/* Compare checkbox */}
        {analysis && (
          <button onClick={e => { e.stopPropagation(); onCompareClick(index); }} tabIndex={-1} style={{
            position: "absolute", bottom: 8, right: 8, width: 26, height: 26, borderRadius: 4,
            border: isCompareSelected ? "1.5px solid #f0c040" : "1.5px solid rgba(255,255,255,0.2)",
            background: isCompareSelected ? "rgba(240,192,64,0.3)" : "rgba(0,0,0,0.6)",
            color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", backdropFilter: "blur(8px)", padding: 0,
          }}>{isCompareSelected ? compareLabel : "⇔"}</button>
        )}

        {/* Deep review toggle — show after cull, before deep review runs */}
        {phase === "culled" && cullData && onDeepToggle && (
          <button onClick={e => { e.stopPropagation(); onDeepToggle(index); }} tabIndex={-1} style={{
            position: "absolute", bottom: 8, left: 8, height: 22, borderRadius: 3, padding: "0 8px",
            border: isDeepSelected ? "1px solid rgba(240,192,64,0.4)" : "1px solid rgba(255,255,255,0.15)",
            background: isDeepSelected ? "rgba(240,192,64,0.15)" : "rgba(0,0,0,0.6)",
            color: isDeepSelected ? "#f0c040" : "rgba(255,255,255,0.4)",
            fontSize: 9, fontFamily: "monospace", cursor: "pointer", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            {isDeepSelected ? "✓ REVIEW" : "+ REVIEW"}
          </button>
        )}

        {/* Filename when no sequence number or deep toggle */}
        {!sequenceNumber && phase !== "culled" && (
          <div style={{ position: "absolute", bottom: 8, left: 8, fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.5)", background: "rgba(0,0,0,0.6)", padding: "2px 6px", borderRadius: 3, maxWidth: "65%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{photo.name}</div>
        )}
      </div>

      {/* Below thumbnail */}
      <div style={{ padding: "6px 10px 8px" }}>
        {deepData?.title && (
          <p style={{ margin: "0 0 6px", fontSize: 12, fontStyle: "italic", color: "rgba(255,255,255,0.55)", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deepData.title}</p>
        )}
        {!deepData?.title && cullData?.reason && (
          <p style={{ margin: "0 0 6px", fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cullData.reason}</p>
        )}
        {/* EXIF compact line */}
        {photo.exif && (
          <div style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: deepData?.scores ? 6 : 0 }}>
            {formatExifLine(photo.exif)}
          </div>
        )}
        {deepData?.scores && (
          <div style={{ display: "flex", gap: 3 }}>
            {Object.entries(SCORE_DIMENSIONS).map(([key, dim]) => (
              <div key={key} style={{ flex: 1 }} title={`${dim.label}: ${deepData.scores[key] || 0}`}>
                <div style={{ height: 2, background: "rgba(255,255,255,0.06)", borderRadius: 1, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${deepData.scores[key] || 0}%`, background: dim.color, borderRadius: 1, transition: "width 0.8s ease" }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailPanel({ photo, cullData, deepData, onClose }) {
  const analysis = deepData || cullData;
  if (!analysis) return null;
  const rc = RATING_CONFIG[analysis.rating] || RATING_CONFIG.CUT;

  return (
    <div style={{ width: "100%", height: "100%", background: "#0a0a0a", overflowY: "auto", animation: "fadeIn 0.25s ease" }}>
      <button onClick={onClose} aria-label="Close" style={{
        position: "sticky", top: 0, zIndex: 10, width: "100%", padding: "14px 20px",
        background: "rgba(10,10,10,0.92)", backdropFilter: "blur(12px)", border: "none",
        borderBottom: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)",
        fontSize: 11, fontFamily: "monospace", cursor: "pointer", textAlign: "left",
      }}>← CLOSE · ESC</button>

      <img src={photo.preview} alt={photo.name} style={{ width: "100%", display: "block" }} />

      {/* EXIF bar under image */}
      {photo.exif && <div style={{ padding: "0 20px", marginTop: 12 }}><ExifBar exif={photo.exif} /></div>}

      <div style={{ padding: "20px 24px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <RatingBadge rating={analysis.rating} size="md" />
          <span style={{ fontSize: 28, fontFamily: "monospace", fontWeight: 700, color: rc.color }}>{analysis.score}</span>
          <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.25)" }}>/100</span>
        </div>

        {deepData?.title && (
          <p style={{ fontSize: 20, fontStyle: "italic", color: "rgba(255,255,255,0.8)", lineHeight: 1.4, margin: "0 0 24px" }}>{deepData.title}</p>
        )}

        {/* Deep review: full score bars */}
        {deepData?.scores && (
          <div style={{ marginBottom: 24 }}>
            {Object.entries(SCORE_DIMENSIONS).map(([key, dim]) => (
              <ScoreBar key={key} label={`${dim.label} (${dim.weight})`} score={deepData.scores[key] || 0} color={dim.color} showValue />
            ))}
          </div>
        )}

        {/* Deep review: written feedback */}
        {deepData?.technical && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 9, fontFamily: "monospace", color: SCORE_DIMENSIONS.technical.color, letterSpacing: "0.15em", textTransform: "uppercase" }}>Technical & Composition · Raw Potential</h4>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{deepData.technical}</p>
          </div>
        )}
        {deepData?.style_story && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 9, fontFamily: "monospace", color: SCORE_DIMENSIONS.style_story.color, letterSpacing: "0.15em", textTransform: "uppercase" }}>Style & Story</h4>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{deepData.style_story}</p>
          </div>
        )}
        {deepData?.verdict && (
          <div style={{ borderLeft: `3px solid ${rc.color}`, paddingLeft: 16, marginTop: 24 }}>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, fontStyle: "italic" }}>{deepData.verdict}</p>
          </div>
        )}

        {/* Cull-only: just the reason */}
        {!deepData && cullData?.reason && (
          <div style={{ borderLeft: `3px solid ${rc.color}`, paddingLeft: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{cullData.reason}</p>
          </div>
        )}

        <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <p style={{ margin: 0, fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.12)", lineHeight: 1.6 }}>
            {deepData ? "Evaluated using PPA merit image principles · Feldman critical method · Decisive moment theory" : "Cull pass — quick triage. Select for Deep Review for full analysis."}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompareModal({ photoA, photoB, onClose }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const missing = !photoA.base64 || !photoB.base64;

  useEffect(() => {
    if (missing) { setLoading(false); setError("restored"); return; }
    let c = false;
    (async () => { try { const r = await compareImages(photoA, photoB); if (!c) setResult(r); } catch { if (!c) setError("failed"); } finally { if (!c) setLoading(false); } })();
    return () => { c = true; };
  }, []);

  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const pickColor = result?.pick === "A" ? RATING_CONFIG.HERO.color : RATING_CONFIG.SELECT.color;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.94)", backdropFilter: "blur(16px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, overflowY: "auto" }} role="dialog">
      <button onClick={onClose} style={{ position: "absolute", top: 20, right: 24, background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "monospace", cursor: "pointer" }}>✕ CLOSE · ESC</button>
      <h2 style={{ fontWeight: 400, fontSize: 20, color: "rgba(255,255,255,0.8)", margin: "0 0 24px", fontStyle: "italic" }}>Which frame is stronger?</h2>

      <div style={{ display: "flex", gap: 20, maxWidth: 900, width: "100%", marginBottom: 28 }}>
        {[{ photo: photoA, label: "A" }, { photo: photoB, label: "B" }].map(({ photo, label }) => (
          <div key={label} style={{ flex: 1, position: "relative", borderRadius: 6, overflow: "hidden", border: result?.pick === label ? `2px solid ${pickColor}` : "2px solid rgba(255,255,255,0.06)" }}>
            <img src={photo.preview} alt="" style={{ width: "100%", display: "block", aspectRatio: "3/2", objectFit: "cover" }} />
            <div style={{ position: "absolute", bottom: 8, left: 8, fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.6)", background: "rgba(0,0,0,0.7)", padding: "3px 8px", borderRadius: 3 }}>Frame {label} — {photo.name}</div>
            {photo.exif && <div style={{ position: "absolute", bottom: 8, right: 8, fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.7)", padding: "3px 8px", borderRadius: 3 }}>{formatExifLine(photo.exif)}</div>}
            {result?.pick === label && <div style={{ position: "absolute", top: 10, right: 10, fontSize: 9, fontFamily: "monospace", fontWeight: 700, color: pickColor, background: "rgba(0,0,0,0.8)", padding: "4px 10px", borderRadius: 3, letterSpacing: "0.1em" }}>★ PICK</div>}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 640, width: "100%", textAlign: "center", minHeight: 80 }}>
        {loading && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}><div style={{ width: 20, height: 20, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><span style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>Comparing…</span></div>}
        {error === "restored" && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Re-upload originals to use Compare mode.</p>}
        {error === "failed" && <p style={{ color: "#c75050", fontSize: 13, fontFamily: "monospace" }}>Comparison failed.</p>}
        {result && !error && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: "0 0 16px" }}>{result.reasoning}</p>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              {["a", "b"].map(k => <div key={k} style={{ padding: "6px 14px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.04)", maxWidth: 400, textAlign: "left" }}>{k.toUpperCase()}: {result[`frame_${k}`]?.strengths}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CuratorialNotes({ notes }) {
  if (!notes) return null;
  return (
    <div style={{ padding: "16px 32px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)", animation: "fadeIn 0.5s ease" }}>
      <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", letterSpacing: "0.12em", textTransform: "uppercase", marginRight: 12 }}>CURATORIAL NOTES</span>
      <span style={{ fontSize: 14, fontStyle: "italic", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>{notes}</span>
    </div>
  );
}

function ExportModal({ photos, cullResults, deepResults, curatorialNotes, recommendedSequence, onClose }) {
  const [exporting, setExporting] = useState(false);
  const [renameFiles, setRenameFiles] = useState(false);
  const analyzed = Object.keys(cullResults).length;

  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const renamePreview = useMemo(() => {
    const ex = [];
    for (let i = 0; i < photos.length && ex.length < 3; i++) {
      const da = deepResults[i]; const ca = cullResults[i];
      const title = da?.title || ca?.reason;
      if (title) { const ext = photos[i].name.split(".").pop(); const safe = sanitizeFilename(title); const orig = photos[i].name.replace(/\.[^.]+$/,""); ex.push({ from: photos[i].name, to: `${safe}__${orig}.${ext}` }); }
    }
    return ex;
  }, [photos, cullResults, deepResults]);

  const doExportXMP = () => {
    setExporting(true);
    try {
      const files = [];
      photos.forEach((p, i) => { const c = cullResults[i]; if (!c) return; const base = p.name.replace(/\.[^.]+$/,""); files.push({ content: generateXMP(p.name, c, deepResults[i]), filename: `${base}.xmp`, type: "application/xml" }); });
      files.push({ content: generateManifest(photos, cullResults, deepResults, curatorialNotes, recommendedSequence), filename: "contact-sheet-analysis.txt" });
      files.forEach(f => downloadFile(f.content, f.filename, f.type || "text/plain"));
    } finally { setExporting(false); }
  };

  const doExportScript = (platform) => {
    setExporting(true);
    try {
      const { content, filename } = generateOrgScript(photos, cullResults, deepResults, recommendedSequence, platform, renameFiles);
      downloadFile(content, filename);
      downloadFile(generateManifest(photos, cullResults, deepResults, curatorialNotes, recommendedSequence), "contact-sheet-analysis.txt");
    } finally { setExporting(false); }
  };

  const doExportManifest = () => {
    downloadFile(generateManifest(photos, cullResults, deepResults, curatorialNotes, recommendedSequence), "contact-sheet-analysis.txt");
  };

  const sec = { padding: "20px", marginBottom: 12, borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" };
  const btn = { padding: "8px 16px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", fontWeight: 600, cursor: "pointer", letterSpacing: "0.03em" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.94)", backdropFilter: "blur(16px)", overflowY: "auto", padding: "24px 32px" }} role="dialog">
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: "rgba(255,255,255,0.8)", fontStyle: "italic" }}>Export & Organize</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "monospace", cursor: "pointer" }}>✕ CLOSE · ESC</button>
        </div>
        <p style={{ margin: "0 0 24px", fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>Originals are never modified. Exports generate metadata and scripts that work alongside your files.</p>

        <div style={sec}>
          <h3 style={{ margin: "0 0 6px", fontSize: 14, color: "rgba(255,255,255,0.8)" }}>Lightroom XMP Sidecars</h3>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>Star ratings, color labels, titles, and critique as description. Drop next to originals — Lightroom imports automatically.</p>
          <button onClick={doExportXMP} disabled={exporting} style={{ ...btn, border: "1px solid rgba(240,192,64,0.4)", background: "rgba(240,192,64,0.1)", color: "#f0c040" }}>DOWNLOAD XMP FILES ({analyzed} sidecars)</button>
        </div>

        <div style={sec}>
          <h3 style={{ margin: "0 0 6px", fontSize: 14, color: "rgba(255,255,255,0.8)" }}>File Organization Script</h3>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>Rating-tier folders + narrative sequence. Copies only — never moves or deletes.</p>

          <div onClick={() => setRenameFiles(!renameFiles)} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14, cursor: "pointer", padding: "10px 12px", borderRadius: 4, background: renameFiles ? "rgba(110,200,122,0.04)" : "rgba(255,255,255,0.01)", border: renameFiles ? "1px solid rgba(110,200,122,0.15)" : "1px solid rgba(255,255,255,0.04)", transition: "all 0.15s" }}>
            <div style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, marginTop: 1, border: renameFiles ? "1.5px solid #6ec87a" : "1.5px solid rgba(255,255,255,0.15)", background: renameFiles ? "rgba(110,200,122,0.2)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#6ec87a" }}>{renameFiles ? "✓" : ""}</div>
            <div>
              <div style={{ fontSize: 12, color: renameFiles ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.45)", marginBottom: 3 }}>Rename files with descriptive titles</div>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", lineHeight: 1.5 }}>Original filename preserved as suffix for traceability.</div>
            </div>
          </div>

          {renameFiles && renamePreview.length > 0 && (
            <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 4, background: "rgba(0,0,0,0.3)", fontSize: 10, fontFamily: "monospace", lineHeight: 1.8, color: "rgba(255,255,255,0.3)" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.15)", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Preview</div>
              {renamePreview.map((ex, i) => <div key={i}><span style={{ color: "rgba(255,255,255,0.2)" }}>{ex.from}</span><span style={{ color: "rgba(255,255,255,0.1)", margin: "0 6px" }}>→</span><span style={{ color: "rgba(110,200,122,0.6)" }}>{ex.to}</span></div>)}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => doExportScript("unix")} disabled={exporting} style={{ ...btn, border: "1px solid rgba(110,200,122,0.3)", background: "rgba(110,200,122,0.08)", color: "#6ec87a" }}>DOWNLOAD .SH</button>
            <button onClick={() => doExportScript("windows")} disabled={exporting} style={{ ...btn, border: "1px solid rgba(110,200,122,0.3)", background: "rgba(110,200,122,0.08)", color: "#6ec87a" }}>DOWNLOAD .BAT</button>
          </div>
        </div>

        <div style={sec}>
          <h3 style={{ margin: "0 0 6px", fontSize: 14, color: "rgba(255,255,255,0.8)" }}>Analysis Manifest</h3>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>Plain-text report with all scores, EXIF data, and feedback.</p>
          <button onClick={doExportManifest} disabled={exporting} style={{ ...btn, border: "1px solid rgba(160,160,160,0.2)", background: "rgba(160,160,160,0.06)", color: "#a0a0a0" }}>DOWNLOAD MANIFEST</button>
        </div>
      </div>
    </div>
  );
}

function SessionHistory({ sessions, onRestore, onDelete, onClose, onNew, isLoading }) {
  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.94)", backdropFilter: "blur(16px)", overflowY: "auto", padding: "24px 32px" }} role="dialog">
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 400, color: "rgba(255,255,255,0.8)", fontStyle: "italic" }}>Previous Sessions</h2>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onNew} style={{ padding: "6px 14px", borderRadius: 4, border: "1px solid rgba(240,192,64,0.3)", background: "rgba(240,192,64,0.08)", color: "#f0c040", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>+ NEW</button>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "monospace", cursor: "pointer" }}>✕ CLOSE</button>
          </div>
        </div>
        {isLoading && <p style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>Loading…</p>}
        {!isLoading && sessions.length === 0 && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>No saved sessions yet.</p>}
        {sessions.map(s => (
          <div key={s.id} onClick={() => onRestore(s.id)} tabIndex={0} role="button" style={{ padding: "16px 20px", marginBottom: 10, borderRadius: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}>
            <div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>{new Date(s.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{new Date(s.date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span></div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, fontFamily: "monospace" }}>
                <span style={{ color: "rgba(255,255,255,0.3)" }}>{s.photoCount} frames</span>
                {s.heroCount > 0 && <span style={{ color: RATING_CONFIG.HERO.color }}>{s.heroCount} heroes</span>}
                {s.selectCount > 0 && <span style={{ color: RATING_CONFIG.SELECT.color }}>{s.selectCount} selects</span>}
                {s.hasDeepReview && <span style={{ color: "rgba(255,255,255,0.2)" }}>reviewed</span>}
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); onDelete(s.id); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.15)", fontSize: 11, fontFamily: "monospace", cursor: "pointer", padding: "4px 8px" }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Main Component ───────────────────────────────────────────────────────────

export default function ContactSheet() {
  // Photos
  const [photos, setPhotos] = useState([]);
  const [processingCount, setProcessingCount] = useState(0);

  // Cull pass results
  const [cullResults, setCullResults] = useState({});

  // Deep review results
  const [deepResults, setDeepResults] = useState({});
  const [deepSelected, setDeepSelected] = useState(new Set());
  const [curatorialNotes, setCuratorialNotes] = useState(null);
  const [recommendedSequence, setRecommendedSequence] = useState(null);

  // Phase: "empty" | "uploading" | "culling" | "culled" | "reviewing" | "reviewed"
  const [phase, setPhase] = useState("empty");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState(null);

  // UI state
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [compareIdxs, setCompareIdxs] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [sortBy, setSortBy] = useState("original");
  const [filterRating, setFilterRating] = useState("ALL");
  const [experienceLevel, setExperienceLevel] = useState("enthusiast");
  const [dragOver, setDragOver] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Session
  const [sessionId, setSessionId] = useState(null);
  const [sessionIndex, setSessionIndex] = useState([]);
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const gridRef = useRef(null);

  useEffect(() => { loadSessionIndex().then(setSessionIndex); }, []);

  // Keyboard: Escape closes panels
  useEffect(() => {
    const h = e => { if (e.key === "Escape" && selectedIdx !== null) { setSelectedIdx(null); e.preventDefault(); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedIdx]);

  // ── File handling ─────────────────────────────────────────────────────

  const readEntryFiles = useCallback((entry) => {
    return new Promise(resolve => {
      if (entry.isFile) { entry.file(f => { if (f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name)) resolve([f]); else resolve([]); }, () => resolve([])); }
      else if (entry.isDirectory) {
        const reader = entry.createReader(); const all = [];
        const readBatch = () => { reader.readEntries(async entries => { if (!entries.length) resolve(all); else { for (const e of entries) { all.push(...await readEntryFiles(e)); } readBatch(); } }, () => resolve(all)); };
        readBatch();
      } else resolve([]);
    });
  }, []);

  const processFiles = useCallback(async (files) => {
    const images = files.filter(f => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
    if (!images.length) return;
    setProcessingCount(images.length);
    const processed = await Promise.all(images.map(f => resizeImage(f).catch(() => null)));
    const valid = processed.filter(Boolean);
    setPhotos(prev => [...prev, ...valid]);
    setProcessingCount(0);
    if (phase === "empty") setPhase("uploading");
  }, [phase]);

  const handleFiles = useCallback(async (fileList) => { processFiles(Array.from(fileList)); }, [processFiles]);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault(); setDragOver(false);
    const items = e.dataTransfer.items;
    if (items?.length) {
      const all = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.() || item.getAsEntry?.();
        if (entry) { all.push(...await readEntryFiles(entry)); }
        else if (item.kind === "file") { const f = item.getAsFile(); if (f) all.push(f); }
      }
      processFiles(all);
    } else if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [readEntryFiles, processFiles, handleFiles]);

  // ── Cull pass ──────────────────────────────────────────────────────────

  const runCull = useCallback(async () => {
    if (!photos.length) return;
    setPhase("culling");
    setCullResults({});
    setDeepResults({});
    setDeepSelected(new Set());
    setCuratorialNotes(null);
    setRecommendedSequence(null);
    setError(null);

    try {
      const results = await runCullBatch(photos, (msg) => setProgress(msg));
      setCullResults(results);

      // Auto-select HERO and SELECT for deep review
      const autoSelect = new Set();
      Object.entries(results).forEach(([idx, data]) => {
        if (data.rating === "HERO" || data.rating === "SELECT") autoSelect.add(Number(idx));
      });
      setDeepSelected(autoSelect);

      setPhase("culled");

      // Auto-save
      const sid = sessionId || crypto.randomUUID();
      setSessionId(sid);
      const thumbs = await Promise.all(photos.map(p => makeThumb(p.preview)));
      await saveSession(sid, {
        date: new Date().toISOString(), photoCount: photos.length,
        heroCount: Object.values(results).filter(a => a.rating === "HERO").length,
        selectCount: Object.values(results).filter(a => a.rating === "SELECT").length,
        level: experienceLevel, cullResults: results, deepResults: {},
        curatorialNotes: null, recommendedSequence: null, hasDeepReview: false,
        photos: photos.map((p, i) => ({ name: p.name, width: p.width, height: p.height, thumb: thumbs[i], exif: p.exif || null })),
      });
      setSessionIndex(await loadSessionIndex());
    } catch (e) {
      console.error("Cull failed:", e);
      setError(e.message);
      setPhase(Object.keys(cullResults).length > 0 ? "culled" : "uploading");
    }
  }, [photos, sessionId, experienceLevel]);

  // ── Deep review ────────────────────────────────────────────────────────

  const runDeep = useCallback(async () => {
    const indices = [...deepSelected].sort((a, b) => a - b);
    if (!indices.length) return;

    // Check originals available
    if (!indices.some(i => photos[i]?.base64)) {
      setError("Re-upload originals to run deep review.");
      return;
    }

    setPhase("reviewing");
    setError(null);

    try {
      const { analyses, curatorialNotes: notes, recommendedSequence: seq } = await runDeepReview(photos, indices, experienceLevel, (msg) => setProgress(msg));
      setDeepResults(prev => ({ ...prev, ...analyses }));
      if (notes) setCuratorialNotes(notes);
      if (seq) setRecommendedSequence(seq);
      setPhase("reviewed");

      // Update session
      const sid = sessionId || crypto.randomUUID();
      setSessionId(sid);
      const allDeep = { ...deepResults, ...analyses };
      const thumbs = await Promise.all(photos.map(p => makeThumb(p.preview)));
      await saveSession(sid, {
        date: new Date().toISOString(), photoCount: photos.length,
        heroCount: Object.values(cullResults).filter(a => a.rating === "HERO").length,
        selectCount: Object.values(cullResults).filter(a => a.rating === "SELECT").length,
        level: experienceLevel, cullResults, deepResults: allDeep,
        curatorialNotes: notes, recommendedSequence: seq, hasDeepReview: true,
        photos: photos.map((p, i) => ({ name: p.name, width: p.width, height: p.height, thumb: thumbs[i], exif: p.exif || null })),
      });
      setSessionIndex(await loadSessionIndex());
    } catch (e) {
      console.error("Deep review failed:", e);
      setError(e.message);
      setPhase("culled");
    }
  }, [deepSelected, photos, experienceLevel, sessionId, cullResults, deepResults]);

  // ── Session management ─────────────────────────────────────────────────

  const restoreSession = useCallback(async (id) => {
    setIsLoadingSession(true);
    try {
      const data = await loadSession(id);
      if (!data) throw new Error("Session not found");
      const restoredPhotos = data.photos.map(p => ({
        id: crypto.randomUUID(), base64: null, preview: p.thumb,
        name: p.name, width: p.width, height: p.height,
        mediaType: "image/jpeg", isRestored: true, exif: p.exif || null,
      }));
      setPhotos(restoredPhotos);
      setCullResults(data.cullResults || {});
      setDeepResults(data.deepResults || {});
      setCuratorialNotes(data.curatorialNotes || null);
      setRecommendedSequence(data.recommendedSequence || null);
      setSessionId(id);
      setExperienceLevel(data.level || "enthusiast");
      setPhase(data.hasDeepReview ? "reviewed" : Object.keys(data.cullResults || {}).length > 0 ? "culled" : "uploading");
      setDeepSelected(new Set(Object.keys(data.deepResults || {}).map(Number)));
      setShowHistory(false);
      setSelectedIdx(null);
      setCompareIdxs([]);
    } catch (e) { setError("Failed to load: " + e.message); }
    finally { setIsLoadingSession(false); }
  }, []);

  const newSession = useCallback(() => {
    setPhotos([]); setCullResults({}); setDeepResults({}); setDeepSelected(new Set());
    setCuratorialNotes(null); setRecommendedSequence(null); setSessionId(null);
    setSelectedIdx(null); setCompareIdxs([]); setShowCompare(false); setShowHistory(false);
    setError(null); setPhase("empty"); setFilterRating("ALL"); setSortBy("original"); setViewMode("grid");
  }, []);

  const toggleCompare = useCallback(idx => {
    setCompareIdxs(prev => {
      if (prev.includes(idx)) return prev.filter(i => i !== idx);
      if (prev.length >= 2) return [prev[1], idx];
      return [...prev, idx];
    });
  }, []);

  const toggleDeepSelect = useCallback(idx => {
    setDeepSelected(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  }, []);

  // ── Display list ───────────────────────────────────────────────────────

  const displayPhotos = useMemo(() => {
    let list = photos.map((p, i) => ({ photo: p, idx: i, cull: cullResults[i] || null, deep: deepResults[i] || null }));
    if (filterRating !== "ALL") {
      list = list.filter(item => {
        const r = (item.deep || item.cull)?.rating;
        return r === filterRating;
      });
    }
    if (viewMode === "sequence" && recommendedSequence) {
      const seqSet = new Set(recommendedSequence);
      const sequenced = recommendedSequence.map(i => list.find(item => item.idx === i)).filter(Boolean);
      const rest = list.filter(item => !seqSet.has(item.idx));
      list = [...sequenced, ...rest];
    } else {
      const getScore = (item) => (item.deep || item.cull)?.score || 0;
      if (sortBy === "score") list.sort((a, b) => getScore(b) - getScore(a));
      else if (sortBy === "impact") list.sort((a, b) => (b.deep?.scores?.impact || 0) - (a.deep?.scores?.impact || 0));
      else if (sortBy === "composition") list.sort((a, b) => (b.deep?.scores?.composition || 0) - (a.deep?.scores?.composition || 0));
      else if (sortBy === "technical") list.sort((a, b) => (b.deep?.scores?.technical || 0) - (a.deep?.scores?.technical || 0));
      else if (sortBy === "style") list.sort((a, b) => (b.deep?.scores?.style_story || 0) - (a.deep?.scores?.style_story || 0));
    }
    return list;
  }, [photos, cullResults, deepResults, filterRating, viewMode, recommendedSequence, sortBy]);

  const cullCount = Object.keys(cullResults).length;
  const deepCount = Object.keys(deepResults).length;
  const heroCount = Object.values(cullResults).filter(a => a.rating === "HERO").length;
  const selectCount = Object.values(cullResults).filter(a => a.rating === "SELECT").length;
  const isWorking = phase === "culling" || phase === "reviewing";
  const hasResults = cullCount > 0;
  const showDetailSide = selectedIdx !== null && photos[selectedIdx];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
        @keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
        [tabindex="0"]:focus-visible { outline: 2px solid rgba(240,192,64,0.6); outline-offset: 2px; }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header style={{
        padding: "20px 32px", borderBottom: "1px solid rgba(255,255,255,0.04)",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16,
        position: "sticky", top: 0, zIndex: 50, background: "rgba(10,10,10,0.9)", backdropFilter: "blur(12px)",
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 400, letterSpacing: "-0.01em", color: "rgba(255,255,255,0.9)" }}>Contact Sheet</h1>
          <p style={{ margin: "2px 0 0", fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em", textTransform: "uppercase" }}>AI Photo Editor · PPA Framework</p>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 11, fontFamily: "monospace" }}>
          {hasResults && (
            <>
              <span style={{ color: "rgba(255,255,255,0.3)" }}>{photos.length} frames</span>
              {heroCount > 0 && <span style={{ color: RATING_CONFIG.HERO.color }}>{heroCount} heroes</span>}
              {selectCount > 0 && <span style={{ color: RATING_CONFIG.SELECT.color }}>{selectCount} selects</span>}
              {deepCount > 0 && <span style={{ color: "rgba(255,255,255,0.2)" }}>{deepCount} reviewed</span>}
            </>
          )}
          {sessionIndex.length > 0 && (
            <button onClick={() => setShowHistory(true)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 3, color: "rgba(255,255,255,0.3)", fontSize: 10, fontFamily: "monospace", cursor: "pointer", padding: "3px 8px" }}>History ({sessionIndex.length})</button>
          )}
        </div>
      </header>

      {/* ── Empty State ─────────────────────────────────────────────── */}
      {photos.length === 0 && (
        <div style={{ padding: "60px 32px", maxWidth: 640, margin: "0 auto" }}>
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} style={{
            padding: "72px 48px", borderRadius: 8,
            border: dragOver ? "1.5px solid rgba(255,255,255,0.2)" : "1.5px dashed rgba(255,255,255,0.08)",
            background: dragOver ? "rgba(255,255,255,0.02)" : "transparent", textAlign: "center", transition: "all 0.2s",
          }}>
            <div style={{ fontSize: 36, marginBottom: 20, opacity: 0.2 }}>◻</div>
            <h2 style={{ margin: "0 0 10px", fontWeight: 400, fontSize: 22, color: "rgba(255,255,255,0.6)", fontStyle: "italic" }}>Drop your frames here</h2>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.2)" }}>drag a folder or individual files · JPG, PNG, WEBP</p>
            <p style={{ margin: "0 0 20px", fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.15)" }}>hundreds of photos welcome — we'll cull them fast</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => folderInputRef.current?.click()} style={{ padding: "8px 18px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>Open Folder</button>
              <button onClick={() => fileInputRef.current?.click()} style={{ padding: "8px 18px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>Pick Files</button>
            </div>

            {processingCount > 0 && (
              <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "rgba(255,255,255,0.5)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>Processing {processingCount} images…</span>
              </div>
            )}

            <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <p style={{ margin: "0 0 10px", fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Feedback style</p>
              <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                {[{ key: "learning", label: "I'm learning", desc: "Explains techniques" }, { key: "enthusiast", label: "Enthusiast", desc: "Conversational" }, { key: "pro", label: "Pro", desc: "Technical shorthand" }].map(({ key, label, desc }) => (
                  <button key={key} onClick={() => setExperienceLevel(key)} style={{
                    padding: "8px 14px", borderRadius: 4,
                    border: experienceLevel === key ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.06)",
                    background: experienceLevel === key ? "rgba(255,255,255,0.06)" : "transparent",
                    color: experienceLevel === key ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)",
                    fontSize: 10, fontFamily: "monospace", cursor: "pointer", textAlign: "center",
                  }}>
                    <div>{label}</div>
                    <div style={{ fontSize: 8, marginTop: 3, color: experienceLevel === key ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)" }}>{desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {sessionIndex.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <p style={{ margin: "0 0 16px", fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Previous sessions</p>
              {sessionIndex.slice(0, 5).map(s => (
                <div key={s.id} onClick={() => restoreSession(s.id)} tabIndex={0} role="button" style={{ padding: "12px 16px", marginBottom: 6, borderRadius: 6, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.015)"}>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 11, fontFamily: "monospace" }}>
                    <span style={{ color: "rgba(255,255,255,0.45)" }}>{new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    <span style={{ color: "rgba(255,255,255,0.25)" }}>{s.photoCount} frames</span>
                    {s.heroCount > 0 && <span style={{ color: RATING_CONFIG.HERO.color, opacity: 0.7 }}>{s.heroCount} heroes</span>}
                  </div>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.15)" }}>Restore →</span>
                </div>
              ))}
              {sessionIndex.length > 5 && <button onClick={() => setShowHistory(true)} style={{ marginTop: 8, padding: "8px 16px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.06)", background: "transparent", color: "rgba(255,255,255,0.25)", fontSize: 10, fontFamily: "monospace", cursor: "pointer", width: "100%" }}>View all {sessionIndex.length} sessions</button>}
            </div>
          )}
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      {photos.length > 0 && (
        <div style={{ padding: "12px 32px", display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.04)", flexWrap: "wrap" }}>
          <button onClick={() => folderInputRef.current?.click()} style={{ padding: "6px 14px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>+ FOLDER</button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "6px 14px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>+ FILES</button>

          {/* Cull button */}
          {(phase === "uploading" || (photos.length > 0 && !hasResults)) && (
            <button onClick={runCull} disabled={isWorking} style={{
              padding: "6px 16px", borderRadius: 4, border: "1px solid rgba(240,192,64,0.4)",
              background: isWorking ? "rgba(240,192,64,0.05)" : "rgba(240,192,64,0.12)",
              color: isWorking ? "rgba(240,192,64,0.3)" : "#f0c040",
              fontSize: 11, fontFamily: "monospace", fontWeight: 600, cursor: isWorking ? "default" : "pointer",
            }}>{isWorking ? "CULLING…" : `CULL ${photos.length} PHOTOS`}</button>
          )}

          {/* Re-cull button */}
          {hasResults && !isWorking && (
            <button onClick={runCull} style={{
              padding: "6px 16px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)",
              background: "transparent", color: "rgba(255,255,255,0.4)",
              fontSize: 11, fontFamily: "monospace", cursor: "pointer",
            }}>RE-CULL</button>
          )}

          {/* Deep review button */}
          {phase === "culled" && deepSelected.size > 0 && (
            <button onClick={runDeep} disabled={isWorking} style={{
              padding: "6px 16px", borderRadius: 4, border: "1px solid rgba(240,192,64,0.4)",
              background: "rgba(240,192,64,0.12)", color: "#f0c040",
              fontSize: 11, fontFamily: "monospace", fontWeight: 600, cursor: "pointer",
            }}>DEEP REVIEW ({deepSelected.size} PHOTOS)</button>
          )}

          {hasResults && (
            <button onClick={() => setShowExport(true)} style={{
              padding: "6px 16px", borderRadius: 4, border: "1px solid rgba(110,200,122,0.3)",
              background: "rgba(110,200,122,0.08)", color: "#6ec87a",
              fontSize: 11, fontFamily: "monospace", fontWeight: 600, cursor: "pointer",
            }}>EXPORT</button>
          )}

          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)", margin: "0 4px" }} />

          {/* Experience */}
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>VOICE</span>
          {["learning", "enthusiast", "pro"].map(k => (
            <button key={k} onClick={() => setExperienceLevel(k)} style={{
              padding: "4px 10px", borderRadius: 3, border: "none",
              background: experienceLevel === k ? "rgba(255,255,255,0.1)" : "transparent",
              color: experienceLevel === k ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
              fontSize: 10, fontFamily: "monospace", cursor: "pointer", textTransform: "capitalize",
            }}>{k}</button>
          ))}

          {/* View */}
          {hasResults && (
            <>
              <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)", margin: "0 4px" }} />
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>VIEW</span>
              {["grid", "sequence"].map(v => (
                <button key={v} onClick={() => setViewMode(v)} disabled={v === "sequence" && !recommendedSequence} style={{
                  padding: "4px 10px", borderRadius: 3, border: "none",
                  background: viewMode === v ? "rgba(255,255,255,0.1)" : "transparent",
                  color: viewMode === v ? "rgba(255,255,255,0.8)" : !recommendedSequence && v === "sequence" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.3)",
                  fontSize: 10, fontFamily: "monospace", cursor: !recommendedSequence && v === "sequence" ? "default" : "pointer", textTransform: "capitalize",
                }}>{v}</button>
              ))}
            </>
          )}

          {/* Sort */}
          {hasResults && viewMode === "grid" && (
            <>
              <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)", margin: "0 4px" }} />
              <span style={{ fontSize: 9, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>SORT</span>
              {["original", "score", ...(deepCount > 0 ? ["impact", "composition", "technical", "style"] : [])].map(s => (
                <button key={s} onClick={() => setSortBy(s)} style={{
                  padding: "4px 10px", borderRadius: 3, border: "none",
                  background: sortBy === s ? "rgba(255,255,255,0.1)" : "transparent",
                  color: sortBy === s ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
                  fontSize: 10, fontFamily: "monospace", cursor: "pointer", textTransform: "capitalize",
                }}>{s}</button>
              ))}
            </>
          )}

          {/* Filter */}
          {hasResults && (
            <>
              <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)", margin: "0 4px" }} />
              {["ALL", "HERO", "SELECT", "MAYBE", "CUT"].map(f => (
                <button key={f} onClick={() => setFilterRating(f)} style={{
                  padding: "4px 10px", borderRadius: 3, border: "none",
                  background: filterRating === f ? "rgba(255,255,255,0.1)" : "transparent",
                  color: filterRating === f ? (RATING_CONFIG[f]?.color || "rgba(255,255,255,0.8)") : "rgba(255,255,255,0.3)",
                  fontSize: 10, fontFamily: "monospace", cursor: "pointer",
                }}>{f}</button>
              ))}
            </>
          )}

          {/* Compare */}
          {compareIdxs.length === 2 && (
            <><div style={{ flex: 1 }} /><button onClick={() => setShowCompare(true)} style={{ padding: "6px 16px", borderRadius: 4, border: `1px solid ${RATING_CONFIG.HERO.border}`, background: RATING_CONFIG.HERO.bg, color: RATING_CONFIG.HERO.color, fontSize: 11, fontFamily: "monospace", fontWeight: 600, cursor: "pointer" }}>COMPARE 2 FRAMES</button></>
          )}
        </div>
      )}

      {/* ── Working indicator ───────────────────────────────────────── */}
      {isWorking && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "40px 32px", animation: "fadeIn 0.3s ease" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", animation: "pulse 1.5s ease-in-out infinite" }} />
          <span style={{ fontSize: 13, fontFamily: "monospace", color: "rgba(255,255,255,0.4)" }}>{progress}</span>
        </div>
      )}

      {/* ── Processing indicator ────────────────────────────────────── */}
      {processingCount > 0 && photos.length > 0 && (
        <div style={{ padding: "8px 32px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "rgba(255,255,255,0.4)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>Processing {processingCount} images…</span>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────── */}
      {error && (
        <div style={{ margin: "16px 32px", padding: "14px 20px", borderRadius: 6, background: "rgba(199,80,80,0.08)", border: "1px solid rgba(199,80,80,0.2)", animation: "fadeIn 0.3s ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 12, fontFamily: "monospace", color: "#c75050", fontWeight: 600 }}>Error</p>
              <p style={{ margin: 0, fontSize: 11, fontFamily: "monospace", color: "rgba(199,80,80,0.7)", lineHeight: 1.5, wordBreak: "break-word" }}>{error}</p>
            </div>
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "rgba(199,80,80,0.5)", fontSize: 14, cursor: "pointer", padding: "0 4px" }}>✕</button>
          </div>
        </div>
      )}

      {/* ── Cull complete banner ─────────────────────────────────────── */}
      {phase === "culled" && (
        <div style={{ margin: "0 32px", padding: "14px 20px", borderRadius: 6, background: "rgba(240,192,64,0.04)", border: "1px solid rgba(240,192,64,0.12)", animation: "fadeIn 0.3s ease", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(240,192,64,0.8)" }}>Cull complete — {heroCount + selectCount} frames selected for deep review</p>
            <p style={{ margin: "3px 0 0", fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.25)" }}>Toggle any photo's "REVIEW" badge to add or remove it, then hit Deep Review.</p>
          </div>
          {deepSelected.size > 0 && (
            <button onClick={runDeep} style={{ padding: "8px 18px", borderRadius: 4, border: "1px solid rgba(240,192,64,0.4)", background: "rgba(240,192,64,0.12)", color: "#f0c040", fontSize: 11, fontFamily: "monospace", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
              DEEP REVIEW {deepSelected.size} PHOTOS →
            </button>
          )}
        </div>
      )}

      {/* ── Content: Grid + Detail ──────────────────────────────────── */}
      {photos.length > 0 && (
        <div style={{ display: "flex", minHeight: "calc(100vh - 140px)" }}>
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
            <div ref={gridRef} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} style={{
              padding: "24px 32px", display: "grid",
              gridTemplateColumns: viewMode === "sequence" ? "repeat(auto-fill, minmax(200px, 1fr))" : "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 14,
            }} role="grid">
              {displayPhotos.map(item => {
                const seqNum = viewMode === "sequence" && recommendedSequence ? recommendedSequence.indexOf(item.idx) + 1 || null : null;
                return (
                  <Thumbnail key={item.photo.id} photo={item.photo} index={item.idx} cullData={item.cull} deepData={item.deep}
                    isSelected={selectedIdx === item.idx} isCompareSelected={compareIdxs.includes(item.idx)}
                    compareLabel={compareIdxs.indexOf(item.idx) === 0 ? "A" : "B"}
                    isDeepSelected={deepSelected.has(item.idx)}
                    onClick={setSelectedIdx} onCompareClick={toggleCompare}
                    onDeepToggle={phase === "culled" ? toggleDeepSelect : null}
                    sequenceNumber={seqNum} phase={phase}
                  />
                );
              })}
            </div>
            {curatorialNotes && <CuratorialNotes notes={curatorialNotes} />}
          </div>

          {showDetailSide && (
            <div style={{ width: 420, flexShrink: 0, borderLeft: "1px solid rgba(255,255,255,0.06)", overflowY: "auto", position: "sticky", top: 72, height: "calc(100vh - 72px)", animation: "slideIn 0.25s ease" }}>
              <DetailPanel photo={photos[selectedIdx]} cullData={cullResults[selectedIdx]} deepData={deepResults[selectedIdx]} onClose={() => setSelectedIdx(null)} />
            </div>
          )}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────── */}
      {showCompare && compareIdxs.length === 2 && <CompareModal photoA={photos[compareIdxs[0]]} photoB={photos[compareIdxs[1]]} onClose={() => setShowCompare(false)} />}
      {showExport && <ExportModal photos={photos} cullResults={cullResults} deepResults={deepResults} curatorialNotes={curatorialNotes} recommendedSequence={recommendedSequence} onClose={() => setShowExport(false)} />}
      {showHistory && <SessionHistory sessions={sessionIndex} onRestore={restoreSession} onDelete={async id => { await deleteSession(id); setSessionIndex(await loadSessionIndex()); if (sessionId === id) setSessionId(null); }} onClose={() => setShowHistory(false)} onNew={newSession} isLoading={isLoadingSession} />}

      <input ref={fileInputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={folderInputRef} type="file" multiple accept="image/*" webkitdirectory="" style={{ display: "none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
    </div>
  );
}
