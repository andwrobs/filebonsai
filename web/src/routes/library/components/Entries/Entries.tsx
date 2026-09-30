import type { Entry } from "~/lib/catalog/catalog";
import type { LibraryView } from "../../useLibraryView";
import type { Inspector } from "../Inspector";
import { EntryGrid } from "./EntryGrid";
import { EntryRows } from "./EntryRows";
import { EntryTable } from "./EntryTable";
import { useEntries } from "./useEntries";

/** A folder's entries as a table, a grid, or (narrow or on a phone) rows. */
export function Entries({
	entries,
	inspector,
	inspectorId,
	labelledBy,
	library,
}: {
	entries: readonly Entry[];
	inspector: Inspector;
	inspectorId: string;
	labelledBy: string;
	library: LibraryView;
}) {
	const { container, items, layout, showKind } = useEntries({
		entries,
		inspector,
		inspectorId,
		phone: library.phone,
		view: library.view,
	});
	return (
		<div className="min-w-0" data-layout={layout} ref={container}>
			{layout === "table" ? (
				<EntryTable
					items={items}
					labelledBy={labelledBy}
					onSort={library.sortBy}
					order={library.order}
					showKind={showKind}
				/>
			) : layout === "grid" ? (
				<EntryGrid items={items} labelledBy={labelledBy} />
			) : (
				<EntryRows items={items} labelledBy={labelledBy} />
			)}
			<p className="mt-3 text-sm text-muted-foreground">
				{entries.length} {entries.length === 1 ? "item" : "items"}
			</p>
		</div>
	);
}
