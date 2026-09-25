import assert from "node:assert/strict";
import { test } from "node:test";

import { filebonsaiService } from "./filebonsai-service.js";

const baseUrl = "http://filebonsai.test";
const rootId = "00000000-0000-4000-8000-000000000001";

test("uses generated catalog paths, parameters, and cookie credentials", async () => {
  const requests: Request[] = [];
  const service = filebonsaiService({
    baseUrl,
    fetch: async (request) => {
      requests.push(request);
      return Response.json({
        entries: [],
        nextCursor: null,
      });
    },
  });

  await service.listChildren(rootId, { cursor: "next page", limit: 25 });

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    `${baseUrl}/api/v1/entries/${rootId}/children?cursor=next%20page&limit=25`,
  );
  assert.equal(requests[0]?.method, "GET");
  assert.equal(requests[0]?.credentials, "include");
});

test("decodes the generated workspace-root folder response", async () => {
  const requests: Request[] = [];
  const service = filebonsaiService({
    baseUrl,
    fetch: async (request) => {
      requests.push(request);
      return Response.json({
        createdAt: "2026-01-01T00:00:00Z",
        id: rootId,
        kind: "folder",
        name: "Library",
        parentId: null,
        updatedAt: "2026-01-01T00:00:00Z",
      });
    },
  });

  const result = await service.getWorkspaceRoot();

  assert.equal(requests[0]?.url, `${baseUrl}/api/v1/catalog/root`);
  assert.equal(requests[0]?.credentials, "include");
  assert.equal(result.data?.kind, "folder");
  if (result.data?.kind === "folder") {
    assert.equal(result.data.id, rootId);
    assert.equal(result.data.parentId, null);
    assert.equal(result.data.createdAt, "2026-01-01T00:00:00Z");
    assert.equal(result.data.updatedAt, "2026-01-01T00:00:00Z");
  }
});

test("refreshes CSRF after login and sends typed mutation headers and bodies", async () => {
  const requests: Request[] = [];
  let csrfCount = 0;
  const service = filebonsaiService({
    baseUrl,
    fetch: async (request) => {
      requests.push(request);
      const url = new URL(request.url);
      if (url.pathname === "/api/v1/auth/csrf") {
        csrfCount += 1;
        return Response.json({
          headerName: "X-CSRF-TOKEN",
          token: `csrf-${csrfCount}`,
        });
      }
      if (url.pathname === "/api/v1/auth/login") {
        return Response.json({
          expiresAt: "2026-09-21T00:00:00Z",
          principalId: "20000000-0000-4000-8000-000000000001",
        });
      }
      return Response.json(
        {
          createdAt: "2026-09-20T00:00:00Z",
          id: "00000000-0000-4000-8000-000000000002",
          kind: "folder",
          name: "Photos",
          parentId: rootId,
          updatedAt: "2026-09-20T00:00:00Z",
        },
        { status: 201 },
      );
    },
  });

  await service.login("correct horse battery staple");
  await service.createFolder({
    idempotencyKey: "50000000-0000-4000-8000-000000000001",
    name: "Photos",
    parentId: rootId,
  });

  assert.equal(requests.length, 4);
  assert.equal(requests[1]?.headers.get("X-CSRF-TOKEN"), "csrf-1");
  assert.deepEqual(await requests[1]?.clone().json(), {
    password: "correct horse battery staple",
  });
  assert.equal(requests[3]?.headers.get("X-CSRF-TOKEN"), "csrf-2");
  assert.equal(
    requests[3]?.headers.get("Idempotency-Key"),
    "50000000-0000-4000-8000-000000000001",
  );
  assert.deepEqual(await requests[3]?.clone().json(), {
    name: "Photos",
    parentId: rootId,
  });
});

