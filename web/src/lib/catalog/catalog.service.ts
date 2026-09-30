import { type ApiClient, unwrap } from "~/lib/api/api";
import {
	type ChildrenPage,
	type EntryDetails,
	type EntryKind,
	type EntryPage,
	type FolderDetails,
	type FolderEntry,
	type ListingOrder,
	NotAFolderError,
	uniqueEntries,
} from "./catalog";

type Options = { signal?: AbortSignal };
type ChildrenOptions = Options & {
	cursor?: string;
	kind?: EntryKind;
	limit?: number;
	/** Omitted: the server's default order. */
	order?: ListingOrder;
};

export interface CreateFolderInput {
	/** Stable per intent, so a retried request can't create a second folder. */
	idempotencyKey: string;
	name: string;
	parentId: string;
}

export interface CatalogService {
	workspaceRoot(options?: Options): Promise<FolderEntry>;
	entry(id: string, options?: Options): Promise<EntryDetails>;
	children(id: string, options?: ChildrenOptions): Promise<EntryPage>;
	/** A folder's details; a file throws NotAFolderError. */
	folder(id: string, options?: Options): Promise<FolderDetails>;
	/** The first page of a folder's children in the given order. */
	firstPage(
		id: string,
		options?: Options & { order?: ListingOrder },
	): Promise<ChildrenPage>;
	createFolder(input: CreateFolderInput): Promise<FolderEntry>;
	/** The whole original as a Blob; the browser then saves or previews it. */
	downloadOriginal(id: string, options?: Options): Promise<Blob>;
}

type Deps = { api: ApiClient };

export function createCatalogService({ api }: Deps): CatalogService {
	const { http } = api;

	function workspaceRoot({ signal }: Options = {}) {
		return unwrap(http.GET("/api/v1/catalog/root", { signal }));
	}

	function entry(id: string, { signal }: Options = {}) {
		return unwrap(
			http.GET("/api/v1/entries/{id}", { params: { path: { id } }, signal }),
		);
	}

	function children(
		id: string,
		{ cursor, kind, limit, order, signal }: ChildrenOptions = {},
	) {
		return unwrap(
			http.GET("/api/v1/entries/{id}/children", {
				params: { path: { id }, query: { cursor, kind, limit, ...order } },
				signal,
			}),
		);
	}

	async function folder(id: string, options: Options = {}) {
		const found = await entry(id, options);
		if (found.kind !== "folder") throw new NotAFolderError();
		return found;
	}

	async function firstPage(
		id: string,
		options: Options & { order?: ListingOrder } = {},
	) {
		const page = await children(id, options);
		return {
			children: uniqueEntries(page.entries),
			nextCursor: page.nextCursor,
		};
	}

	// Reads a new CSRF token for each creation: a sign-in in another tab rotates
	// the session, and a held token would then fail until reload.
	async function createFolder({
		idempotencyKey,
		name,
		parentId,
	}: CreateFolderInput) {
		return unwrap(
			http.POST("/api/v1/folders", {
				params: {
					header: {
						"Idempotency-Key": idempotencyKey,
						"X-CSRF-TOKEN": await api.refreshCsrf(),
					},
				},
				body: { name, parentId },
			}),
		);
	}

	async function downloadOriginal(id: string, { signal }: Options = {}) {
		// The generated type describes a binary body as a string; parseAs yields the Blob.
		const blob: unknown = await unwrap(
			http.GET("/api/v1/entries/{id}/content", {
				params: { path: { id } },
				parseAs: "blob",
				signal,
			}),
		);
		return blob as Blob;
	}

	return {
		workspaceRoot,
		entry,
		children,
		folder,
		firstPage,
		createFolder,
		downloadOriginal,
	};
}
