import { queryOptions } from "@tanstack/react-query";
import { catalogService } from "~/services";

// Everything read from the catalog sits under ["catalog"], so a finished upload
// or a new folder can invalidate it in one call.
export const catalogKeys = {
	all: ["catalog"] as const,
	root: () => [...catalogKeys.all, "root"] as const,
	folder: (id: string) => [...catalogKeys.all, "folder", id] as const,
};

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
