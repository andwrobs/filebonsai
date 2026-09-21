import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { ApiErrorResponseFromJSON } from "../../clients/typescript/models/ApiErrorResponse";
import { AccessSessionResponseFromJSON } from "../../clients/typescript/models/AccessSessionResponse";
import { EntryPageResponseFromJSON } from "../../clients/typescript/models/EntryPageResponse";
import { EntryResponseFromJSON } from "../../clients/typescript/models/EntryResponse";
import { FileEntryResponseFromJSON } from "../../clients/typescript/models/FileEntryResponse";
import { FolderEntryResponseFromJSON } from "../../clients/typescript/models/FolderEntryResponse";
import { UploadResponseFromJSON } from "../../clients/typescript/models/UploadResponse";

function fixture(name: string): unknown {
  const file = path.resolve(process.cwd(), "../../contract/fixtures", `${name}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

test("decodes file precision and root nullability", () => {
  const file = FileEntryResponseFromJSON(fixture("file"));
  const root = FolderEntryResponseFromJSON(fixture("root"));

  assert.equal(file.kind, "file");
  assert.equal(file.currentVersion.sizeBytes, "9007199254740993");
  assert.ok(file.createdAt instanceof Date);
  assert.equal(root.kind, "folder");
  assert.equal(root.parentId, null);
});

test("decodes discriminated pages and empty pages", () => {
  const page = EntryPageResponseFromJSON(fixture("page"));
  const emptyPage = EntryPageResponseFromJSON(fixture("empty-page"));

  assert.equal(page.entries.length, 1);
  assert.equal(page.entries[0].kind, "file");
  assert.equal(emptyPage.entries.length, 0);
  assert.equal(emptyPage.nextCursor, null);
});

test("preserves future error codes and ignores additive fields", () => {
  const error = ApiErrorResponseFromJSON(fixture("future-error"));

  assert.equal(error.code, "FUTURE_SERVER_ERROR");
  assert.equal("newField" in error, false);
});

test("does not mistake an unknown discriminator for a known entry", () => {
  const decoded = EntryResponseFromJSON({ kind: "future", id: "opaque" }) as unknown as Record<
    string,
    unknown
  >;

  assert.equal(decoded.kind, "future");
  assert.notEqual(decoded.kind, "file");
  assert.notEqual(decoded.kind, "folder");
});

test("decodes an authenticated session expiry", () => {
  const session = AccessSessionResponseFromJSON({
    principalId: "20000000-0000-4000-8000-000000000001",
    expiresAt: "2026-09-20T18:00:00.123456Z",
  });

  assert.equal(session.principalId, "20000000-0000-4000-8000-000000000001");
  assert.ok(session.expiresAt instanceof Date);
});

test("decodes durable upload state with exact decimal byte counts", () => {
  const upload = UploadResponseFromJSON({
    id: "50000000-0000-4000-8000-000000000001",
    entryId: "00000000-0000-4000-8000-000000000010",
    versionId: "30000000-0000-4000-8000-000000000010",
    parentId: "00000000-0000-4000-8000-000000000001",
    name: "upload.bin",
    sizeBytes: "9007199254740993",
    expectedSha256: null,
    computedSha256: null,
    state: "INITIATED",
    expiresAt: "2026-09-21T18:00:00.123456Z",
  });

  assert.equal(upload.sizeBytes, "9007199254740993");
  assert.equal(upload.expectedSha256, null);
  assert.equal(upload.state, "INITIATED");
  assert.ok(upload.expiresAt instanceof Date);
});
