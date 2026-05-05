import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { emptyLibrary, evictFifo, getActiveLibrary, migrateLegacyLibrary, type LegacyTasteLibrary, type TasteLibrary } from "./taste-library";

export async function getTasteLibraryServer(clerkUserId: string): Promise<TasteLibrary> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const stored = user.publicMetadata?.tasteLibrary as TasteLibrary | LegacyTasteLibrary | undefined;
  if (!stored || !Array.isArray(stored.entries)) return emptyLibrary();
  if (stored.version === 2) return stored;
  if (stored.version === 1) return getActiveLibrary(migrateLegacyLibrary(stored));
  return emptyLibrary();
}

export async function setTasteLibraryServer(clerkUserId: string, library: TasteLibrary): Promise<void> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const next = evictFifo(library);
  await client.users.updateUser(clerkUserId, {
    publicMetadata: { ...user.publicMetadata, tasteLibrary: next },
  });
}
