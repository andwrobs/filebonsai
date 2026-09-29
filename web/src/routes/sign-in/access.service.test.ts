import { expect, it } from "vitest";
import { ApiError, createApiClient } from "~/lib/api/api";
import { createCatalogService } from "~/lib/catalog/catalog.service";
import { createAccessService } from "./access.service";

const baseUrl = "http://filebonsai.test";
const rootId = "00000000-0000-4000-8000-000000000001";

function services(respond: (request: Request) => Response) {
	const requests: Request[] = [];
	let csrfCount = 0;
	const api = createApiClient({
		baseUrl,
		fetch: async (request) => {
			requests.push(request);
			if (request.url.endsWith("/api/v1/auth/csrf")) {
				return Response.json({
					headerName: "X-CSRF-TOKEN",
					token: `csrf-${++csrfCount}`,
				});
			}
			return respond(request);
		},
	});
	return {
		access: createAccessService({ api }),
		catalog: createCatalogService({ api }),
		requests,
	};
}

it("reads a new CSRF token after sign-in before the next change", async () => {
	const { access, catalog, requests } = services((request) =>
		request.url.endsWith("/login")
			? Response.json({
					expiresAt: "2026-09-21T00:00:00Z",
					principalId: "20000000-0000-4000-8000-000000000001",
				})
			: Response.json(
					{
						createdAt: "2026-09-20T00:00:00Z",
						id: "00000000-0000-4000-8000-000000000002",
						kind: "folder",
						name: "Photos",
						parentId: rootId,
						updatedAt: "2026-09-20T00:00:00Z",
					},
					{ status: 201 },
				),
	);

	await access.login("correct horse battery staple");
	await catalog.createFolder({
		idempotencyKey: "50000000-0000-4000-8000-000000000001",
		name: "Photos",
		parentId: rootId,
	});

	expect(requests).toHaveLength(4);
	expect(requests[1]?.headers.get("X-CSRF-TOKEN")).toBe("csrf-1");
	expect(await requests[1]?.clone().json()).toEqual({
		password: "correct horse battery staple",
	});
	expect(requests[3]?.headers.get("X-CSRF-TOKEN")).toBe("csrf-2");
});

it("reads a new CSRF token before each sign-in attempt", async () => {
	const tokens: string[] = [];
	const { access } = services((request) => {
		tokens.push(request.headers.get("X-CSRF-TOKEN") ?? "");
		return Response.json(
			{
				code: "INVALID_CREDENTIALS",
				message: "Request could not be processed",
				status: 401,
			},
			{ status: 401 },
		);
	});
	for (const _ of [1, 2]) {
		const error = await access.login("incorrect password").catch((e) => e);
		expect(error).toBeInstanceOf(ApiError);
		expect(error.status).toBe(401);
	}
	expect(tokens).toEqual(["csrf-1", "csrf-2"]);
});

it("signs out with the held token and cookie credentials", async () => {
	const { access, requests } = services(
		() => new Response(null, { status: 204 }),
	);
	await access.logout();
	expect(requests).toHaveLength(2);
	expect(requests[1]?.headers.get("X-CSRF-TOKEN")).toBe("csrf-1");
	expect(requests[1]?.credentials).toBe("include");
});
