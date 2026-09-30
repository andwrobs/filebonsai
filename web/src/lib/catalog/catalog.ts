import { ApiError } from "~/lib/api/api";
import type { components } from "~/lib/api/generated/schema";

export type Entry = components["schemas"]["EntryResponse"];
export type EntryDetails = components["schemas"]["EntryDetailsResponse"];
export type EntryPage = components["schemas"]["EntryPageResponse"];
export type FileEntry = components["schemas"]["FileEntryResponse"];
export type FolderEntry = components["schemas"]["FolderEntryResponse"];
export type FolderDetails = components["schemas"]["FolderDetailsResponse"];

/** A folder and the first page of its children. */
export interface FolderListing {
	folder: FolderDetails;
	children: Entry[];
	nextCursor: string | null;
}

// The Library addresses folders by ID; a file ID at a folder URL isn't a page.
export class NotAFolderError extends Error {
	override name = "NotAFolderError";

	constructor() {
		super("This entry is a file, not a folder.");
	}
}

export function catalogHref(entryId: string) {
	return `/library/${encodeURIComponent(entryId)}`;
}

// Cursor pages have no snapshot, so an entry can repeat across pages.
export function uniqueEntries(entries: readonly Entry[]) {
	return entries.filter(
		(entry, index) =>
			entries.findIndex((candidate) => candidate.id === entry.id) === index,
	);
}

export function errorMessage(error: unknown, fallback: string) {
	const body = error instanceof ApiError ? error.body : undefined;
	if (body?.code === "NAME_CONFLICT") {
		return "An entry with that name already exists in this folder.";
	}
	if (body?.code === "ENTRY_NOT_FOUND") {
		return "This folder is not available.";
	}
	return body?.message || fallback;
}
