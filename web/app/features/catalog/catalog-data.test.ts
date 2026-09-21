import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogHref, entryMeta, formatBytes, uniqueEntries } from "./catalog-data.js";

const folder = {
  createdAt: "2026-09-21T00:00:00Z",
  id: "00000000-0000-4000-8000-000000000001",
  kind: "folder" as const,
  name: "Library",
  parentId: null,
  updatedAt: "2026-09-21T00:00:00Z",
};

test("catalog helpers retain UUID URLs and deduplicate repeated cursor entries", () => {
  assert.equal(catalogHref(folder.id), "/library/00000000-0000-4000-8000-000000000001");
  assert.deepEqual(uniqueEntries([folder, folder]), [folder]);
});

test("catalog helpers format exact byte strings without coercing the stored value", () => {
  assert.equal(formatBytes("0"), "0 B");
  assert.equal(formatBytes("1536"), "1.5 KB");
  assert.equal(formatBytes("9007199254740993"), "8 PB");
  assert.equal(entryMeta(folder), "Folder");
});
