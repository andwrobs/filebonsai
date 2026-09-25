import assert from "node:assert/strict";
import { test } from "node:test";
import { filebonsaiService } from "../../../src/lib/api/filebonsai-service.js";
import { oversizeMessage, settled, TransferStore } from "./transfer-store.js";

async function idle(store: TransferStore) {
  while (store.snapshot().some(item => item.busy)) await new Promise(resolve => setTimeout(resolve, 1));
}
for (const content of ["", "synthetic original"]) test(`uploads exact binary body (${content.length} bytes) with cookies and CSRF`, async () => {
  let state = "INITIATED";
  const service = filebonsaiService({ baseUrl: "http://test", fetch: async request => {
    assert.equal(request.credentials, "include");
    if (request.url.endsWith("csrf")) return Response.json({ token: "test-token" });
    if (request.method !== "GET") assert.equal(request.headers.get("X-CSRF-TOKEN"), "test-token");
    if (request.url.endsWith("/content")) {
      assert.equal(request.headers.get("Content-Type"), "application/octet-stream");
      assert.equal(await request.text(), content); state = "STAGED";
    } else if (request.url.endsWith("/complete")) state = "AVAILABLE";
    else if (request.method === "POST") assert.equal((await request.json()).sizeBytes, String(content.length));
    return Response.json({ id: "upload", state });
  } });
  const store = new TransferStore(service);
  store.add(new File([content], "test.txt"), "folder"); await idle(store);
  assert.equal(store.snapshot()[0]?.upload?.state, "AVAILABLE");
});

test("lost begin and completion replies reuse intent and never resend accepted bytes", async () => {
  let state = "INITIATED", begins = 0, bodies = 0;
  const keys: (string | null)[] = [];
  const store = new TransferStore(filebonsaiService({ baseUrl: "http://test", fetch: async request => {
    if (request.url.endsWith("csrf")) return Response.json({ token: "token" });
    if (request.url.endsWith("/uploads")) {
      keys.push(request.headers.get("Idempotency-Key"));
      if (++begins === 1) throw new TypeError("lost response");
    }
    if (request.url.endsWith("/content")) { bodies++; state = "STAGED"; }
    if (request.url.endsWith("/complete")) { state = "RECONCILING"; throw new TypeError("lost response"); }
    return Response.json({ id: "upload", state });
  } }));
  const key = store.add(new File(["body"], "test.txt"), "folder"); await idle(store);
  await store.run(key, "continue");
  await store.run(key, "continue");
  assert.equal(keys[0], keys[1]); assert.equal(bodies, 1);
  assert.equal(store.snapshot()[0]?.upload?.state, "RECONCILING");
  state = "AVAILABLE"; await store.run(key, "check");
  assert.equal(store.snapshot()[0]?.upload?.state, "AVAILABLE");
});

test("interrupted body retries from zero and cancellation is confirmed by server", async () => {
  let bodies = 0, state = "INITIATED";
  const store = new TransferStore(filebonsaiService({ baseUrl: "http://test", fetch: async request => {
    if (request.url.endsWith("csrf")) return Response.json({ token: "token" });
    if (request.url.endsWith("content")) { bodies++; assert.equal(await request.text(), "whole body"); throw new TypeError("interrupted"); }
    if (request.method === "DELETE") state = "CANCELLED";
    return Response.json({ id: "upload", state });
  } }));
  const key = store.add(new File(["whole body"], "test.txt"), "folder"); await idle(store);
  await store.run(key, "continue"); assert.equal(bodies, 2);
  await store.run(key, "cancel"); assert.equal(store.snapshot()[0]?.upload?.state, "CANCELLED");
});

test("refuses files over the server limit before beginUpload, confirming only refusals", async () => {
  let limitReads = 0;
  const begun: string[] = [];
  const store = new TransferStore(filebonsaiService({ baseUrl: "http://test", fetch: async request => {
    if (request.url.endsWith("csrf")) return Response.json({ token: "token" });
    if (request.url.endsWith("/upload-limits")) { limitReads++; return Response.json({ maximumBytes: "4" }); }
    if (request.url.endsWith("/uploads")) begun.push((await request.json()).name);
    const state = request.url.endsWith("/complete") ? "AVAILABLE" : request.url.endsWith("/content") ? "STAGED" : "INITIATED";
    return Response.json({ id: "upload", state });
  } }));
  const over = store.add(new File(["12345"], "over.bin"), "folder");
  store.add(new File(["1234"], "exact.bin"), "folder");
  await idle(store);
  const [refused, exact] = store.snapshot();
  assert.equal(refused?.refused, true);
  assert.equal(refused?.upload, undefined);
  assert.equal(refused?.message, "Too large to upload: 5 B is over the 4 B limit. Nothing was sent.");
  assert.ok(refused && settled(refused));
  assert.equal(exact?.upload?.state, "AVAILABLE");
  await store.run(over, "continue");
  assert.deepEqual(begun, ["exact.bin"]);
  // One shared read for both files, plus one fresh read confirming the refusal.
  assert.equal(limitReads, 2);
});

