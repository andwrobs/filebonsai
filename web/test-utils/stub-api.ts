import { vi } from "vitest";

type Handler = (path: string, request: Request) => Response | Promise<Response>;

/**
 * Answers the app's API requests in a test. The services in ~/services read
 * the global fetch per request; call vi.unstubAllGlobals() after each test.
 */
export function stubApi(handler: Handler) {
	const requests: Request[] = [];
	vi.stubGlobal("fetch", async (request: Request) => {
		requests.push(request);
		return handler(new URL(request.url).pathname, request);
	});
	return { requests };
}

export const csrf = () =>
	Response.json({ headerName: "X-CSRF-TOKEN", token: "test-csrf" });

export const apiError = (status: number, code: string, message = "") =>
	Response.json(
		{ code, fieldErrors: [], message, requestId: `request-${status}`, status },
		{ status },
	);
