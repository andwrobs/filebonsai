import { ApiError } from "~/lib/api/api";
import type { components } from "~/lib/api/generated/schema";
import { formatBytes } from "~/lib/format/bytes";

export type Upload = components["schemas"]["UploadResponse"];
export type UploadState = Upload["state"];
export type BeginUploadInput = components["schemas"]["BeginUploadRequest"];

/** What a person asked a transfer to do next. */
export type TransferAction = "continue" | "check" | "cancel";

export interface Transfer {
	key: string;
	file: File;
	parentId: string;
	upload?: Upload;
	/** Rejected by the client-side size preflight; nothing was sent to the server. */
	refused?: boolean;
	busy: boolean;
	message: string;
}

export const stateMessages: Record<UploadState, string> = {
	INITIATED: "Ready to send. Retry sends the whole file from byte zero.",
	RECEIVING:
		"The server is still receiving a body. Check status before retrying.",
	STAGED: "Body verified. Ready to finish.",
	FINALIZING: "Finalizing. Availability is not confirmed yet.",
	RECONCILING:
		"Completion is uncertain. The server is reconciling this upload.",
	AVAILABLE: "Available in your Library.",
	CANCELLED: "Upload cancelled.",
	EXPIRED: "Upload expired. Select the file again to start a new upload.",
	FAILED: "Upload failed. Select the file again to start a new upload.",
};

export const sessionUnavailable =
	"Session unavailable. Sign in again, then check status.";

export function terminal(state?: UploadState) {
	return (
		!!state && ["AVAILABLE", "CANCELLED", "EXPIRED", "FAILED"].includes(state)
	);
}

export function settled(item: Transfer) {
	return !!item.refused || terminal(item.upload?.state);
}

/** The server confirms cancellation only before finalization begins. */
export function cancellable(state: UploadState) {
	return ["INITIATED", "RECEIVING", "STAGED"].includes(state);
}

export function needsAttention(item: Transfer) {
	return (
		!!item.refused || ["FAILED", "EXPIRED"].includes(item.upload?.state ?? "")
	);
}

export function oversizeMessage(size: bigint, limit: bigint) {
	let [actual, allowed] = [
		formatBytes(size.toString()),
		formatBytes(limit.toString()),
	];
	// Rounded units can read as equal just over the limit, so fall back to exact bytes.
	if (actual === allowed) {
		[actual, allowed] = [
			`${size.toLocaleString()} bytes`,
			`${limit.toLocaleString()} bytes`,
		];
	}
	return `Too large to upload: ${actual} is over the ${allowed} limit. Nothing was sent.`;
}

/** What a failed operation leaves the person to do; the outcome is never assumed. */
export function failureMessage(error: unknown) {
	if (error instanceof ApiError) {
		if (error.kind === "network") {
			return "Connection lost. The outcome is unknown. Check status before continuing.";
		}
		if (error.kind === "invalid-response") {
			return "Unexpected response. The outcome is unknown. Check status before continuing.";
		}
		if (error.status === 401 || error.status === 403) return sessionUnavailable;
		return `Request failed (${error.status}). Check status before continuing.`;
	}
	return error instanceof Error
		? error.message
		: "Outcome unknown. Check status.";
}
