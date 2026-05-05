# Persistent Multi-Profile Taste Profiles

## Summary

Pro users can create up to 3 named taste profiles (e.g. "Wedding", "Street", "Travel"), each with its own favorites library and generated profile. Profiles persist across sessions and devices via a small Clerk metadata manifest plus private Vercel Blob storage for the full collection JSON and entry images. The active profile is visible in the header and selectable at cull time.

Product copy should use **Taste Profile** for the user-facing object. Internally, these profiles shape culling, but "Cull Profile" would imply broader cull behavior controls than this spec currently delivers. If a later phase adds strictness, intent defaults, or genre-specific scoring preferences, "Cull Profile" can be revisited.

## Data Model

### TasteLibrary v2

```ts
interface TasteLibrary {
  version: 2;
  id: string;           // crypto.randomUUID()
  name: string;         // user-chosen, max 30 chars
  entries: TasteEntry[];
  pinned?: string[];
  currentProfile?: TasteProfile;
  lastRegenAt?: number;
}
```

`TasteEntry.image` transitions from inline base64 to a private Vercel Blob path after upload. During the upload window the field holds base64; once the blob write succeeds it holds the private path. The `generateTasteProfile` flow must handle both formats (resolve private Blob path to base64, or use base64 directly if still local).

### TasteLibraryCollection

```ts
interface TasteLibraryCollection {
  version: 2;
  libraries: TasteLibrary[];  // max 3
  activeId: string | null;    // selected for culling; null = no profile
  updatedAt: number;
}
```

This is the top-level working shape stored in localStorage under `cs-taste-libraries` and persisted for Pro users as private Blob JSON at `taste/{clerkUserId}/collection.json`.

Clerk stores only a compact manifest, not the collection itself:

```ts
interface TasteProfileManifest {
  version: 2;
  collectionPath: string; // taste/{clerkUserId}/collection.json
  activeId: string | null;
  libraries: Array<{
    id: string;
    name: string;
    entryCount: number;
    hasProfile: boolean;
    profileGeneratedAt?: number;
  }>;
}
```

This manifest lives at `publicMetadata.tasteProfileManifest` and is intentionally kept well below Clerk's metadata limit. The old singular `publicMetadata.tasteLibrary` key is migrated away from but not replaced with a large `tasteLibraries` payload.

### TasteEntry Changes

No structural change to `TasteEntry`. The `image` field (`string | undefined`) now holds either:
- base64 (no prefix) — local-only, pre-upload
- private Vercel Blob path — after upload

A helper `resolveEntryImage(entry): Promise<string>` fetches the base64 for a private Blob path or returns inline base64 directly. Used by profile generation.

### OverrideEntry Changes

Corrections need to know which profile was active when the user made the correction:

```ts
interface OverrideEntry {
  // existing fields...
  profileIdAtCull?: string | null;
}
```

Profile regen consumes corrections where `profileIdAtCull === activeId`. Corrections made with no active named profile use `null` and remain baseline-only signals.

## Storage Architecture

### Vercel Blob

Stores the full Pro collection JSON and entry images in a private Blob store.

Key patterns:

- Collection JSON: `taste/{clerkUserId}/collection.json`
- Entry images: `taste/{clerkUserId}/{libraryId}/{photoHash}.jpg`

Images are immutable — the same photo hash always produces the same blob. When an entry is removed from a library, its blob is deleted. When a library is deleted, all its blobs are deleted.

Blob access is private by default. The client never receives raw private Blob credentials. Reads and writes go through authenticated API routes that verify the Clerk user and Pro tier before resolving or mutating blobs.

Vercel Blob SDK: `@vercel/blob` with `BLOB_READ_WRITE_TOKEN` env var in Vercel project settings.

### Clerk publicMetadata

Stores only `tasteProfileManifest`: active profile id, collection path, and small per-library summaries for fast UI hints. It does not store entries, profile prose, profile tags, image URLs, or the full collection. This avoids exceeding Clerk metadata limits and avoids stale large session-token payloads.

### localStorage

Remains the working copy for the active session. Same `TasteLibraryCollection` shape. Free-tier and BYOK users use localStorage exclusively. Free users have a one-library collection with profile creation hidden; BYOK users can create up to 3 local profiles.

## Sync Flow

### On Pro Login

1. Fetch the manifest from Clerk metadata and the full collection JSON from private Blob via `GET /api/taste-library`.
2. Read local collection from localStorage.
3. Server wins for existing Pro users: replace local collection with server state.
4. If the user has only a local v1 library and no server collection yet, migrate it first, upload images, write the Blob collection, write the Clerk manifest, then replace local storage with the sanitized server result.

