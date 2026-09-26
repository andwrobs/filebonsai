import assert from "node:assert/strict";
import { test } from "node:test";

import { filebonsaiService } from "../../../src/lib/api/filebonsai-service.js";
import { capabilityRows, loadStorage, providerLabel, storageFailure } from "./storage-data.js";

const summary = {
  connection: { displayName: "Family archive", providerKind: "local" },
  capabilities: { sha256Verification: true, resumableUploads: false, rangeDownloads: false },
  usedBytes: "9007199254740993",
};

function service(respond: (path: string) => Response | Promise<Response>) {
  return filebonsaiService({ baseUrl: "http://test", fetch: async request => {
    assert.equal(request.credentials, "include");
    return respond(new URL(request.url).pathname);
  } });
}

test("loads the summary and the upload limit together", async () => {
  const result = await loadStorage(service(path => path.endsWith("/storage")
    ? Response.json(summary)
    : Response.json({ maximumBytes: "134217728" })));
  assert.deepEqual(result, { status: "ready", summary, maximumBytes: "134217728" });
});

test("still describes the connection when only the limit read fails", async () => {
  for (const failLimit of [
    () => { throw new TypeError("connection lost"); },
    () => Response.json({ code: "INTERNAL_ERROR", message: "Request could not be processed", status: 500, requestId: "r", fieldErrors: [] }, { status: 500 }),
  ]) {
    const result = await loadStorage(service(path => path.endsWith("/storage") ? Response.json(summary) : failLimit()));
    assert.equal(result.status, "ready");
    assert.equal(result.status === "ready" && result.maximumBytes, null);
  }
});

test("sends a signed-out visitor to sign in and reports unreachable or failing servers", async () => {
  assert.deepEqual(await loadStorage(service(() => Response.json({ code: "AUTH_REQUIRED" }, { status: 401 }))), { status: "sign-in" });
  const unreachable = await loadStorage(service(() => { throw new TypeError("offline"); }));
  assert.equal(unreachable.status === "failed" && unreachable.failure.kind, "unavailable");
  const failing = await loadStorage(service(() => Response.json(
    { code: "INTERNAL_ERROR", message: "Request could not be processed", status: 500, requestId: "req-2", fieldErrors: [] },
    { status: 500 })));
  assert.equal(failing.status === "failed" && failing.failure.kind, "error");
  assert.equal(failing.status === "failed" && failing.failure.requestId, "req-2");
});

test("labels known providers and shows unknown provider kinds as sent", () => {
  assert.equal(providerLabel("local"), "Local disk on the server");
  assert.equal(providerLabel("r2"), "Cloudflare R2");
  assert.equal(providerLabel("future-provider"), "future-provider");
});

test("describes each capability in words, not only as a flag", () => {
  const rows = capabilityRows({
    connection: { displayName: "Local disk", providerKind: "local" },
    capabilities: { sha256Verification: true, resumableUploads: false, rangeDownloads: false },
    usedBytes: "0",
  });
  assert.deepEqual(rows.map(row => [row.label, row.enabled]), [
    ["Verified uploads", true],
    ["Resumable uploads", false],
    ["Partial downloads", false],
  ]);
  assert.equal(rows[1]?.detail, "An interrupted upload is sent again from byte zero.");
});

test("separates an unreachable server from an API error", () => {
  assert.equal(storageFailure(undefined).kind, "unavailable");
  assert.equal(storageFailure(503, { code: "STORAGE_UNAVAILABLE", message: "busy", status: 503, requestId: "r", fieldErrors: [] }).kind, "unavailable");
  assert.equal(storageFailure(500).kind, "unavailable");
  assert.deepEqual(storageFailure(500, { code: "INTERNAL_ERROR", message: "Request could not be processed", status: 500, requestId: "req-1", fieldErrors: [] }), {
    kind: "error",
    message: "Request could not be processed",
    requestId: "req-1",
  });
});
