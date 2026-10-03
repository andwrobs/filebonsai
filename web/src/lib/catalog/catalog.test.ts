import { expect, it } from "vitest";
import { ApiError } from "~/lib/api/api";
import { catalogHref, errorMessage, uniqueEntries } from "./catalog";

const folder = {
	createdAt: "2026-09-21T00:00:00Z",
	id: "00000000-0000-4000-8000-000000000001",
	kind: "folder" as const,
	name: "Library",
	parentId: null,
	updatedAt: "2026-09-21T00:00:00Z",
	revision: 1,
};

it("keeps UUID URLs and deduplicates repeated cursor entries", () => {
	expect(catalogHref(folder.id)).toBe(
		"/library/00000000-0000-4000-8000-000000000001",
	);
	expect(uniqueEntries([folder, folder])).toEqual([folder]);
});

it("names known conflicts and falls back to the server's message", () => {
	const failure = (code: string, message = "") =>
		new ApiError("http", "Request failed (409).", "", 409, {
			code,
			fieldErrors: [],
			message,
			requestId: "r",
			status: 409,
		});
	expect(errorMessage(failure("NAME_CONFLICT"), "fallback")).toBe(
		"An entry with that name already exists in this folder.",
	);
	expect(errorMessage(failure("ENTRY_NOT_FOUND"), "fallback")).toBe(
		"This folder is not available.",
	);
	expect(errorMessage(failure("FUTURE", "Try later"), "fallback")).toBe(
		"Try later",
	);
	expect(errorMessage(new TypeError("offline"), "fallback")).toBe("fallback");
});