test("refreshes CSRF before each explicit sign-in attempt", async () => {
  const tokens: string[] = [];
  let csrfCount = 0;
  const service = filebonsaiService({
    baseUrl,
    fetch: async (request) => {
      if (request.url.endsWith("/csrf")) {
        csrfCount += 1;
        return Response.json({ headerName: "X-CSRF-TOKEN", token: `csrf-${csrfCount}` });
      }
      tokens.push(request.headers.get("X-CSRF-TOKEN") ?? "");
      return Response.json({ code: "INVALID_CREDENTIALS", message: "Request could not be processed", status: 401 }, { status: 401 });
    },
  });

  await service.login("incorrect password");
  await service.login("incorrect password");

  assert.deepEqual(tokens, ["csrf-1", "csrf-2"]);
});

test("reuses a CSRF token until a successful session transition", async () => {
  const requests: Request[] = [];
  const service = filebonsaiService({
    baseUrl,
    fetch: async (request) => {
      requests.push(request);
      if (request.url.endsWith("/api/v1/auth/csrf")) {
        return Response.json({ headerName: "X-CSRF-TOKEN", token: "csrf-current" });
      }
      return new Response(null, { status: 204 });
    },
  });

  await service.refreshCsrf();
  await service.logout();

  assert.equal(requests.length, 2);
  assert.equal(requests[1]?.headers.get("X-CSRF-TOKEN"), "csrf-current");
  assert.equal(requests[1]?.credentials, "include");
});

test("decodes catalog discriminators, nullable cursors, timestamps, and exact byte strings", async () => {
  const service = filebonsaiService({
    baseUrl,
    fetch: async (request) => {
      if (request.url.endsWith("/children")) {
        return Response.json({
          entries: [
            {
              createdAt: "2026-09-20T12:34:56.123456Z",
              id: rootId,
              kind: "folder",
              name: "Library",
              parentId: null,
              updatedAt: "2026-09-20T12:34:56.123456Z",
            },
          ],
          nextCursor: null,
        });
      }
      return Response.json({
        createdAt: "2026-09-20T12:34:56Z",
        currentVersion: {
          id: "30000000-0000-4000-8000-000000000001",
          sizeBytes: "9007199254740993",
        },
        id: "00000000-0000-4000-8000-000000000003",
        kind: "file",
        name: "large.bin",
        parentId: rootId,
        updatedAt: "2026-09-20T12:34:57Z",
      });
    },
  });

  const fileResult = await service.getEntry("00000000-0000-4000-8000-000000000003");
  assert.equal(fileResult.data?.kind, "file");
  if (fileResult.data?.kind === "file") {
    assert.equal(fileResult.data.currentVersion.sizeBytes, "9007199254740993");
    assert.equal(fileResult.data.createdAt, "2026-09-20T12:34:56Z");
  }

  const pageResult = await service.listChildren(rootId);
  assert.equal(pageResult.data?.nextCursor, null);
  assert.equal(pageResult.data?.entries[0]?.kind, "folder");
  if (pageResult.data?.entries[0]?.kind === "folder") {
    assert.equal(pageResult.data.entries[0].parentId, null);
  }
});

test("preserves unknown API error codes, field errors, and retry metadata", async () => {
  const service = filebonsaiService({
    baseUrl,
    fetch: async (request) => {
      if (request.url.endsWith("/csrf")) {
        return Response.json({ headerName: "X-CSRF-TOKEN", token: "csrf-rate-limit" });
      }
      return Response.json(
        {
          code: "FUTURE_RATE_POLICY",
          fieldErrors: [
            {
              code: "FUTURE_PASSWORD_RULE",
              field: "password",
              message: "Request could not be processed",
            },
          ],
          message: "Request could not be processed",
          requestId: "request-123",
          status: 429,
        },
        {
          headers: { "Retry-After": "900" },
          status: 429,
        },
      );
    },
  });

  const result = await service.login("wrong password");

  assert.equal(result.error?.code, "FUTURE_RATE_POLICY");
  assert.equal(result.error?.fieldErrors[0]?.code, "FUTURE_PASSWORD_RULE");
  assert.equal(result.response.headers.get("Retry-After"), "900");
});
