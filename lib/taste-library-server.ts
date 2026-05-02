import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { emptyLibrary, evictFifo, type TasteLibrary } from "./taste-library";

export async function getTasteLibraryServer(clerkUserId: string): Promise<TasteLibrary> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const stored = user.publicMetadata?.tasteLibrary as TasteLibrary | undefined;
  if (!stored || stored.version !== 1 || !Array.isArray(stored.entries)) return emptyLibrary();
  return stored;
}

export async function setTasteLibraryServer(clerkUserId: string, library: TasteLibrary): Promise<void> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  const next = evictFifo(library);
  await client.users.updateUser(clerkUserId, {
    publicMetadata: { ...user.publicMetadata, tasteLibrary: next },
  });
}
