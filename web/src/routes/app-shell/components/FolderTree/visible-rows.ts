// What the virtualized tree lays out, worked out from the query cache, so the
// current folder can be scrolled to without its row being mounted. It must count
// rows exactly as the layout gives them height: a parent's subfolders, then a
// load row only while that listing is being fetched (React Aria's ListLayout
// gives an idle loader no height), then a retry row after a failure. Collapsed
// folders contribute only their own row.

/** One parent's cached subfolders. */
export interface CachedSubfolders {
	folderIds: readonly string[];
	/** A page has arrived. */
	loaded: boolean;
	hasNextPage: boolean;
	isError: boolean;
	/** A request is in flight: the load row is showing "Loading folders…". */
	isFetching: boolean;
}

export type VisibleRow =
	| { kind: "folder"; id: string }
	| { kind: "loader"; parentId: string }
	| { kind: "retry"; parentId: string }
	/**
	 * An open parent whose first page hasn't arrived: it has no height yet, but
	 * how many rows it will add is unknown, so nothing below it can be placed.
	 */
	| { kind: "unsettled"; parentId: string };

const unknown: CachedSubfolders = {
	folderIds: [],
	loaded: false,
	hasNextPage: false,
	isError: false,
	isFetching: false,
};

/**
 * The rows the tree shows, top to bottom. `rootId` is undefined until the
 * workspace root is known, when only the top-level load row shows.
 */
export function visibleRows({
	rootId,
	expanded,
	read,
}: {
	rootId: string | undefined;
	expanded: ReadonlySet<string>;
	read(parentId: string): CachedSubfolders | undefined;
}): VisibleRow[] {
	const rows: VisibleRow[] = [];
	const add = (parentId: string) => {
		const cached = (parentId === "" ? undefined : read(parentId)) ?? unknown;
		for (const id of cached.folderIds) {
			rows.push({ kind: "folder", id });
			if (expanded.has(id)) add(id);
		}
		if (!cached.loaded && !cached.isError) {
			rows.push({ kind: "unsettled", parentId });
		}
		// SubfolderRows renders a load row unless the listing failed or is
		// complete, and passes it `isLoading` while a request is in flight.
		if (
			cached.isFetching &&
			!cached.isError &&
			(!cached.loaded || cached.hasNextPage)
		) {
			rows.push({ kind: "loader", parentId });
		}
		if (cached.isError) rows.push({ kind: "retry", parentId });
	};
	add(rootId ?? "");
	return rows;
}

/**
 * The row index of a folder, or -1 when it isn't shown yet, or when an open
 * parent above it is still waiting for its first page, because the rows it
 * will add would move the folder.
 */
export function rowIndexOf(rows: readonly VisibleRow[], folderId: string) {
	let index = 0;
	for (const row of rows) {
		if (row.kind === "unsettled") return -1;
		if (row.kind === "folder" && row.id === folderId) return index;
		index++;
	}
	return -1;
}

/**
 * The scroll offset that brings a row into view with the least movement: the
 * current offset if it is already fully visible.
 */
export function nearestScrollTop({
	index,
	rowSize,
	scrollTop,
	viewportHeight,
}: {
	index: number;
	rowSize: number;
	scrollTop: number;
	viewportHeight: number;
}) {
	const top = index * rowSize;
	const bottom = top + rowSize;
	if (top < scrollTop) return top;
	if (bottom > scrollTop + viewportHeight) return bottom - viewportHeight;
	return scrollTop;
}
