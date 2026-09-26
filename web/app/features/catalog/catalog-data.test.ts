import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogHref, entryKind, entryMeta, formatBytes, formatModified, uniqueEntries } from "./catalog-data.js";

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
});

const now = new Date("2026-09-25T15:00:00Z");

test("modified labels shorten with recency", () => {
  const label = (iso: string) => formatModified(iso, now, "en-US", "UTC");
  assert.equal(label("2026-09-25T09:05:00Z"), "9:05 AM");
  assert.equal(label("2026-09-24T23:59:00Z"), "Yesterday");
  assert.equal(label("2026-08-28T12:00:00Z"), "Aug 28");
  assert.equal(label("2025-12-31T12:00:00Z"), "Dec 31, 2025");
});

test("compact meta leads with size for files and kind for folders", () => {
  const file = {
    ...folder, kind: "file" as const, name: "IMG_8421.JPG", parentId: folder.id, updatedAt: "2026-08-28T12:00:00Z",
    currentVersion: { id: "00000000-0000-4000-8000-000000000002", sizeBytes: "5505024" },
  };
  assert.equal(entryMeta(folder, now, "en-US", "UTC"), "Folder · Sep 21");
  assert.equal(entryMeta(file, now, "en-US", "UTC"), "5.2 MB · Aug 28");
});

test("kinds come from the extension and never from a leading dot or an unknown suffix", () => {
  const kind = (name: string) => entryKind({ kind: "file", name }).label;
  assert.equal(entryKind(folder).label, "Folder");
  assert.equal(kind("IMG_8421.JPG"), "Image");
  assert.equal(kind("Italy Itinerary.pdf"), "PDF");
  assert.equal(kind("archive.tar.gz"), "Archive");
  assert.equal(kind(".env"), "File");
  assert.equal(kind("README"), "File");
  assert.equal(kind("notes.unknown"), "File");
});
