import { expect, it } from "vitest";
import { ApiError, type ApiErrorBody } from "~/lib/api/api";
import { capabilityRows, providerLabel, storageFailure } from "./storage";

it("labels known providers and shows unknown provider kinds as sent", () => {
	expect(providerLabel("local")).toBe("Local disk on the server");
	expect(providerLabel("r2")).toBe("Cloudflare R2");
	expect(providerLabel("future-provider")).toBe("future-provider");
});

it("describes each capability in words, not only as a flag", () => {
	const rows = capabilityRows({
		connection: { displayName: "Local disk", providerKind: "local" },
		capabilities: {
			sha256Verification: true,
			resumableUploads: false,
			rangeDownloads: false,
		},
		usedBytes: "0",
	});
	expect(rows.map((row) => [row.label, row.enabled])).toEqual([
		["Verified uploads", true],
		["Resumable uploads", false],
		["Partial downloads", false],
	]);
	expect(rows[1]?.detail).toBe(
		"An interrupted upload is sent again from byte zero.",
	);
});

it("separates an unreachable server from an API error", () => {
	const http = (status: number, body?: ApiErrorBody) =>
		new ApiError("http", "failed", "", status, body);
	const body = (code: string, requestId: string): ApiErrorBody => ({
		code,
		message: "Request could not be processed",
		status: 500,
		requestId,
		fieldErrors: [],
	});
	expect(storageFailure(new ApiError("network", "offline", "")).kind).toBe(
		"unavailable",
	);
	expect(storageFailure(http(503, body("STORAGE_UNAVAILABLE", "r"))).kind).toBe(
		"unavailable",
	);
	expect(storageFailure(http(500)).kind).toBe("unavailable");
	expect(storageFailure(http(500, body("INTERNAL_ERROR", "req-1")))).toEqual({
		kind: "error",
		message: "Request could not be processed",
		requestId: "req-1",
	});
});
