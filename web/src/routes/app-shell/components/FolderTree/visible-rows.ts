// What the virtualized tree lays out, worked out from the query cache, so the
// current folder can be scrolled to without its row being mounted. It must count
// rows exactly as SubfolderRows builds them: a parent's subfolders, then a load
// row unless its listing failed or is complete, then a retry row after a
// failure. Collapsed folders contribute only their own row.

/** One parent's cached subfolders. */
export interface CachedSubfolders {
	folderIds: readonly string[];
	/** A page has arrived. */
	loaded: boolean;
	hasNextPage: boolean;
	isError: boolean;
}

export type VisibleRow =
	| { kind: "folder"; id: string }
	| { kind: "loader"; parentId: string }
	| { kind: "retry"; parentId: string };

const unknown: CachedSubfolders = {
	folderIds: [],
	loaded: false,
	hasNextPage: false,
	isError: false,
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
		if (!cached.isError && (!cached.loaded || cached.hasNextPage)) {
			rows.push({ kind: "loader", parentId });
		}
		if (cached.isError) rows.push({ kind: "retry", parentId });
	};
	add(rootId ?? "");
	return rows;
}

/** The row index of a folder, or -1 when it isn't shown (yet). */
export function rowIndexOf(rows: readonly VisibleRow[], folderId: string) {
	return rows.findIndex((row) => row.kind === "folder" && row.id === folderId);
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
