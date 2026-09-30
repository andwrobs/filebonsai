import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useEffect } from "react";
import { subfoldersQuery } from "~/lib/catalog/catalog.query";
import { useExpandedFolders } from "./expanded-folders.store";
import { foldersIn } from "./useSubfolders";
import {
	type CachedSubfolders,
	nearestScrollTop,
	rowIndexOf,
	visibleRows,
} from "./visible-rows";

// About a second of frames, for the virtualizer to size its content.
const maxFrames = 60;

/**
 * Scrolls the tree so the current folder's row is in view, once per
 * navigation, as soon as the rows down to it are loaded and laid out. The tree
 * only mounts the rows in view, so this works from the query cache, not the
 * DOM. It never moves focus, and it gives up if the user scrolls or types
 * first.
 */
export function useScrollToCurrentFolder({
	currentId,
	rootId,
	rowSize,
	scrollRef,
}: {
	currentId: string | undefined;
	rootId: string | undefined;
	rowSize: number;
	scrollRef: RefObject<HTMLElement | null>;
}) {
	const queryClient = useQueryClient();
	useEffect(() => {
		const element = scrollRef.current;
		if (!element || !currentId || !rowSize) return;

		const read = (parentId: string): CachedSubfolders | undefined => {
			const { queryKey } = subfoldersQuery(parentId);
			const state = queryClient.getQueryState(queryKey);
			if (!state) return undefined;
			const data = queryClient.getQueryData(queryKey);
			return {
				folderIds: foldersIn(data).map((folder) => folder.id),
				loaded: data !== undefined,
				hasNextPage: (data?.pages.at(-1)?.nextCursor ?? null) !== null,
				isError: state.status === "error",
			};
		};
		// Once the row is known, the virtualizer still has to grow the scroll
		// height to reach it, and it does that without a DOM change worth
		// observing; so keep trying for a short while, frame by frame.
		let frames = 0;
		let frame = 0;
		const attempt = (): boolean => {
			const rows = visibleRows({
				rootId,
				expanded: new Set(useExpandedFolders.getState().expanded),
				read,
			});
			const index = rowIndexOf(rows, currentId);
			if (index < 0) return false;
			if (element.scrollHeight < (index + 1) * rowSize) {
				if (frames++ < maxFrames) frame = requestAnimationFrame(retry);
				return false;
			}
			element.scrollTop = nearestScrollTop({
				index,
				rowSize,
				scrollTop: element.scrollTop,
				viewportHeight: element.clientHeight,
			});
			return true;
		};
		const retry = () => {
			if (attempt()) stop();
		};

		const stop = () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			for (const type of ["wheel", "pointerdown", "keydown"]) {
				element.removeEventListener(type, stop);
			}
		};
		const observer = new MutationObserver(retry);
		observer.observe(element, {
			attributeFilter: ["style"],
			attributes: true,
			childList: true,
			subtree: true,
		});
		for (const type of ["wheel", "pointerdown", "keydown"]) {
			element.addEventListener(type, stop, { passive: true });
		}
		retry();
		return stop;
	}, [currentId, queryClient, rootId, rowSize, scrollRef]);
}
