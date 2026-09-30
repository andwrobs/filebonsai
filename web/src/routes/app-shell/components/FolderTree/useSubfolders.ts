import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
	type EntryPage,
	type FolderEntry,
	uniqueEntries,
} from "~/lib/catalog/catalog";
import { subfoldersQuery } from "~/lib/catalog/catalog.query";

// The server filters by kind; keep only folders anyway in case an older server
// ignores it. Pages carry no snapshot, so an entry can repeat.
export function foldersIn(data: InfiniteData<EntryPage> | undefined) {
	return uniqueEntries(
		data?.pages.flatMap((page) => page.entries) ?? [],
	).filter((entry): entry is FolderEntry => entry.kind === "folder");
}

export interface Subfolders {
	folders: FolderEntry[];
	/** True once a page has arrived; until then a folder's contents are unknown. */
	loaded: boolean;
	hasNextPage: boolean;
	isLoading: boolean;
	isError: boolean;
	loadMore(): void;
	retry(): void;
}

/**
 * One folder's subfolders, 100 at a time. Nothing loads until `enabled`.
 * `revealId` is the child on the way to the current folder: while it hasn't
 * arrived, the next page loads without waiting for a scroll.
 */
export function useSubfolders(
	parentId: string | undefined,
	{ enabled, revealId }: { enabled: boolean; revealId?: string },
): Subfolders {
	const query = useInfiniteQuery({
		...subfoldersQuery(parentId ?? ""),
		enabled: enabled && parentId !== undefined,
	});
	const { data, fetchNextPage, hasNextPage, isFetching, isError, refetch } =
		query;
	const folders = useMemo(() => foldersIn(data), [data]);

	const loadMore = () => {
		if (enabled && hasNextPage && !isFetching) void fetchNextPage();
	};

	const pages = data?.pages.length ?? 0;
	const waitingForReveal =
		enabled &&
		revealId !== undefined &&
		!isError &&
		pages > 0 &&
		!folders.some((folder) => folder.id === revealId);
	// biome-ignore lint/correctness/useExhaustiveDependencies: loadMore is derived from the values listed.
	useEffect(() => {
		if (waitingForReveal) loadMore();
	}, [waitingForReveal, hasNextPage, isFetching, pages]);

	return {
		folders,
		loaded: data !== undefined,
		hasNextPage,
		isLoading: isFetching,
		isError,
		loadMore,
		retry: () => void refetch(),
	};
}
