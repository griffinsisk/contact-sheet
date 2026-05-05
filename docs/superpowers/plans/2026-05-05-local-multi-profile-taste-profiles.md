# Local Multi-Profile Taste Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 1 of multi-profile taste profiles as a local-only feature: named profiles, active-profile switching, per-profile favorites/profile regen, and profile-scoped corrections.

**Architecture:** Keep all Phase 1 state in localStorage under `cs-taste-libraries`, migrating the existing v1 `cs-taste-library` into a v2 collection on first read. Keep the public hook shape mostly compatible by returning the active library as `library`, while exposing collection operations for profile management and cull-time switching. Defer Clerk manifest, private Blob storage, private image resolution, and cross-device sync to Phase 2.

**Tech Stack:** Next.js App Router, React 19, TypeScript, browser localStorage, Node test runner, Playwright e2e.

---

## Scope Boundary

This plan implements only the local-first subset of [Persistent Multi-Profile Taste Profiles](../specs/2026-05-05-persistent-multi-profile-design.md).

Included:

- v2 `TasteLibraryCollection` in localStorage.
- v1 localStorage migration.
- Up to 3 local named profiles for Pro and BYOK users.
- Free tier remains a single unnamed local library.
- Create, rename, delete, and switch profiles.
- Header and cull-time active-profile display.
- Per-profile favorites and generated profile data.
- `profileIdAtCull` on correction entries.
- Profile regen consumes corrections for the active profile.

Deferred to Phase 2:

- Clerk `tasteProfileManifest`.
- Vercel Blob collection JSON.
- Private Blob image upload, resolve, and delete.
- Cross-device sync and `updatedAt` conflict handling beyond local field maintenance.
- Server API routes under `app/api/taste-library/`.

## File Map

- `lib/taste-library.ts`: Upgrade taste library types/storage from v1 single library to v2 collection; keep active-library compatibility helpers; add collection CRUD helpers.
- `hooks/useTasteLibrary.ts`: Return active library plus collection, active id, and profile CRUD methods.
- `lib/overrides.ts`: Add `profileIdAtCull`, helper for profile-scoped correction filtering, and migration helper for unscoped pre-feature corrections.
- `components/SeedUploadModal.tsx`: Add profile switcher, create/rename/delete controls, and scope all existing library/profile UI to the selected active profile.
- `components/ContactSheet.tsx`: Wire active profile id into corrections, add cull-time profile picker, pass active library data into cull/deep review, and derive whether multi-profile UI is allowed from tier.
- `components/Header.tsx`: Show active profile name in palette tooltip/label when present and pass profile-management permission into the modal.
- `components/EmptyState.tsx`: Read v2 collection, update seed/profile copy for the active profile, and pass profile-management permission into the modal.
- `components/TasteStarButton.tsx`: No structural UI change; verify it works through the collection-aware hook.
- `tests/unit/taste-library.test.ts`: Add collection migration and CRUD coverage.
- `tests/unit/overrides.test.ts`: Add profile-scoped correction coverage.
- `tests/e2e/contact-sheet-smoke.spec.ts`: Update localStorage assertions and add profile switching coverage.
- `docs/NEXT-SESSION.md`: Point the next build handoff at this plan after implementation starts or completes.

## Preflight

- [ ] **Step 1: Start from the repo root**

Run:

```bash
cd "/Users/griffin.sisk/Desktop/AI Projects/contact-sheet-repo"
git status --short
git branch --show-current
```

Expected: note any existing uncommitted work before editing. Do not overwrite unrelated user changes.

- [ ] **Step 2: Create an implementation branch or worktree**

If the current branch is still tied to another PR, create isolated work:

```bash
git switch -c feature/local-multi-profile-taste-profiles
```

Expected: branch switches cleanly. If it does not, stop and inspect the dirty files before proceeding.

- [ ] **Step 3: Run the current focused baseline**

Run:

```bash
npm run typecheck
npm run test:unit
```

Expected: both pass before feature work starts. If either fails, capture the failure and decide whether it is pre-existing.

---

### Task 1: Add v2 Collection Storage and Migration

**Files:**
- Modify: `lib/taste-library.ts`
- Modify: `tests/unit/proxy-payload.test.ts`
- Create: `tests/unit/taste-library.test.ts`

- [ ] **Step 1: Write collection model tests**

Create `tests/unit/taste-library.test.ts` with tests for v1 migration, profile CRUD, active-library updates, max profile enforcement, and case-insensitive name uniqueness:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  addLibraryToCollection,
  deleteLibraryFromCollection,
  emptyCollection,
  emptyLibrary,
  migrateLegacyLibrary,
  renameLibraryInCollection,
  setActiveLibraryInCollection,
  updateActiveLibrary,
  type LegacyTasteLibrary,
} from "../../lib/taste-library";

test("migrateLegacyLibrary wraps v1 library in a named v2 collection", () => {
  const legacy: LegacyTasteLibrary = {
    version: 1,
    entries: [{ photoHash: "hash-a", addedAt: 10, image: "abc" }],
    currentProfile: {
      prose: "warm close studies",
      aestheticTags: ["warm"],
      generatedAt: 100,
      generatedFromEntryCount: 1,
    },
    lastRegenAt: 100,
  };

  const collection = migrateLegacyLibrary(legacy, "profile-1", 1234);

  assert.equal(collection.version, 2);
  assert.equal(collection.activeId, "profile-1");
  assert.equal(collection.updatedAt, 1234);
  assert.equal(collection.libraries.length, 1);
  assert.equal(collection.libraries[0].id, "profile-1");
  assert.equal(collection.libraries[0].name, "My Profile");
  assert.equal(collection.libraries[0].version, 2);
  assert.equal(collection.libraries[0].entries[0].photoHash, "hash-a");
  assert.equal(collection.libraries[0].currentProfile?.aestheticTags[0], "warm");
});

