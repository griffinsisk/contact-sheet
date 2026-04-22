import { Photo, CullResult, DeepResult, ExifData } from "./types";
import { STAR_MAP, LABEL_MAP } from "./constants";
import { formatExifLine, formatExifCamera } from "./exif";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function sanitizeFilename(title: string): string {
  return title.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").substring(0, 60).toLowerCase();
}

export function generateXMP(filename: string, cull: CullResult, deep?: DeepResult): string {
  const a = deep || cull;
  const stars = STAR_MAP[a.rating] || 0;
  const label = LABEL_MAP[a.rating] || "";
  const title = deep?.title || "";
  const desc = deep
    ? `${deep.technical || ""}\n\n${deep.style_story || ""}\n\n${deep.verdict || ""}`.trim()
    : cull.reason || "";

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
        <rdf:li>Score:${a.score}</rdf:li>
      </rdf:Bag></dc:subject>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;
}

export function generateOrgScript(
  photos: Photo[],
  cullResults: Record<number, CullResult>,
  deepResults: Record<number, DeepResult>,
  recommendedSequence: number[] | null,
  platform: "unix" | "windows" = "unix",
  renameFiles = false,
): { content: string; filename: string } {
  const rf: Record<string, string> = { HERO: "01_heroes", SELECT: "02_selects", MAYBE: "03_maybes", CUT: "04_cuts" };
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
  if (renameFiles) s += `${cmt} RENAME MODE: Files renamed with AI titles.\n`;
  s += "\n";

  const folders = new Set<string>();
  photos.forEach((_, i) => { const c = cullResults[i]; if (c) folders.add(rf[c.rating] || "04_cuts"); });
  s += `${cmt} === Rating Tier Folders ===\n`;
  folders.forEach(f => { s += `${mkdir} "organized${sep}by_rating${sep}${f}"\n`; });
  s += "\n";

  photos.forEach((p, i) => {
    const c = cullResults[i]; if (!c) return;
    const folder = rf[c.rating] || "04_cuts";
    const fileExt = p.name.split(".").pop() || "jpg";
    let destName = p.name;
    if (renameFiles) {
      const title = deepResults[i]?.title || c.reason;
      if (title) { const safe = sanitizeFilename(title); const orig = p.name.replace(/\.[^.]+$/, ""); destName = `${safe}__${orig}.${fileExt}`; }
    }
    s += `${cp} "${p.name}" "organized${sep}by_rating${sep}${folder}${sep}${destName}"\n`;
  });

  if (recommendedSequence?.length) {
    s += `\n${cmt} === Narrative Sequence ===\n`;
    s += `${mkdir} "organized${sep}sequence"\n`;
    recommendedSequence.forEach((idx, n) => {
      const p = photos[idx]; if (!p) return;
      const pad = String(n + 1).padStart(3, "0");
      const fileExt = p.name.split(".").pop() || "jpg";
      let destName = p.name;
      if (renameFiles && deepResults[idx]?.title) destName = `${sanitizeFilename(deepResults[idx].title)}.${fileExt}`;
      s += `${cp} "${p.name}" "organized${sep}sequence${sep}${pad}_${destName}"\n`;
    });
  }

  return { content: s, filename: `organize${ext}` };
}

export function generateManifest(
  photos: Photo[],
  cullResults: Record<number, CullResult>,
  deepResults: Record<number, DeepResult>,
  curatorialNotes: string | null,
  recommendedSequence: number[] | null,
): string {
  let t = "CONTACT SHEET — ANALYSIS MANIFEST\n";
  t += `Generated: ${new Date().toISOString()}\n`;
  t += "=".repeat(60) + "\n\n";

  if (curatorialNotes) {
    t += "CURATORIAL NOTES\n" + "-".repeat(40) + "\n" + curatorialNotes + "\n\n";
  }
  if (recommendedSequence?.length) {
    t += "RECOMMENDED SEQUENCE\n" + "-".repeat(40) + "\n";
    recommendedSequence.forEach((idx, i) => {
      const p = photos[idx]; const c = cullResults[idx];
      if (p && c) t += `${i + 1}. ${p.name} (${c.rating} — ${c.score})\n`;
    });
    t += "\n";
  }

  t += "PER-PHOTO ANALYSIS\n" + "=".repeat(60) + "\n\n";
  photos.forEach((p, i) => {
    const c = cullResults[i]; if (!c) return;
    const d = deepResults[i];
    t += `${p.name}\n` + "-".repeat(40) + "\n";
    t += `Rating: ${c.rating} | Overall: ${c.score}/100\n`;
    if (d?.scores) t += `Impact: ${d.scores.impact} | Composition: ${d.scores.composition} | Raw Quality: ${d.scores.rawQuality} | Craft: ${d.scores.craftExecution} | Story: ${d.scores.story}\n`;
    if (d?.title) t += `Title: ${d.title}\n`;
    t += "\n";
    if (d) {
      t += `Technical:\n${d.technical}\n\nStyle & Story:\n${d.style_story}\n\nVerdict: ${d.verdict}\n`;
    } else {
      t += `Cull note: ${c.reason}\n`;
    }
    if (p.exif) {
      const el = formatExifLine(p.exif); const ec = formatExifCamera(p.exif);
      if (el) t += `Settings: ${el}\n`;
      if (ec) t += `Camera: ${ec}\n`;
    }
    t += "\n" + "=".repeat(60) + "\n\n";
  });

  t += "Scoring: PPA 12 Elements · Feldman Method · Decisive Moment\n";
  t += "Weights: Impact 30% · Composition 30% · Technical 20% · Style & Story 20%\n";
  return t;
}

export function downloadFile(content: string, filename: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
