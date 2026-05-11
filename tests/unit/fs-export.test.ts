import test from "node:test";
import assert from "node:assert/strict";

import { createExportFolderName, exportToFolder, sidecarNameForFile } from "../../lib/fs-export";
import type { CullResult, Photo } from "../../lib/types";

class FakeWritable {
  constructor(private file: FakeFileHandle) {}

  async write(content: unknown) {
    this.file.content = content;
  }

  async close() {}
}

class FakeFileHandle {
  content: unknown = null;

  constructor(public name: string) {}

  async createWritable() {
    return new FakeWritable(this);
  }
}

class FakeDirectoryHandle {
  dirs = new Map<string, FakeDirectoryHandle>();
  files = new Map<string, FakeFileHandle>();

  constructor(public name: string) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const existing = this.dirs.get(name);
    if (existing) return existing;
    if (!options?.create) throw new Error(`Missing directory: ${name}`);
    const dir = new FakeDirectoryHandle(name);
    this.dirs.set(name, dir);
    return dir;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const existing = this.files.get(name);
    if (existing) return existing;
    if (!options?.create) throw new Error(`Missing file: ${name}`);
    const file = new FakeFileHandle(name);
    this.files.set(name, file);
    return file;
  }
}

const photo: Photo = {
  id: "p1",
  base64: null,
  preview: "",
  name: "DSC_0001.JPG",
  width: 100,
  height: 100,
  mediaType: "image/jpeg",
  exif: null,
  originalFile: new File(["original-bytes"], "DSC_0001.JPG", { type: "image/jpeg" }),
};

const cull: CullResult = {
  index: 0,
  score: 72,
  rating: "SELECT",
  reason: "Strong frame with clean geometry",
};

test("createExportFolderName uses a readable local timestamp", () => {
  assert.equal(
    createExportFolderName(new Date(2026, 4, 11, 16, 5, 7)),
    "contact-sheet-export-2026-05-11-160507",
  );
});

test("sidecarNameForFile matches the copied photo basename", () => {
  assert.equal(sidecarNameForFile("Warm_Light__DSC_0001.JPG"), "Warm_Light__DSC_0001.xmp");
  assert.equal(sidecarNameForFile("DSC_0002"), "DSC_0002.xmp");
});

test("exportToFolder creates a contained package with photo and sidecar together", async () => {
  const root = new FakeDirectoryHandle("picked");
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = {
    showDirectoryPicker: async () => root,
  };

  try {
    const written = await exportToFolder({
      photos: [photo],
      cullResults: { 0: cull },
      deepResults: {},
      recommendedSequence: null,
    });

    assert.equal(written, 2);
    assert.equal(root.files.has("DSC_0001.xmp"), false);

    const exportDir = root.dirs.values().next().value as FakeDirectoryHandle;
    assert.match(exportDir.name, /^contact-sheet-export-/);

    const selectDir = exportDir
      .dirs.get("by_rating")
      ?.dirs.get("02_selects");

    assert.ok(selectDir);
    assert.ok(selectDir.files.get("DSC_0001.JPG")?.content instanceof File);
    assert.match(String(selectDir.files.get("DSC_0001.xmp")?.content), /xmp:Rating="4"/);
  } finally {
    (globalThis as any).window = previousWindow;
  }
});