test("collection helpers create, rename, switch, update, and delete libraries", () => {
  const first = emptyLibrary("first-id", "Wedding");
  let collection = emptyCollection(100, first);

  const added = addLibraryToCollection(collection, "Street", "street-id", 200);
  collection = added.collection;
  assert.equal(added.library.id, "street-id");
  assert.equal(collection.activeId, "street-id");
  assert.equal(collection.libraries.length, 2);

  collection = renameLibraryInCollection(collection, "street-id", "Street Work", 300);
  assert.equal(collection.libraries.find((l) => l.id === "street-id")?.name, "Street Work");
  assert.equal(collection.updatedAt, 300);

  collection = setActiveLibraryInCollection(collection, "first-id", 400);
  assert.equal(collection.activeId, "first-id");

  collection = updateActiveLibrary(collection, (library) => ({
    ...library,
    entries: [{ photoHash: "hash-b", addedAt: 500, image: "def" }],
  }), 500);
  assert.equal(collection.libraries.find((l) => l.id === "first-id")?.entries.length, 1);

  collection = deleteLibraryFromCollection(collection, "first-id", 600);
  assert.equal(collection.libraries.length, 1);
  assert.equal(collection.activeId, "street-id");
});

test("collection helper rejects duplicate names and more than three libraries", () => {
  let collection = emptyCollection(100, emptyLibrary("a", "Wedding"));
  collection = addLibraryToCollection(collection, "Street", "b", 200).collection;
  collection = addLibraryToCollection(collection, "Travel", "c", 300).collection;

  assert.throws(
    () => addLibraryToCollection(collection, "Family", "d", 400),
    /at most 3/i,
  );
  assert.throws(
    () => renameLibraryInCollection(collection, "b", "wedding", 500),
    /already exists/i,
  );
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/taste-library.test.ts
```

Expected: FAIL because the collection helpers and v2 types do not exist.

- [ ] **Step 3: Replace the v1-only model with v2-compatible types**

In `lib/taste-library.ts`, keep `TasteEntry` and `TasteProfile`, add a legacy type for migration, and update `TasteLibrary`:

```ts
export interface LegacyTasteLibrary {
  version: 1;
  entries: TasteEntry[];
  pinned?: string[];
  currentProfile?: TasteProfile;
  lastRegenAt?: number;
}

export interface TasteLibrary {
  version: 2;
  id: string;
  name: string;
  entries: TasteEntry[];
  pinned?: string[];
  currentProfile?: TasteProfile;
  lastRegenAt?: number;
}

export interface TasteLibraryCollection {
  version: 2;
  libraries: TasteLibrary[];
  activeId: string | null;
  updatedAt: number;
}

const STORAGE_KEY_V1 = "cs-taste-library";
const STORAGE_KEY_V2 = "cs-taste-libraries";
const MAX_LIBRARIES = 3;
const DEFAULT_PROFILE_NAME = "My Profile";
```

- [ ] **Step 4: Add pure collection helpers**

In `lib/taste-library.ts`, add these helpers near `emptyLibrary`:

```ts
function nowId(): string {
  return crypto.randomUUID();
}

function normalizeName(name: string): string {
  return name.trim();
}

function assertValidName(collection: TasteLibraryCollection, name: string, excludeId?: string): string {
  const trimmed = normalizeName(name);
  if (!trimmed) throw new Error("Profile name is required.");
  if (trimmed.length > 30) throw new Error("Profile name must be 30 characters or less.");
  const lower = trimmed.toLowerCase();
  const exists = collection.libraries.some((library) =>
    library.id !== excludeId && library.name.trim().toLowerCase() === lower
  );
  if (exists) throw new Error(`A profile named "${trimmed}" already exists.`);
  return trimmed;
}

export function emptyLibrary(id = nowId(), name = DEFAULT_PROFILE_NAME): TasteLibrary {
  return { version: 2, id, name: normalizeName(name) || DEFAULT_PROFILE_NAME, entries: [] };
}

export function emptyCollection(updatedAt = Date.now(), library?: TasteLibrary): TasteLibraryCollection {
  const initial = library ?? emptyLibrary(nowId(), DEFAULT_PROFILE_NAME);
  return { version: 2, libraries: [initial], activeId: initial.id, updatedAt };
}

export function migrateLegacyLibrary(
  legacy: LegacyTasteLibrary,
  id = nowId(),
  updatedAt = Date.now(),
): TasteLibraryCollection {
  const migrated: TasteLibrary = {
    version: 2,
    id,
    name: DEFAULT_PROFILE_NAME,
    entries: Array.isArray(legacy.entries) ? legacy.entries : [],
    pinned: legacy.pinned,
    currentProfile: legacy.currentProfile,
    lastRegenAt: legacy.lastRegenAt,
  };
  return { version: 2, libraries: [migrated], activeId: migrated.id, updatedAt };
}

export function getActiveLibrary(collection: TasteLibraryCollection): TasteLibrary {
  return collection.libraries.find((library) => library.id === collection.activeId)
    ?? collection.libraries[0]
    ?? emptyLibrary();
}

export function updateActiveLibrary(
  collection: TasteLibraryCollection,
  updater: (library: TasteLibrary) => TasteLibrary,
  updatedAt = Date.now(),
): TasteLibraryCollection {
  const active = getActiveLibrary(collection);
  const libraries = collection.libraries.map((library) =>
    library.id === active.id ? evictFifo(updater(library)) : library
  );
  return { ...collection, libraries, activeId: active.id, updatedAt };
}

export function addLibraryToCollection(
  collection: TasteLibraryCollection,
  name: string,
  id = nowId(),
  updatedAt = Date.now(),
): { collection: TasteLibraryCollection; library: TasteLibrary } {
  if (collection.libraries.length >= MAX_LIBRARIES) {
    throw new Error("You can create at most 3 taste profiles.");
  }
  const validName = assertValidName(collection, name);
  const library = emptyLibrary(id, validName);
  return {
    library,
    collection: {
      ...collection,
      libraries: [...collection.libraries, library],
      activeId: library.id,
      updatedAt,
    },
  };
}

export function renameLibraryInCollection(
  collection: TasteLibraryCollection,
  id: string,
  name: string,
  updatedAt = Date.now(),
): TasteLibraryCollection {
  const validName = assertValidName(collection, name, id);
  return {
    ...collection,
    libraries: collection.libraries.map((library) =>
      library.id === id ? { ...library, name: validName } : library
    ),
    updatedAt,
  };
}

export function setActiveLibraryInCollection(
  collection: TasteLibraryCollection,
  id: string | null,
  updatedAt = Date.now(),
): TasteLibraryCollection {
  if (id && !collection.libraries.some((library) => library.id === id)) {
    throw new Error("Taste profile not found.");
  }
  return { ...collection, activeId: id, updatedAt };
}

export function deleteLibraryFromCollection(
  collection: TasteLibraryCollection,
  id: string,
  updatedAt = Date.now(),
): TasteLibraryCollection {
  const libraries = collection.libraries.filter((library) => library.id !== id);
  const activeId = collection.activeId === id
    ? libraries[0]?.id ?? null
    : collection.activeId;
  return { ...collection, libraries, activeId, updatedAt };
}
```

- [ ] **Step 5: Add v2 client storage while preserving compatibility names**

Update `getTasteLibraryClient` and `setTasteLibraryClient` to operate on the active library, and add collection-level storage functions:

```ts
export function getTasteLibraryCollectionClient(): TasteLibraryCollection {
  if (typeof window === "undefined") return emptyCollection();
  const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
  if (rawV2) {
    try {
      const parsed = JSON.parse(rawV2) as TasteLibraryCollection;
      if (parsed.version === 2 && Array.isArray(parsed.libraries)) {
        return parsed.libraries.length > 0 ? parsed : emptyCollection();
      }
    } catch {
      return emptyCollection();
    }
  }

  const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
  if (rawV1) {
    try {
      const legacy = JSON.parse(rawV1) as LegacyTasteLibrary;
      if (legacy.version === 1 && Array.isArray(legacy.entries)) {
        const migrated = migrateLegacyLibrary(legacy);
        localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(migrated));
        localStorage.removeItem(STORAGE_KEY_V1);
        return migrated;
      }
    } catch {
      return emptyCollection();
    }
  }

  const empty = emptyCollection();
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(empty));
  return empty;
}

