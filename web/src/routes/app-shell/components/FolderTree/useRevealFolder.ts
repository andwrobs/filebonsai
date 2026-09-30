import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo } from "react";
import type { FolderListing } from "~/lib/catalog/catalog";
import { folderQuery } from "~/lib/catalog/catalog.query";
import { useExpandedFolders } from "./expanded-folders.store";

export interface FolderTrail {
	currentId: string | undefined;
	/**
	 * Folder IDs from the top level of the tree down to the current folder,
	 * root excluded. Empty at the root or outside the Library.
	 */
	trail: readonly string[];
}

export const noTrail: FolderTrail = { currentId: undefined, trail: [] };

export const FolderTrailContext = createContext<FolderTrail>(noTrail);

/** The folder one level below `parentId` (undefined: the root) on the trail. */
export function useNextOnTrail(parentId: string | undefined) {
	const { trail } = useContext(FolderTrailContext);
	if (parentId === undefined) return trail[0];
	const index = trail.indexOf(parentId);
	return index < 0 ? undefined : trail[index + 1];
}

/**
 * Opens every ancestor of the current folder when it changes, without moving
 * focus or selecting anything. The route loader has already cached the folder,
 * so its ancestors arrive with no request.
 */
export function useRevealFolder(currentId: string | undefined): FolderTrail {
	const { data: folder } = useQuery({
		...folderQuery(currentId ?? ""),
		enabled: currentId !== undefined,
		select: currentFolder,
	});
	const reveal = useExpandedFolders((state) => state.reveal);
	// Key everything on the trail's IDs, not the folder object: a refetch hands
	// back a new object, and must not re-open ancestors the user has closed.
	const key = useMemo(() => {
		// `ancestors` runs root to parent and is empty at the root itself.
		if (!folder || folder.parentId === null) return "";
		return [
			...folder.ancestors.slice(1).map((ancestor) => ancestor.id),
			folder.id,
		].join("/");
	}, [folder]);
	const trail = useMemo(() => (key ? key.split("/") : []), [key]);
	useEffect(() => {
		reveal(trail.slice(0, -1));
	}, [trail, reveal]);
	return useMemo(() => ({ currentId, trail }), [currentId, trail]);
}

const currentFolder = (listing: FolderListing) => listing.folder;
