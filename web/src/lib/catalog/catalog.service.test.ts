import { expect, it } from "vitest";
import { ApiError, createApiClient } from "~/lib/api/api";
import { NotAFolderError } from "./catalog";
import { createCatalogService } from "./catalog.service";

const baseUrl = "http://filebonsai.test";
const rootId = "00000000-0000-4000-8000-000000000001";

function service(respond: (request: Request) => Response | Promise<Response>) {
	const requests: Request[] = [];
	const catalog = createCatalogService({
		api: createApiClient({
			baseUrl,
			fetch: async (request) => {
				requests.push(request);
				return respond(request);
			},
		}),
	});
	return { catalog, requests };
}

const folder = {
	createdAt: "2026-09-20T12:34:56.123456Z",
	id: rootId,
	kind: "folder",
	name: "Library",
	parentId: null,
	updatedAt: "2026-09-20T12:34:56.123456Z",
};

const file = {
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
};

it("uses generated catalog paths, parameters, and cookie credentials", async () => {
	const { catalog, requests } = service(() =>
		Response.json({ entries: [], nextCursor: null }),
	);
	await catalog.children(rootId, { cursor: "next page", limit: 25 });
	expect(requests).toHaveLength(1);
	expect(requests[0]?.url).toBe(
		`${baseUrl}/api/v1/entries/${rootId}/children?cursor=next%20page&limit=25`,
	);
	expect(requests[0]?.method).toBe("GET");
	expect(requests[0]?.credentials).toBe("include");
});

it("decodes the workspace root, discriminators, nullable cursors, and exact byte strings", async () => {
	const { catalog, requests } = service((request) => {
		if (request.url.endsWith("/catalog/root")) return Response.json(folder);
		if (request.url.endsWith("/children")) {
			return Response.json({ entries: [folder], nextCursor: null });
		}
		return Response.json(file);
	});

	const root = await catalog.workspaceRoot();
	expect(requests[0]?.url).toBe(`${baseUrl}/api/v1/catalog/root`);
	expect([root.kind, root.id, root.parentId]).toEqual(["folder", rootId, null]);

	const found = await catalog.entry(file.id);
	expect(found.kind).toBe("file");
	if (found.kind === "file") {
		expect(found.currentVersion.sizeBytes).toBe("9007199254740993");
	}

	const page = await catalog.children(rootId);
	expect(page.nextCursor).toBeNull();
	expect(page.entries[0]?.kind).toBe("folder");
});

it("lists a folder with deduplicated children and refuses a file", async () => {
	let target: object = folder;
	const { catalog } = service((request) =>
		request.url.endsWith("/children")
			? Response.json({ entries: [file, file], nextCursor: "more" })
			: Response.json(target),
	);
	const listing = await catalog.folder(rootId);
	expect(listing.folder.id).toBe(rootId);
	expect(listing.children).toHaveLength(1);
	expect(listing.nextCursor).toBe("more");

	target = file;
	await expect(catalog.folder(file.id)).rejects.toBeInstanceOf(NotAFolderError);
});

it("sends CSRF and the caller's idempotency key when creating a folder", async () => {
	const { catalog, requests } = service((request) =>
		request.url.endsWith("/csrf")
			? Response.json({ headerName: "X-CSRF-TOKEN", token: "csrf-1" })
			: Response.json({ ...folder, name: "Photos" }, { status: 201 }),
	);
	const created = await catalog.createFolder({
		idempotencyKey: "50000000-0000-4000-8000-000000000001",
		name: "Photos",
		parentId: rootId,
	});
	expect(created.name).toBe("Photos");
	const post = requests[1];
	expect(post?.headers.get("X-CSRF-TOKEN")).toBe("csrf-1");
	expect(post?.headers.get("Idempotency-Key")).toBe(
		"50000000-0000-4000-8000-000000000001",
	);
	expect(await post?.clone().json()).toEqual({
		name: "Photos",
		parentId: rootId,
	});
});

it("returns original bytes and preserves an HTTP failure", async () => {
	let fail = false;
	const { catalog, requests } = service(() =>
		fail
			? Response.json({ code: "ENTRY_NOT_FOUND" }, { status: 404 })
			: new Response("original"),
	);
	expect(await (await catalog.downloadOriginal("file")).text()).toBe(
		"original",
	);
	expect(requests[0]?.url).toBe(`${baseUrl}/api/v1/entries/file/content`);
	expect(requests[0]?.credentials).toBe("include");
	fail = true;
	const error = await catalog.downloadOriginal("file").catch((e) => e);
	expect(error).toBeInstanceOf(ApiError);
	expect([error.status, error.body?.code]).toEqual([404, "ENTRY_NOT_FOUND"]);
});