export function setTasteLibraryCollectionClient(collection: TasteLibraryCollection): void {
  if (typeof window === "undefined") return;
  const prev = getTasteLibraryCollectionClient();
  const next: TasteLibraryCollection = {
    ...collection,
    libraries: collection.libraries.map(evictFifo),
  };
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(TASTE_LIBRARY_CHANGED_EVENT));
  if (getActiveLibrary(next).entries.length > getActiveLibrary(prev).entries.length) {
    window.dispatchEvent(new CustomEvent(TASTE_LIBRARY_ENTRY_ADDED_EVENT));
  }
}

export function getTasteLibraryClient(): TasteLibrary {
  return getActiveLibrary(getTasteLibraryCollectionClient());
}

export function setTasteLibraryClient(library: TasteLibrary): void {
  const current = getTasteLibraryCollectionClient();
  setTasteLibraryCollectionClient(updateActiveLibrary(current, () => library));
}
```

- [ ] **Step 6: Update `generateTasteProfile` type usage**

Keep the function signature as:

```ts
export async function generateTasteProfile(
  library: TasteLibrary,
  corrections?: OverrideEntry[],
): Promise<{
  profile: TasteProfile | null;
  coherence: "high" | "medium" | "low";
  usedEntryCount: number;
  usedCorrectionCount: number;
}> {
```

The body can continue to use `library.entries` for now. Correction filtering is handled in Task 5.

- [ ] **Step 7: Update existing unit fixture types**

In `tests/unit/proxy-payload.test.ts`, change the test library object to v2:

```ts
const library: TasteLibrary = {
  version: 2,
  id: "profile-a",
  name: "My Profile",
  entries: Array.from({ length: 40 }, (_, i) => ({
    photoHash: `hash-${i}`,
    addedAt: i,
    image: bigImage,
  })),
};
```

- [ ] **Step 8: Run unit tests**

Run:

```bash
npm run test:unit -- tests/unit/taste-library.test.ts tests/unit/proxy-payload.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add lib/taste-library.ts tests/unit/taste-library.test.ts tests/unit/proxy-payload.test.ts
git commit -m "feat: add local taste profile collection model"
```

Expected: commit succeeds.

---

### Task 2: Refactor `useTasteLibrary` Around the Active Collection

**Files:**
- Modify: `hooks/useTasteLibrary.ts`

- [ ] **Step 1: Update the hook interface**

In `hooks/useTasteLibrary.ts`, import the new collection helpers and expose collection operations:

```ts
import {
  TASTE_LIBRARY_CHANGED_EVENT,
  TasteEntry,
  TasteLibrary,
  TasteLibraryCollection,
  TasteProfile,
  addLibraryToCollection,
  deleteLibraryFromCollection,
  emptyCollection,
  getActiveLibrary,
  getTasteLibraryCollectionClient,
  renameLibraryInCollection,
  setActiveLibraryInCollection,
  setTasteLibraryCollectionClient,
  updateActiveLibrary,
} from "@/lib/taste-library";

export interface UseTasteLibrary {
  library: TasteLibrary;
  collection: TasteLibraryCollection;
  activeId: string | null;
  isFavorited: (photoHash: string) => boolean;
  toggleFavorite: (entry: TasteEntry) => void;
  addEntries: (entries: TasteEntry[]) => void;
  setProfile: (profile: TasteProfile | null) => void;
  setLastRegenAt: (ts: number) => void;
  setActiveId: (id: string | null) => void;
  createLibrary: (name: string) => string;
  renameLibrary: (id: string, name: string) => void;
  deleteLibrary: (id: string) => void;
}
```

- [ ] **Step 2: Store collection state and derive active library**

Replace `library` state with collection state:

```ts
export function useTasteLibrary(): UseTasteLibrary {
  const [collection, setCollection] = useState<TasteLibraryCollection>(() => emptyCollection());

  useEffect(() => {
    setCollection(getTasteLibraryCollectionClient());
    const onChange = () => setCollection(getTasteLibraryCollectionClient());
    window.addEventListener(TASTE_LIBRARY_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(TASTE_LIBRARY_CHANGED_EVENT, onChange);
  }, []);

  const persist = useCallback((next: TasteLibraryCollection) => {
    setTasteLibraryCollectionClient(next);
    setCollection(getTasteLibraryCollectionClient());
  }, []);

  const library = getActiveLibrary(collection);
```

- [ ] **Step 3: Rewrite existing mutations to update the active library**

Keep existing consumers working by making the old methods active-library aware:

```ts
const isFavorited = useCallback(
  (photoHash: string) => library.entries.some((e) => e.photoHash === photoHash),
  [library],
);

const toggleFavorite = useCallback(
  (entry: TasteEntry) => {
    const current = getTasteLibraryCollectionClient();
    const next = updateActiveLibrary(current, (active) => {
      const exists = active.entries.some((e) => e.photoHash === entry.photoHash);
      const nextEntries = exists
        ? active.entries.filter((e) => e.photoHash !== entry.photoHash)
        : [...active.entries, entry];
      return { ...active, entries: nextEntries };
    });
    persist(next);
  },
  [persist],
);

const addEntries = useCallback(
  (entries: TasteEntry[]) => {
    const current = getTasteLibraryCollectionClient();
    const active = getActiveLibrary(current);
    const existing = new Set(active.entries.map((e) => e.photoHash));
    const additions = entries.filter((e) => !existing.has(e.photoHash));
    if (additions.length === 0) return;
    persist(updateActiveLibrary(current, (library) => ({
      ...library,
      entries: [...library.entries, ...additions],
    })));
  },
  [persist],
);
```

Add `setProfile`:

```ts
const setProfile = useCallback(
  (profile: TasteProfile | null) => {
    const current = getTasteLibraryCollectionClient();
    persist(updateActiveLibrary(current, (library) => {
      const next = { ...library };
      if (profile) {
        next.currentProfile = profile;
      } else {
        delete next.currentProfile;
      }
      return next;
    }));
  },
  [persist],
);
```

Add `setLastRegenAt`:

```ts
const setLastRegenAt = useCallback(
  (ts: number) => {
    persist(updateActiveLibrary(getTasteLibraryCollectionClient(), (library) => ({
      ...library,
      lastRegenAt: ts,
    })));
  },
  [persist],
);
```

- [ ] **Step 4: Add collection CRUD callbacks**

Add:

```ts
const setActiveId = useCallback(
  (id: string | null) => {
    persist(setActiveLibraryInCollection(getTasteLibraryCollectionClient(), id));
  },
  [persist],
);

const createLibrary = useCallback(
  (name: string) => {
    const { collection: next, library } = addLibraryToCollection(getTasteLibraryCollectionClient(), name);
    persist(next);
    return library.id;
  },
  [persist],
);

const renameLibrary = useCallback(
  (id: string, name: string) => {
    persist(renameLibraryInCollection(getTasteLibraryCollectionClient(), id, name));
  },
  [persist],
);

const deleteLibrary = useCallback(
  (id: string) => {
    persist(deleteLibraryFromCollection(getTasteLibraryCollectionClient(), id));
  },
  [persist],
);
```

Return:

```ts
return {
  library,
  collection,
  activeId: collection.activeId,
  isFavorited,
  toggleFavorite,
  addEntries,
  setProfile,
  setLastRegenAt,
  setActiveId,
  createLibrary,
  renameLibrary,
  deleteLibrary,
};
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS or only call-site errors for properties intentionally added in later tasks. If call-site errors occur, fix imports/usages without changing behavior.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add hooks/useTasteLibrary.ts
git commit -m "feat: expose active taste profile collection hook"
```

Expected: commit succeeds.

---

### Task 3: Add Profile Management to the Seed/Manage Modal

**Files:**
- Modify: `components/SeedUploadModal.tsx`
- Modify: `tests/e2e/contact-sheet-smoke.spec.ts`

- [ ] **Step 1: Add failing e2e coverage for profile creation and switching**

In `tests/e2e/contact-sheet-smoke.spec.ts`, add a test that opens the modal, creates a second profile, and verifies the new profile is active:

```ts
test("creates and switches local taste profiles", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Upload Favorites" }).click();
  await expect(page.getByText("My Profile")).toBeVisible();

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
```

- [ ] **Step 2: Run the focused e2e test and verify it fails**

Run:

```bash
npm run test:e2e -- --grep "creates and switches local taste profiles"
```

Expected: FAIL because modal profile management does not exist.

- [ ] **Step 3: Add a prop gate for multi-profile management**

Update `SeedUploadModal` props:

```ts
interface Props {
  onClose: () => void;
  mode?: "manage" | "view";
  allowMultipleProfiles?: boolean;
}
```

Update the component signature:

```ts
export default function SeedUploadModal({ onClose, mode = "manage", allowMultipleProfiles = false }: Props) {
```

Use `allowMultipleProfiles` to show create/rename/delete controls only for Pro/BYOK callers. Free users still use the active single local library.

- [ ] **Step 4: Read collection methods from the hook**

At the top of `SeedUploadModal`, replace the hook destructuring with:

```ts
const {
  addEntries,
  library,
  collection,
  activeId,
  setActiveId,
  createLibrary,
  renameLibrary,
  deleteLibrary,
  setProfile,
  setLastRegenAt,
  toggleFavorite,
} = useTasteLibrary();
```

- [ ] **Step 5: Add modal state for profile creation and rename**

Near existing modal state, add:

```ts
const [newProfileName, setNewProfileName] = useState("");
const [renamingId, setRenamingId] = useState<string | null>(null);
const [renameValue, setRenameValue] = useState("");
```

- [ ] **Step 6: Add profile action handlers**

Add these callbacks before `return`:

```ts
const handleCreateProfile = useCallback(() => {
  try {
    const id = createLibrary(newProfileName);
    setActiveId(id);
    setNewProfileName("");
    setError(null);
    setDoneCount(null);
    setProfileStatus("idle");
    setProfileMsg(null);
  } catch (err: any) {
    setError(err?.message || "Could not create profile.");
  }
}, [createLibrary, newProfileName, setActiveId]);

const beginRename = useCallback((id: string, name: string) => {
  setRenamingId(id);
  setRenameValue(name);
}, []);

const commitRename = useCallback(() => {
  if (!renamingId) return;
  try {
    renameLibrary(renamingId, renameValue);
    setRenamingId(null);
    setRenameValue("");
    setError(null);
  } catch (err: any) {
    setError(err?.message || "Could not rename profile.");
  }
}, [renameLibrary, renameValue, renamingId]);

const handleDeleteProfile = useCallback((id: string, name: string) => {
  if (!window.confirm(`Delete "${name}" profile? This removes its favorites and generated profile.`)) return;
  deleteLibrary(id);
  setDoneCount(null);
  setProfileStatus("idle");
  setProfileMsg(null);
}, [deleteLibrary]);
```

- [ ] **Step 7: Render profile tabs above upload/profile content**

Inside the modal, after the heading block and before `doneCount !== null`, add:

```tsx
{allowMultipleProfiles && collection.libraries.length > 0 && (
  <div className="mb-6 border border-outline-variant/40 bg-surface-lowest/40 p-3">
    <div className="flex flex-wrap items-center gap-2">
      {collection.libraries.map((profile) => (
        <button
          key={profile.id}
          type="button"
          onClick={() => setActiveId(profile.id)}
          aria-pressed={activeId === profile.id}
          className={`px-3 py-2 font-label text-[10px] uppercase tracking-widest border transition-colors ${
            activeId === profile.id
              ? "border-primary bg-primary text-on-primary"
              : "border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-high"
          }`}
        >
          {profile.name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setNewProfileName("Untitled Profile")}
        disabled={collection.libraries.length >= 3}
        className="px-3 py-2 font-label text-[10px] uppercase tracking-widest border border-outline-variant text-on-surface hover:bg-surface-high disabled:opacity-40"
      >
        New Profile
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 8: Render create/rename/delete controls**

Below the tab row, render creation when `newProfileName` is non-empty:

```tsx
{newProfileName && (
  <div className="mb-6 flex gap-2">
    <input
      aria-label="Profile name"
      value={newProfileName}
      onChange={(e) => setNewProfileName(e.target.value)}
      maxLength={30}
      className="flex-1 bg-surface-low border border-outline-variant px-3 py-2 text-on-surface"
    />
    <button
      type="button"
      onClick={handleCreateProfile}
      className="px-4 py-2 bg-primary text-on-primary font-label text-[10px] uppercase tracking-widest"
    >
      Create Profile
    </button>
  </div>
)}
```

In the existing profile summary area, add compact controls for the active profile:

```tsx
{library.id && (
  <div className="mt-2 flex items-center gap-2">
    {renamingId === library.id ? (
      <>
        <input
          aria-label="Rename profile"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitRename(); }}
          maxLength={30}
          className="bg-surface-low border border-outline-variant px-2 py-1 text-sm text-on-surface"
        />
        <button type="button" onClick={commitRename} className="font-label text-[10px] uppercase tracking-widest text-primary">
          Save
        </button>
      </>
    ) : (
      <>
        <button type="button" onClick={() => beginRename(library.id, library.name)} className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-on-surface">
          Rename
        </button>
        {collection.libraries.length > 1 && (
          <button type="button" onClick={() => handleDeleteProfile(library.id, library.name)} className="font-label text-[10px] uppercase tracking-widest text-error">
            Delete
          </button>
        )}
      </>
    )}
  </div>
)}
```

- [ ] **Step 9: Update heading copy to include active profile name**

Change the modal subtitle line to make the active profile visible:

```tsx
{isViewOnly
  ? `How future culls read ${library.name}`
  : `Pick ${MIN_FILES}-${MAX_FILES} photos for ${library.name}`}
```

- [ ] **Step 10: Run focused e2e**

Run:

```bash
npm run test:e2e -- --grep "creates and switches local taste profiles"
```

Expected: PASS.

- [ ] **Step 11: Commit Task 3**

Run:

```bash
git add components/SeedUploadModal.tsx tests/e2e/contact-sheet-smoke.spec.ts
git commit -m "feat: manage local taste profiles in modal"
```

Expected: commit succeeds.

---

### Task 4: Show and Switch Active Profile at Cull Time

**Files:**
- Modify: `components/ContactSheet.tsx`
- Modify: `components/Header.tsx`
- Modify: `components/EmptyState.tsx`
- Modify: `tests/e2e/contact-sheet-smoke.spec.ts`

- [ ] **Step 1: Add failing e2e coverage for cull-time active profile switching**

Add a test that seeds localStorage with two profiles and verifies switching the active profile changes the cull request body:

```ts
test("cull uses the selected active taste profile", async ({ page }) => {
  const requests: any[] = [];
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
  await page.getByLabel("Taste profile").selectOption("street");
  await page.getByRole("button", { name: /START CULL/i }).click();

  await expect.poll(() => Promise.resolve(requests[0]?.profile?.prose)).toBe("hard light public moments");
});
```

- [ ] **Step 2: Run the focused e2e test and verify it fails**

Run:

```bash
npm run test:e2e -- --grep "cull uses the selected active taste profile"
```

Expected: FAIL because no cull-time selector exists.

- [ ] **Step 3: Read collection methods in `ContactSheet`**

Change the hook destructuring:

```ts
const {
  library: tasteLibrary,
  collection: tasteCollection,
  activeId: activeTasteProfileId,
  setActiveId: setActiveTasteProfileId,
  setProfile: setTasteProfile,
  setLastRegenAt: setTasteLastRegenAt,
} = useTasteLibrary();
```

- [ ] **Step 4: Derive multi-profile permission and pass it to modal owners**

After `tier` is computed in `ContactSheet`, add:

```ts
const allowMultipleTasteProfiles = tier === "pro" || tier === "byok";
```

Pass it into `Header`:

```tsx
<Header
  onHistory={() => setShowSessions(true)}
  onSettings={() => setShowSettings(true)}
  onAddFiles={() => fileInputRef.current?.click()}
  allowMultipleProfiles={allowMultipleTasteProfiles}
/>
```

Pass it into `EmptyState`:

```tsx
<EmptyState
  level={level}
  onLevelChange={setLevel}
  onFiles={handleFiles}
  sessions={sessions}
  onRestoreSession={handleRestoreSession}
  onOpenSettings={() => setShowSettings(true)}
  allowMultipleProfiles={allowMultipleTasteProfiles}
/>
```

- [ ] **Step 5: Render cull-time profile selector**

Above the `IntentPicker` in `ContactSheet`, add:

```tsx
{tasteCollection.libraries.length > 1 && (
  <div className="mb-4 flex items-center justify-between gap-3">
    <label htmlFor="taste-profile-picker" className="font-label text-[11px] text-on-surface uppercase tracking-widest">
      Taste profile
    </label>
    <select
      id="taste-profile-picker"
      aria-label="Taste profile"
      value={activeTasteProfileId ?? ""}
      onChange={(e) => setActiveTasteProfileId(e.target.value || null)}
      className="bg-surface-high text-on-surface px-3 py-2 font-label text-[11px] uppercase tracking-widest border border-outline-variant"
    >
      {tasteCollection.libraries.map((profile) => (
        <option key={profile.id} value={profile.id}>{profile.name}</option>
      ))}
    </select>
  </div>
)}
{tasteCollection.libraries.length === 1 && tasteLibrary.currentProfile && (
  <div className="mb-4 font-label text-[11px] text-on-surface-variant uppercase tracking-widest">
    Taste profile: {tasteLibrary.name}
  </div>
)}
```

- [ ] **Step 6: Keep cull/deep profile construction active-library scoped**

The existing profile construction should still use `tasteLibrary.currentProfile` and `tasteLibrary.entries`. Do not pass profile names into `runCull`; the API should receive only profile prose, tags, and library photo hashes.

- [ ] **Step 7: Update `Header` active profile label**

In `components/Header.tsx`, import and use the hook:

```ts
import { useTasteLibrary } from "@/hooks/useTasteLibrary";
```

Extend props:

```ts
interface Props {
  onHistory: () => void;
  onSettings: () => void;
  onAddFiles: () => void;
  allowMultipleProfiles?: boolean;
}

export default function Header({ onHistory, onSettings, onAddFiles, allowMultipleProfiles = false }: Props) {
```

Inside `Header`:

```ts
const { library, collection } = useTasteLibrary();
const profileTitle = library.currentProfile
  ? `Taste profile: ${library.name}`
  : "Add favorites to taste library";
```

Update the palette button:

```tsx
<button
  onClick={() => setShowSeedModal(true)}
  className="text-on-surface/60 hover:text-primary transition-colors duration-200 p-2 flex items-center gap-2"
  aria-label={profileTitle}
  title={profileTitle}
>
  <span className="material-symbols-outlined">palette</span>
  {collection.libraries.length > 1 && (
    <span className="hidden lg:inline mono-label text-[10px] text-on-surface-variant max-w-[120px] truncate">
      {library.name}
    </span>
  )}
</button>
```

Pass the prop into the modal:

```tsx
{showSeedModal && (
  <SeedUploadModal
    onClose={() => setShowSeedModal(false)}
    allowMultipleProfiles={allowMultipleProfiles}
  />
)}
```

- [ ] **Step 8: Update `EmptyState` to read v2 active library**

Replace `getTasteLibraryClient` use with `useTasteLibrary()`:

```ts
import { useTasteLibrary } from "@/hooks/useTasteLibrary";
```

Inside `EmptyState`:

```ts
const { library } = useTasteLibrary();
const profile = library.currentProfile;
const seedCount = library.entries.length;
```

Extend props:

```ts
interface Props {
  level: ExperienceLevel;
  onLevelChange: (level: ExperienceLevel) => void;
  onFiles: (files: File[]) => void;
  sessions: SessionSummary[];
  onRestoreSession: (id: string) => void;
  onOpenSettings: () => void;
  allowMultipleProfiles?: boolean;
}

export default function EmptyState({ level, onLevelChange, onFiles, sessions, onRestoreSession, onOpenSettings, allowMultipleProfiles = false }: Props) {
```

Remove the `library` state and `getTasteLibraryClient()` effect. Update copy to include `library.name` where it helps:

```tsx
{profile
  ? `${seedCount} favorite${seedCount === 1 ? "" : "s"} in ${library.name} · ${profile.aestheticTags.length} tag${profile.aestheticTags.length === 1 ? "" : "s"} · updated ${new Date(profile.generatedAt).toLocaleDateString()}. Future culls bias toward how you see.`
  : "Upload 8-20 favorites to seed a taste profile so future culls reflect how you see, not generic defaults."}
```

Pass the prop into `SeedUploadModal`:

```tsx
{showSeedModal && (
  <SeedUploadModal
    onClose={() => setShowSeedModal(false)}
    mode={seedModalMode}
    allowMultipleProfiles={allowMultipleProfiles}
  />
)}
```

- [ ] **Step 9: Run focused and smoke e2e**

Run:

```bash
npm run test:e2e -- --grep "cull uses the selected active taste profile"
npm run test:e2e -- --grep "cull, correction, and star signals"
```

Expected: both pass after updating old localStorage assertions to `cs-taste-libraries`.

- [ ] **Step 10: Commit Task 4**

Run:

```bash
git add components/ContactSheet.tsx components/Header.tsx components/EmptyState.tsx tests/e2e/contact-sheet-smoke.spec.ts
git commit -m "feat: switch active taste profile at cull time"
```

Expected: commit succeeds.

---

### Task 5: Scope Corrections and Profile Regen by Active Profile

**Files:**
- Modify: `lib/overrides.ts`
- Modify: `lib/taste-library.ts`
- Modify: `components/ContactSheet.tsx`
- Modify: `components/SeedUploadModal.tsx`
- Create: `tests/unit/overrides.test.ts`
- Modify: `tests/e2e/contact-sheet-smoke.spec.ts`

- [ ] **Step 1: Write failing unit coverage for correction scoping**

Create `tests/unit/overrides.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  correctionsForProfile,
  scopeUnscopedOverrides,
  type OverrideStore,
} from "../../lib/overrides";

test("correctionsForProfile returns only corrections for the active profile", () => {
  const store: OverrideStore = {
    version: 1,
    entries: [
      {
        photoHash: "a",
        shortDescription: "soft ceremony frame",
        sessionIntent: "events",
        originalScore: 60,
        originalRating: "MAYBE",
        userRating: "SELECT",
        timestamp: 1,
        profileIdAtCull: "wedding",
      },
      {
        photoHash: "b",
        shortDescription: "hard street light",
        sessionIntent: "street",
        originalScore: 60,
        originalRating: "MAYBE",
        userRating: "SELECT",
        timestamp: 2,
        profileIdAtCull: "street",
      },
      {
        photoHash: "c",
        shortDescription: "old global correction",
        sessionIntent: "mixed",
        originalScore: 60,
        originalRating: "MAYBE",
        userRating: "SELECT",
        timestamp: 3,
        profileIdAtCull: null,
      },
    ],
  };

  assert.deepEqual(correctionsForProfile(store.entries, "wedding").map((e) => e.photoHash), ["a"]);
  assert.deepEqual(correctionsForProfile(store.entries, "street").map((e) => e.photoHash), ["b"]);
});

test("scopeUnscopedOverrides assigns old undefined corrections to migrated profile", () => {
  const store: OverrideStore = {
    version: 1,
    entries: [{
      photoHash: "legacy",
      shortDescription: "legacy correction",
      sessionIntent: "mixed",
      originalScore: 50,
      originalRating: "MAYBE",
      userRating: "SELECT",
      timestamp: 1,
    }],
  };

  const scoped = scopeUnscopedOverrides(store, "profile-1");
  assert.equal(scoped.entries[0].profileIdAtCull, "profile-1");
});
```

- [ ] **Step 2: Run the unit test and verify it fails**

Run:

```bash
npm run test:unit -- tests/unit/overrides.test.ts
```

Expected: FAIL because helper functions and field do not exist.

- [ ] **Step 3: Extend override types and helpers**

In `lib/overrides.ts`, add:

```ts
export interface OverrideEntry {
  photoHash: string;
  /** One-line gist of the frame, generated by a small model call at override time. */
  shortDescription: string;
  sessionIntent: IntentPreset;
  originalScore: number;
  originalRating: Rating;
  userRating: Rating;
  timestamp: number;
  profileIdAtCull?: string | null;
}
```

Add helpers:

```ts
export function correctionsForProfile(entries: OverrideEntry[], profileId: string | null | undefined): OverrideEntry[] {
  if (!profileId) return [];
  return entries.filter((entry) => entry.profileIdAtCull === profileId);
}

export function scopeUnscopedOverrides(store: OverrideStore, profileId: string): OverrideStore {
  return {
    ...store,
    entries: store.entries.map((entry) =>
      entry.profileIdAtCull === undefined ? { ...entry, profileIdAtCull: profileId } : entry
    ),
  };
}

export function scopeUnscopedOverridesClient(profileId: string): void {
  const current = getOverridesClient();
  const next = scopeUnscopedOverrides(current, profileId);
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    setOverridesClient(next);
  }
}
```

- [ ] **Step 4: Keep `useOverrides` API unchanged**

No hook changes are required. Consumers can continue to read `overridesStore.entries` and apply the pure `correctionsForProfile` helper where profile-scoped filtering is needed.

- [ ] **Step 5: Scope old corrections during local migration**

In the client migration path in `getTasteLibraryCollectionClient`, after writing the migrated collection, scope old undefined corrections:

```ts
try {
  const rawOverrides = localStorage.getItem("cs-overrides");
  if (rawOverrides && migrated.activeId) {
    const parsed = JSON.parse(rawOverrides) as { version: 1; entries?: Array<{ profileIdAtCull?: string | null }> };
    if (parsed.version === 1 && Array.isArray(parsed.entries)) {
      const scoped = {
        ...parsed,
        entries: parsed.entries.map((entry) =>
          entry.profileIdAtCull === undefined ? { ...entry, profileIdAtCull: migrated.activeId } : entry
        ),
      };
      localStorage.setItem("cs-overrides", JSON.stringify(scoped));
    }
  }
} catch {
  // Ignore override migration failures; the taste library migration still succeeds.
}
```

Keep this inline to avoid importing override functions into `lib/taste-library.ts` and creating tighter module coupling.

- [ ] **Step 6: Filter corrections in profile generation**

In `lib/taste-library.ts`, import `correctionsForProfile`:

```ts
import type { OverrideEntry } from "./overrides";
import { correctionsForProfile } from "./overrides";
```

Inside `generateTasteProfile`, replace correction filtering with:

```ts
const scopedCorrections = correctionsForProfile(corrections ?? [], library.id);
const usableCorrections = scopedCorrections.filter((c) => c.shortDescription.trim().length > 0);
```

- [ ] **Step 7: Record `profileIdAtCull` on new corrections**

In `components/ContactSheet.tsx`, add `profileIdAtCull` to `baseEntry`:

```ts
const baseEntry = {
  photoHash: hash,
  shortDescription: "",
  sessionIntent: intentPreset,
  originalScore: cull.score,
  originalRating: cull.rating,
  userRating: rating,
  timestamp: Date.now(),
  profileIdAtCull: activeTasteProfileId,
};
```

Include `activeTasteProfileId` in the `handleRatingOverride` dependency list.

- [ ] **Step 8: Filter correction display counts in `SeedUploadModal`**

Change correction entries to active-profile scoped:

```ts
const correctionEntries = [...overridesStore.entries]
  .filter((entry) => entry.profileIdAtCull === library.id)
  .sort((a, b) => b.timestamp - a.timestamp);
```

This keeps "Corrections feeding this profile" honest per active profile.

- [ ] **Step 9: Update e2e assertion for correction storage**

In the existing correction test, update the localStorage poll to assert `profileIdAtCull` exists:

```ts
await expect.poll(async () => {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("cs-overrides");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.entries?.[0]?.profileIdAtCull || null;
  });
}).not.toBeNull();
```

- [ ] **Step 10: Run unit and e2e checks**

Run:

```bash
npm run test:unit -- tests/unit/overrides.test.ts tests/unit/taste-library.test.ts
npm run test:e2e -- --grep "cull, correction, and star signals"
```

Expected: PASS.

- [ ] **Step 11: Commit Task 5**

Run:

```bash
git add lib/overrides.ts lib/taste-library.ts components/ContactSheet.tsx components/SeedUploadModal.tsx tests/unit/overrides.test.ts tests/e2e/contact-sheet-smoke.spec.ts
git commit -m "feat: scope corrections to active taste profile"
```

Expected: commit succeeds.

---

### Task 6: Update Existing E2E Storage Expectations for v2

**Files:**
- Modify: `tests/e2e/contact-sheet-smoke.spec.ts`

- [ ] **Step 1: Replace `cs-taste-library` assertions with v2 collection reads**

Where tests currently read:

```ts
const raw = window.localStorage.getItem("cs-taste-library");
```

Use:

```ts
const raw = window.localStorage.getItem("cs-taste-libraries");
if (!raw) return 0;
const parsed = JSON.parse(raw);
const active = parsed.libraries.find((library: { id: string }) => library.id === parsed.activeId) ?? parsed.libraries[0];
return active?.entries?.length ?? 0;
```

- [ ] **Step 2: Update seeded duplicate test to use active library entries**

Update the duplicate test's local profile state read to use:

```ts
const state = await page.evaluate(() => {
  const raw = window.localStorage.getItem("cs-taste-libraries");
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const active = parsed.libraries.find((library: { id: string }) => library.id === parsed.activeId) ?? parsed.libraries[0];
  return { activeName: active.name, entryCount: active.entries.length, hasProfile: !!active.currentProfile };
});
expect(state?.entryCount).toBeGreaterThanOrEqual(8);
expect(state?.hasProfile).toBe(true);
```

- [ ] **Step 3: Run all e2e tests**

Run:

```bash
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 4: Commit Task 6**

Run:

```bash
git add tests/e2e/contact-sheet-smoke.spec.ts
git commit -m "test: update taste profile e2e coverage for v2 storage"
```

Expected: commit succeeds.

---

### Task 7: Final Verification and Handoff Notes

**Files:**
- Modify: `docs/NEXT-SESSION.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run typecheck
npm run test:unit
npm run test:e2e
```

Expected: all pass.

- [ ] **Step 2: Run build if tests pass**

Run:

```bash
npm run build
```

Expected: build exits 0.

- [ ] **Step 3: Confirm `docs/NEXT-SESSION.md` points at this plan**

The file should keep this section near the top:

````md
## Queued Build: Local Multi-Profile Taste Profiles

Plan: `docs/superpowers/plans/2026-05-05-local-multi-profile-taste-profiles.md`

Phase 1 is local-only. It ships v2 localStorage collections, profile management, cull-time switching, and profile-scoped corrections. Clerk manifest, private Blob storage, and cross-device sync remain Phase 2.

Verification for Phase 1:

```bash
npm run typecheck
npm run test:unit
npm run test:e2e
npm run build
```
````

- [ ] **Step 4: Inspect git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended files from this plan changed.

- [ ] **Step 5: Commit handoff docs if they changed**

Run:

```bash
git add docs/NEXT-SESSION.md docs/superpowers/specs/2026-05-05-persistent-multi-profile-design.md
git commit -m "docs: hand off local multi-profile build"
```

Expected: commit succeeds if docs changed. If no docs changed, skip this commit.

## Self-Review Checklist

- Spec coverage: Phase 1 covers local collection, profile CRUD, cull-time picker, active profile display, per-profile favorites/profile regen, and correction scoping. Phase 2 storage/sync items are explicitly deferred.
- Placeholder scan: no open-ended implementation placeholders are allowed in this plan. Each task names files, commands, expected outcomes, and concrete code snippets.
- Type consistency: `TasteLibrary.version` is `2`; `TasteLibraryCollection.version` is `2`; active id is `activeId`; correction scope field is `profileIdAtCull`; localStorage key is `cs-taste-libraries`.

## Execution Choice for Next Session

Plan complete and saved to `docs/superpowers/plans/2026-05-05-local-multi-profile-taste-profiles.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in one session using `superpowers:executing-plans`, with checkpoints after each task.