### On Library Mutation (Pro)

Any mutation (add/remove entry, rename, regen profile, create/delete library, switch active):

1. Write to localStorage immediately (optimistic).
2. Set `updatedAt = Date.now()` on the local collection.
3. Upload any new base64 images via `POST /api/taste-library/upload`.
4. Replace uploaded entries' inline base64 with private Blob path references.
5. Push the sanitized full collection JSON via `PUT /api/taste-library`.
6. The server writes `collection.json` to Blob and updates the small Clerk manifest.

If an image upload fails, keep the base64 image locally and retry before the next server push. The server should reject Pro collection writes that still contain inline image bytes.

### Profile Generation

The existing `/api/taste-profile` route keeps its scoring contract but gains authenticated image resolution for private Blob paths. The client-side `generateTasteProfile` call passes entries from the active library. If entries have Blob paths instead of base64, `resolveEntryImage` calls an authenticated API route to fetch the base64 needed for profile generation.

### Free Tier / BYOK

Free tier stays single unnamed library in localStorage. BYOK users get local-only multi-profile under `cs-taste-libraries`, but no server sync and no private Blob storage. BYOK profile generation should use the user's configured provider key; hosted `/api/taste-profile` remains Pro-gated. If a free or BYOK user upgrades to Pro, their local collection migrates on first sync.

## API Routes

All routes in `app/api/taste-library/`. All Pro-gated (require Clerk auth + Pro tier check).

### GET /api/taste-library

Returns the user's `TasteLibraryCollection` from private Blob, using Clerk metadata only to find the collection path.

Response: `{ version: 2, libraries: TasteLibrary[], activeId: string | null, updatedAt: number }`

Entries in the response have `image` set to private Blob path references, not base64 and not public URLs.

### PUT /api/taste-library

Writes the full collection JSON to private Blob and updates the compact Clerk manifest. Request body is the collection with `image` fields set to private Blob path references. Inline base64 is rejected; the client must upload images first.

Validates: collection version, max 3 libraries, max 100 entries per library, name max 30 chars, name required and non-empty, unique names per user, activeId points at an existing library or null, and every Blob path belongs to the authenticated user's namespace.

### POST /api/taste-library/upload

Uploads a single image to Vercel Blob.

Request: `{ libraryId: string, photoHash: string, image: string }` (base64, no prefix)

Response: `{ path: string }`

Writes to `taste/{clerkUserId}/{libraryId}/{photoHash}.jpg`. Returns `{ path: string }` for the private Blob path. If the path already exists for the same hash, return the existing path instead of failing.

### POST /api/taste-library/image

Resolves one private Blob image for profile generation or thumbnail display.

Request: `{ path: string }`

Response: `{ image: string }` (base64, no prefix)

Validates that the path belongs to the authenticated user's namespace.

### DELETE /api/taste-library/image

Deletes a blob.

Request: `{ path: string }`

Validates the path belongs to the authenticated user's namespace before deleting.

## UX

### Header Palette Icon

The existing palette icon in the header gains context about the active profile:

- **No profile:** palette icon only (current behavior).
- **One profile:** palette icon + profile name as small label or tooltip.
- **Multiple profiles:** palette icon + active profile name. Click opens the manage modal scoped to the active library.

### Seed/Manage Modal (SeedUploadModal)

Gains a profile switcher at the top:

- **Profile tabs or dropdown:** shows each named profile (up to 3) + "New Profile" button (disabled at 3/3).
- **New Profile flow:** name input (required, max 30 chars) → empty library created → seed upload flow begins.
- **Per-profile view:** that library's favorites grid, profile prose + tags (if generated), regen button, entry count.
- **Rename:** inline edit on the profile name. Saves on blur/enter.
- **Delete:** button with confirmation ("Delete 'Wedding' profile? This removes all favorites and the generated profile."). Deletes blob images. If deleting the active profile, `activeId` falls to the next available or null.
- **View Profile mode:** same as today but scoped to the selected library.

### Cull-Time Profile Picker

When the user clicks Cull and has multiple profiles:

- The intent selector area shows the active profile name with a dropdown to switch.
- Switching here updates `activeId` in the collection (persisted).
- Single-profile users see the profile name but no dropdown — no added friction.
- No-profile users see no picker (current behavior).

### Empty State

If Pro or BYOK with no profiles, the onboarding flow prompts creating a named local profile. The existing "seed your taste profile" copy becomes "Create your first profile" with a name field before the upload step. Free tier keeps today's single unnamed taste library.

## Migration

### v1 → v2 localStorage

