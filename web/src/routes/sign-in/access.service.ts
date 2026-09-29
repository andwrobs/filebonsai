import { type ApiClient, unwrap } from "~/lib/api/api";
import type { AccessSession } from "./access";

type Options = { signal?: AbortSignal };

export interface AccessService {
	/** The signed-in session; a signed-out visitor gets a 401 ApiError. */
	currentSession(options?: Options): Promise<AccessSession>;
	/** Signs in the local owner. The password is sent once and never kept. */
	login(password: string): Promise<AccessSession>;
	logout(): Promise<void>;
}

type Deps = { api: ApiClient };

export function createAccessService({ api }: Deps): AccessService {
	const { http } = api;

	function currentSession({ signal }: Options = {}) {
		return unwrap(http.GET("/api/v1/auth/me", { signal }));
	}

	// Each attempt reads a new token; a successful sign-in rotates the session,
	// so the held token is dropped.
	async function login(password: string) {
		const session = await unwrap(
			http.POST("/api/v1/auth/login", {
				params: { header: { "X-CSRF-TOKEN": await api.refreshCsrf() } },
				body: { password },
			}),
		);
		api.forgetCsrf();
		return session;
	}

	async function logout() {
		await unwrap(
			http.POST("/api/v1/auth/logout", {
				params: { header: { "X-CSRF-TOKEN": await api.csrfToken() } },
			}),
		);
		api.forgetCsrf();
	}

	return { currentSession, login, logout };
}
