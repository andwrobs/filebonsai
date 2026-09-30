import { ApiError } from "~/lib/api/api";
import type { components, paths } from "~/lib/api/generated/schema";

export type Entry = components["schemas"]["EntryResponse"];
export type EntryDetails = components["schemas"]["EntryDetailsResponse"];
export type EntryPage = components["schemas"]["EntryPageResponse"];
export type FileEntry = components["schemas"]["FileEntryResponse"];
export type FolderEntry = components["schemas"]["FolderEntryResponse"];
export type FolderDetails = components["schemas"]["FolderDetailsResponse"];

type ChildrenParameters = NonNullable<
	paths["/api/v1/entries/{id}/children"]["get"]["parameters"]["query"]
>;

/** Limits a listing to folders or files. */
export type EntryKind = NonNullable<ChildrenParameters["kind"]>;
export type SortField = NonNullable<ChildrenParameters["sort"]>;
export type SortOrder = NonNullable<ChildrenParameters["order"]>;

/** How the server orders a listing. A cursor belongs to one ordering. */
export interface ListingOrder {
	sort: SortField;
	order: SortOrder;
	foldersFirst: boolean;
}

/** The server's own default, so omitting every parameter means the same thing. */
export const defaultListingOrder: ListingOrder = {
	sort: "name",
	order: "asc",
	foldersFirst: false,
};

/** One page of a folder's children, without repeats. */
export interface ChildrenPage {
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
