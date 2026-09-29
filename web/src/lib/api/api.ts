import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { components, paths } from "./generated/schema";

// The generated contract (src/lib/api/generated) is the transport: npm run
// generate:schema derives it from backend/contract/openapi.json. Never edit it.

export type ApiErrorBody = components["schemas"]["ApiErrorResponse"];
export type ApiErrorKind = "network" | "http" | "invalid-response";

// One error type for every failed request. `kind` says what went wrong;
// `status` and `body` carry what the server sent, when it answered.
export class ApiError extends Error {
	override name = "ApiError";

	constructor(
		readonly kind: ApiErrorKind,
		message: string,
		readonly url: string,
		readonly status?: number,
		readonly body?: ApiErrorBody,
		options?: ErrorOptions,
	) {
		super(message, options);
	}
}

export function isUnauthorized(error: unknown) {
	return error instanceof ApiError && error.status === 401;
}

// Retrying can't change a 4xx answer or a malformed body; a lost connection or
// an unavailable server may recover.
export function isTransient(error: unknown) {
	return (
		error instanceof ApiError &&
		(error.kind === "network" || (error.status ?? 0) >= 500)
	);
}

export interface ApiClient {
	/** The generated transport. Every request includes the session cookie. */
	readonly http: Client<paths>;
	/** The held CSRF token, reading one when none is held. */
	csrfToken(): Promise<string>;
	/** Reads a new CSRF token, for when the session may have rotated. */
	refreshCsrf(): Promise<string>;
	/** Drops the held token after a session transition such as sign-in. */
	forgetCsrf(): void;
}

type Deps = {
	/** Origin in front of the contract's /api/v1 paths. */
	baseUrl: string;
	fetch?: ClientOptions["fetch"];
};

// A client, not a service: it holds the double-submit CSRF token between calls
// so each state-changing request doesn't read a new one.
export function createApiClient({
	baseUrl,
	// Resolved per request so tests can stub the global fetch.
	fetch = (request) => globalThis.fetch(request),
}: Deps): ApiClient {
	const http = createClient<paths>({ baseUrl, credentials: "include", fetch });
	let held: string | undefined;

	async function refreshCsrf() {
		const { token } = await unwrap(http.GET("/api/v1/auth/csrf"));
		held = token;
		return token;
	}

	async function csrfToken() {
		return held ?? refreshCsrf();
	}

	function forgetCsrf() {
		held = undefined;
	}

	return { http, csrfToken, refreshCsrf, forgetCsrf };
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/**
 * Returns a generated call's data, or throws an ApiError. Aborts pass through
 * unchanged so Query can cancel. A 204 resolves to undefined.
 */
export async function unwrap<T>(pending: Promise<Result<T>>): Promise<T> {
	let result: Result<T>;
	try {
		result = await pending;
	} catch (error) {
		if (isAbort(error)) throw error;
		const invalid = error instanceof SyntaxError;
		throw new ApiError(
			invalid ? "invalid-response" : "network",
			invalid
				? "The server sent an unexpected response."
				: "The server couldn't be reached.",
			"",
			undefined,
			undefined,
			{ cause: error },
		);
	}
	const { data, error, response } = result;
	if (response.ok) return data as T;
	const body = errorBody(error);
	throw new ApiError(
		"http",
		body?.message || `Request failed (${response.status}).`,
		response.url,
		response.status,
		body,
	);
}

// Error bodies follow ApiErrorResponse, but a proxy or gateway may answer with
// anything; only a body with a code counts.
function errorBody(error: unknown): ApiErrorBody | undefined {
	return typeof error === "object" &&
		error !== null &&
		typeof (error as { code?: unknown }).code === "string"
		? (error as ApiErrorBody)
		: undefined;
}

// DOMException isn't an Error subclass everywhere, so check the name.
function isAbort(error: unknown) {
	return (error as { name?: unknown } | null)?.name === "AbortError";
}
