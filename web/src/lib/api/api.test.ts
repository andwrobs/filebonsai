import { expect, it } from "vitest";
import { ApiError, createApiClient, isTransient, unwrap } from "./api";

const baseUrl = "http://filebonsai.test";

function client(respond: (request: Request) => Response | Promise<Response>) {
	const requests: Request[] = [];
	const api = createApiClient({
		baseUrl,
		fetch: async (request) => {
			requests.push(request);
			return respond(request);
		},
	});
	return { api, requests };
}

async function failure(promise: Promise<unknown>) {
	const error = await promise.catch((caught: unknown) => caught);
	expect(error).toBeInstanceOf(ApiError);
	return error as ApiError;
}

it("reuses a CSRF token until it's refreshed or forgotten", async () => {
	let count = 0;
	const { api, requests } = client(() =>
		Response.json({ headerName: "X-CSRF-TOKEN", token: `csrf-${++count}` }),
	);
	expect(await api.csrfToken()).toBe("csrf-1");
	expect(await api.csrfToken()).toBe("csrf-1");
	expect(await api.refreshCsrf()).toBe("csrf-2");
	expect(await api.csrfToken()).toBe("csrf-2");
	api.forgetCsrf();
	expect(await api.csrfToken()).toBe("csrf-3");
	expect(requests.map((request) => request.credentials)).toEqual([
		"include",
		"include",
		"include",
	]);
});

it("tells network, HTTP, and invalid-response failures apart", async () => {
	const network = client(() => {
		throw new TypeError("Failed to fetch");
	});
	expect((await failure(network.api.csrfToken())).kind).toBe("network");

	const http = client(() =>
		Response.json({ message: "Nope" }, { status: 503 }),
	);
	const error = await failure(http.api.csrfToken());
	expect([error.kind, error.status, error.body]).toEqual([
		"http",
		503,
		undefined,
	]);
	expect(error.message).toBe("Request failed (503).");
	expect(isTransient(error)).toBe(true);

	const invalid = client(() => new Response("<html>not json</html>"));
	expect((await failure(invalid.api.csrfToken())).kind).toBe(
		"invalid-response",
	);
});

it("preserves unknown API error codes, field errors, and the request ID", async () => {
	const { api } = client(() =>
		Response.json(
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
			{ status: 429 },
		),
	);
	const error = await failure(api.csrfToken());
	expect(error.status).toBe(429);
	expect(error.message).toBe("Request could not be processed");
	expect(error.body?.code).toBe("FUTURE_RATE_POLICY");
	expect(error.body?.fieldErrors[0]?.code).toBe("FUTURE_PASSWORD_RULE");
	expect(error.body?.requestId).toBe("request-123");
	expect(isTransient(error)).toBe(false);
});

it("lets aborts through for Query to handle", async () => {
	const { api } = client(() => {
		throw new DOMException("Aborted", "AbortError");
	});
	const error = await api.csrfToken().catch((caught) => caught);
	expect(error).not.toBeInstanceOf(ApiError);
	expect(error.name).toBe("AbortError");
});

it("resolves an empty success to undefined", async () => {
	const { api } = client(() => new Response(null, { status: 204 }));
	await expect(
		unwrap(
			api.http.POST("/api/v1/auth/logout", {
				params: { header: { "X-CSRF-TOKEN": "t" } },
			}),
		),
	).resolves.toBeUndefined();
});