On first read of the new `cs-taste-libraries` key, if it doesn't exist but the old `cs-taste-library` key does:

1. Read the v1 `TasteLibrary`.
2. Wrap it: assign `id: crypto.randomUUID()`, `name: "My Profile"`, `version: 2`.
3. Write as `TasteLibraryCollection` with `libraries: [migrated]`, `activeId: migrated.id`.
4. Delete the old `cs-taste-library` key.

### v1 → v2 Clerk metadata

On first `GET /api/taste-library`, if `publicMetadata.tasteProfileManifest` doesn't exist but `publicMetadata.tasteLibrary` does:

1. Read the v1 library.
2. Migrate same as above.
3. Upload inline entry images to private Blob.
4. Write the full v2 collection to `taste/{clerkUserId}/collection.json`.
5. Write `publicMetadata.tasteProfileManifest`.
6. Delete `publicMetadata.tasteLibrary`.

### Image upload on migration

Migrated entries with inline base64 get uploaded to Vercel Blob on first sync. The client detects entries where `image` is base64 (not a Blob path) and uploads them before pushing the sanitized collection.

## Scope Boundaries

- Max 3 profiles per user. Hardcoded limit, not configurable.
- No sharing profiles between users.
- No import/export of profiles (parking lot).
- Corrections are scoped to the profile active at cull time. Each override stores `profileIdAtCull`; profile regen only consumes corrections for that profile by default. Corrections made with no active profile remain global baseline corrections and are not injected into named profile regen unless a later migration assigns them.
- BYOK users get multi-profile locally (localStorage) but no server sync.
- Free tier stays single unnamed library, localStorage-only, no multi-profile.
- Profile names must be unique per user (case-insensitive comparison).

## Error Handling

- Blob upload failure: entry keeps base64 locally, retries before the next server push. Profile generation works from local base64.
- Collection Blob write failure: local state is authoritative for the session. Retry on next mutation. No data loss — the user can keep working.
- Clerk manifest write failure after a successful collection Blob write: retry manifest write on next mutation or login. The collection JSON remains authoritative.
- Private Blob image fetch failure during profile generation: skip that entry, proceed with remaining entries if ≥ 4 have resolvable images. Surface a warning if too many entries fail.
- Multi-device conflict: simple `updatedAt` conflict detection for v1. If the server collection is newer than local when pushing, return `409` with the server collection so the client can replace local state and ask the user to retry the mutation.

## Testing

- Unit: migration v1→v2 (localStorage and Clerk-manifest/Blob paths), collection CRUD (create/rename/delete library, max 3 enforcement), `resolveEntryImage` for base64 and private Blob path entries, profile-scoped correction filtering.
- E2e: create a second profile, switch active profile, cull with profile A then profile B (mocked), verify header shows active name, verify corrections record `profileIdAtCull`, verify delete removes the library.
- Integration: private Blob upload/resolve/delete round-trip and collection JSON write/read round-trip (can be tested against Vercel Blob in dev with a test token).

## Hook and Component Changes

### useTasteLibrary Hook

The hook becomes collection-aware. Its public interface stays similar but operates on the active library:

- `library` → returns the active `TasteLibrary` from the collection (or `emptyLibrary()` if none active).
- `collection` → exposes the full `TasteLibraryCollection` for the modal/picker.
- `setActiveId(id)` → switches the active library.
- `createLibrary(name)` → creates a new empty library, returns its id. Errors if at max 3.
- `renameLibrary(id, name)` → renames a library.
- `deleteLibrary(id)` → deletes a library and its blob images. Updates activeId if needed.
- Existing methods (`toggleFavorite`, `addEntries`, `setProfile`, `setLastRegenAt`) operate on the active library.

All mutations write to localStorage immediately. Pro mutations trigger upload-then-sync in the background. BYOK mutations remain local only.

### ContactSheet

Cull/deep-review logic still reads `tasteLibrary.currentProfile` from the hook, so it receives the active library's profile automatically. Rating override capture must additionally store `profileIdAtCull` so corrections feed the right profile on the next regen.

The cull trigger area gains a profile picker dropdown (only rendered when `collection.libraries.length > 1`).

### SeedUploadModal

Gains the profile tab switcher at the top. The existing favorites grid, upload flow, and profile view are scoped to whichever tab is selected. New Profile / Rename / Delete controls live here.

### Header

The palette icon's tooltip/label updates to show `collection.activeLibrary.name` when one is active.

## Dependencies

- `@vercel/blob` npm package.
- `BLOB_READ_WRITE_TOKEN` env var in Vercel project settings and `.env.local`.
