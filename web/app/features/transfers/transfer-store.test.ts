import assert from "node:assert/strict";
import { test } from "node:test";
import { filebonsaiService } from "../../../src/lib/api/filebonsai-service.js";
import { TransferStore } from "./transfer-store.js";

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
