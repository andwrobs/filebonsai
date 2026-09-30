import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { catalogService } from "~/services";

// Everything read from the catalog sits under ["catalog"], so a finished upload
// or a new folder can invalidate it in one call.
export const catalogKeys = {
	all: ["catalog"] as const,
	root: () => [...catalogKeys.all, "root"] as const,
	folder: (id: string) => [...catalogKeys.all, "folder", id] as const,
	// Nested under the folder key, so invalidating a folder refreshes its tree.
	subfolders: (id: string) =>
		[...catalogKeys.folder(id), "subfolders"] as const,
};

export const subfolderPageSize = 100;

export function workspaceRootQuery() {
	return queryOptions({
		queryKey: catalogKeys.root(),
		queryFn: ({ signal }) => catalogService.workspaceRoot({ signal }),
	});
}

export function folderQuery(id: string) {
	return queryOptions({
		queryKey: catalogKeys.folder(id),
		queryFn: ({ signal }) => catalogService.folder(id, { signal }),
	});
}

// A folder's subfolders for the tree. Pages carry no snapshot, so flatten them
// with uniqueEntries. No `foldersFirst`: a cursor is bound to it, and a
// folders-only page has no use for it.
export function subfoldersQuery(id: string) {
	return infiniteQueryOptions({
		queryKey: catalogKeys.subfolders(id),
		queryFn: ({ pageParam, signal }) =>
			catalogService.children(id, {
				cursor: pageParam,
				kind: "folder",
				limit: subfolderPageSize,
				signal,
			}),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
	});
}
