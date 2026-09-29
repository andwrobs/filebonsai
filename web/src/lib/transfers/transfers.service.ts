import { type ApiClient, unwrap } from "~/lib/api/api";
import type { BeginUploadInput, Upload } from "./transfers";

export interface TransfersService {
	/** Reads a new CSRF token: the session may have rotated since the last request. */
	confirmSession(): Promise<void>;
	/** Reusing the key after a lost reply recovers the same reserved intent. */
	begin(input: BeginUploadInput, idempotencyKey: string): Promise<Upload>;
	status(id: string): Promise<Upload>;
	/** Sends the whole body from byte zero; M1 has no resumable ranges. */
	send(id: string, body: Blob): Promise<Upload>;
	complete(id: string): Promise<Upload>;
	cancel(id: string): Promise<Upload>;
}

type Deps = { api: ApiClient };

export function createTransfersService({ api }: Deps): TransfersService {
	const { http } = api;

	async function confirmSession() {
		await api.refreshCsrf();
	}

	async function begin(input: BeginUploadInput, idempotencyKey: string) {
		return unwrap(
			http.POST("/api/v1/uploads", {
				params: {
					header: {
						"X-CSRF-TOKEN": await api.csrfToken(),
						"Idempotency-Key": idempotencyKey,
					},
				},
				body: input,
			}),
		);
	}

	function status(id: string) {
		return unwrap(
			http.GET("/api/v1/uploads/{id}", { params: { path: { id } } }),
		);
	}

	async function send(id: string, body: Blob) {
		return unwrap(
			http.PUT("/api/v1/uploads/{id}/content", {
				params: {
					path: { id },
					header: { "X-CSRF-TOKEN": await api.csrfToken() },
				},
				headers: { "Content-Type": "application/octet-stream" },
				// The contract types a binary body as a string; the serializer sends the Blob.
				body: "",
				bodySerializer: () => body,
			}),
		);
	}

	async function complete(id: string) {
		return unwrap(
			http.POST("/api/v1/uploads/{id}/complete", {
				params: {
					path: { id },
					header: { "X-CSRF-TOKEN": await api.csrfToken() },
				},
			}),
		);
	}

	async function cancel(id: string) {
		return unwrap(
			http.DELETE("/api/v1/uploads/{id}", {
				params: {
					path: { id },
					header: { "X-CSRF-TOKEN": await api.csrfToken() },
				},
			}),
		);
	}

	return { confirmSession, begin, status, send, complete, cancel };
}
