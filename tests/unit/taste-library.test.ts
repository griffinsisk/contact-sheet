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
