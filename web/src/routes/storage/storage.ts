import { ApiError } from "~/lib/api/api";
import type { StorageSummary } from "~/lib/storage/storage";

const providers: Record<string, string> = {
	local: "Local disk on the server",
	r2: "Cloudflare R2",
};

// providerKind is an open vocabulary, so an unknown value is shown rather than hidden.
export function providerLabel(kind: string) {
	return providers[kind] ?? kind;
}

export interface CapabilityRow {
	label: string;
	enabled: boolean;
	detail: string;
}

export function capabilityRows({
	capabilities,
}: StorageSummary): CapabilityRow[] {
	return [
		{
			label: "Verified uploads",
			enabled: capabilities.sha256Verification,
			detail: capabilities.sha256Verification
				? "Size and SHA-256 are checked before a file becomes available."
				: "Uploads are not checked by SHA-256 before they become available.",
		},
		{
			label: "Resumable uploads",
			enabled: capabilities.resumableUploads,
			detail: capabilities.resumableUploads
				? "An interrupted upload continues where it stopped."
				: "An interrupted upload is sent again from byte zero.",
		},
		{
			label: "Partial downloads",
			enabled: capabilities.rangeDownloads,
			detail: capabilities.rangeDownloads
				? "Downloads can fetch part of a file."
				: "Downloads always send the whole original.",
		},
	];
}

export interface StorageFailure {
	kind: "unavailable" | "error";
	message: string;
	requestId?: string;
}

// "Unavailable": no response, a gateway/unavailable status, or a body that is not an API error.
// "Error": the API answered with a structured error.
export function storageFailure(error: unknown): StorageFailure {
	const status = error instanceof ApiError ? error.status : undefined;
	const body = error instanceof ApiError ? error.body : undefined;
	if (
		status === undefined ||
		status === 502 ||
		status === 503 ||
		status === 504 ||
		!body?.code
	) {
		return {
			kind: "unavailable",
			message: "The server is not responding normally. Try again in a moment.",
		};
	}
	return {
		kind: "error",
		message: body.message || `The server returned ${status}.`,
		requestId: body.requestId || undefined,
	};
}
