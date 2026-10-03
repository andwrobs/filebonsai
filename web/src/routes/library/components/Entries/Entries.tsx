import type { Entry } from "~/lib/catalog/catalog";
import type { LibraryView } from "../../useLibraryView";
import type { Inspector } from "../Inspector";
import { EntryGrid } from "./EntryGrid";
import { EntryRows } from "./EntryRows";
import { EntryTable } from "./EntryTable";
import { SelectionBar } from "./SelectionBar";
import { useEntries } from "./useEntries";

/** A folder's entries as a table, a grid, or (narrow or on a phone) rows. */
export function Entries({
	entries,
	folderId,
	inspector,
	inspectorId,
	labelledBy,
	library,
}: {
	entries: readonly Entry[];
	folderId: string;
	inspector: Inspector;
	inspectorId: string;
	labelledBy: string;
	library: LibraryView;
}) {
	const { container, items, layout, selection, showKind } = useEntries({
		entries,
		folderId,
		inspector,
		inspectorId,
		phone: library.phone,
		view: library.view,
	});
	return (
		<div className="min-w-0" data-layout={layout} ref={container}>
			<SelectionBar
				loaded={entries.length}
				selection={selection}
				touch={library.phone}
			/>
			<div {...selection.guard}>
				{layout === "table" ? (
					<EntryTable
						items={items}
						labelledBy={labelledBy}
						onSort={library.sortBy}
						order={library.order}
						selection={selection.collection}
						showKind={showKind}
					/>
				) : layout === "grid" ? (
					<EntryGrid
						items={items}
						labelledBy={labelledBy}
						selection={selection.collection}
					/>
				) : (
					<EntryRows
						items={items}
						labelledBy={labelledBy}
						selection={selection.collection}
					/>
				)}
			</div>
		</div>
	);
}