function limitScenario(limits: string[]) {
  const counts = { reads: 0, begins: 0 };
  let serverLimit = 0n;
  const store = new TransferStore(filebonsaiService({ baseUrl: "http://test", fetch: async request => {
    if (request.url.endsWith("csrf")) return Response.json({ token: "token" });
    if (request.url.endsWith("/upload-limits")) {
      const maximumBytes = limits[Math.min(counts.reads++, limits.length - 1)]!;
      serverLimit = BigInt(maximumBytes);
      return Response.json({ maximumBytes });
    }
    if (request.url.endsWith("/uploads")) {
      counts.begins++;
      if (BigInt((await request.json()).sizeBytes) > serverLimit) return Response.json({ code: "TOO_LARGE" }, { status: 413 });
    }
    const state = request.url.endsWith("/complete") ? "AVAILABLE" : request.url.endsWith("/content") ? "STAGED" : "INITIATED";
    return Response.json({ id: "upload", state });
  } }));
  return { store, counts, lower: (limit: string) => { serverLimit = BigInt(limit); } };
}

test("a 413 after a stale cached limit reads the limit again", async () => {
  const { store, counts, lower } = limitScenario(["10", "4"]);
  store.add(new File(["123"], "first.bin"), "folder"); await idle(store);
  assert.equal(counts.reads, 1);
  lower("4");
  const key = store.add(new File(["12345"], "second.bin"), "folder"); await idle(store);
  assert.equal(counts.begins, 2);
  assert.equal(store.snapshot()[1]?.refused, undefined);
  await store.run(key, "continue");
  assert.equal(counts.begins, 2);
  assert.equal(store.snapshot()[1]?.refused, true);
});

test("a raised limit is honoured instead of a stale cached refusal", async () => {
  const { store, counts } = limitScenario(["4", "8"]);
  store.add(new File(["12345"], "grown.bin"), "folder"); await idle(store);
  assert.equal(counts.reads, 2);
  assert.equal(store.snapshot()[0]?.refused, undefined);
  assert.equal(store.snapshot()[0]?.upload?.state, "AVAILABLE");
});

test("an unknown limit defers to the server", async () => {
  let limit: string | undefined;
  let begins = 0;
  const store = new TransferStore(filebonsaiService({ baseUrl: "http://test", fetch: async request => {
    if (request.url.endsWith("csrf")) return Response.json({ token: "token" });
    if (request.url.endsWith("/upload-limits")) {
      return limit ? Response.json({ maximumBytes: limit }) : Response.json({ code: "STORAGE_UNAVAILABLE" }, { status: 503 });
    }
    begins++;
    return Response.json({ code: "TOO_LARGE", message: "Upload exceeds the configured size limit" }, { status: 413 });
  } }));
  const key = store.add(new File(["12345"], "big.bin"), "folder"); await idle(store);
  assert.equal(begins, 1);
  assert.equal(store.snapshot()[0]?.refused, undefined);
  limit = "4";
  await store.run(key, "continue");
  assert.equal(begins, 1);
  assert.equal(store.snapshot()[0]?.refused, true);
});

test("oversize messages fall back to exact bytes when rounded sizes match", () => {
  const limit = 128n * 1024n * 1024n;
  assert.equal(oversizeMessage(2n * 1024n * 1024n * 1024n, limit),
    "Too large to upload: 2 GB is over the 128 MB limit. Nothing was sent.");
  assert.equal(oversizeMessage(limit + 1n, limit),
    `Too large to upload: ${(limit + 1n).toLocaleString()} bytes is over the ${limit.toLocaleString()} bytes limit. Nothing was sent.`);
});

test("download returns original bytes and preserves HTTP failure", async () => {
  let fail = false;
  const service = filebonsaiService({ baseUrl: "http://test", fetch: async request => {
    assert.equal(request.url, "http://test/api/v1/entries/file/content");
    assert.equal(request.credentials, "include");
    return fail ? Response.json({ code: "ENTRY_NOT_FOUND" }, { status: 404 }) : new Response("original");
  } });
  assert.equal(await (await service.downloadOriginal("file")).data?.text(), "original");
  fail = true; assert.equal((await service.downloadOriginal("file")).response.status, 404);
});

test("cancellation fences a pending PUT and refreshes a rotated CSRF token", async () => {
  let state = "INITIATED", token = "first";
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let receiving!: () => void;
  const received = new Promise<void>(resolve => { receiving = resolve; });
  const store = new TransferStore(filebonsaiService({ baseUrl: "http://test", fetch: async request => {
    if (request.url.endsWith("csrf")) return Response.json({ token });
    if (request.method !== "GET") assert.equal(request.headers.get("X-CSRF-TOKEN"), token);
    if (request.url.endsWith("content")) { state = "RECEIVING"; receiving(); await pending; return Response.json({ id: "upload", state: "STAGED" }); }
    assert.ok(!request.url.endsWith("complete"), "cancelled body must not complete");
    if (request.method === "DELETE") state = "CANCELLED";
    return Response.json({ id: "upload", state });
  } }));
  const key = store.add(new File(["body"], "test.txt"), "folder");
  await received; token = "rotated";
  await store.run(key, "cancel");
  release(); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(store.snapshot()[0]?.upload?.state, "CANCELLED");
});
