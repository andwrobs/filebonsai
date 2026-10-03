import type { Entry } from "~/lib/catalog/catalog";
import type { LibraryView } from "../../useLibraryView";
import type { Inspector } from "../Inspector";
import { EntryGrid } from "./EntryGrid";
import { EntryRows } from "./EntryRows";
import { EntryTable } from "./EntryTable";
import { SelectionBar } from "./SelectionBar";
import { useEntries } from "./useEntries";
import type { EntrySelection } from "./useEntrySelection";

/** A folder's entries as a table, a grid, or (narrow or on a phone) rows. */
export function Entries({
	entries,
	inspector,
	inspectorId,
	labelledBy,
	library,
	selection,
}: {
	entries: readonly Entry[];
	inspector: Inspector;
	inspectorId: string;
	labelledBy: string;
	library: LibraryView;
	selection: EntrySelection;
}) {
	const { container, items, layout, showKind } = useEntries({
		entries,
		inspector,
		inspectorId,
		phone: library.phone,
		selection,
		view: library.view,
	});
	return (
		<div className="min-w-0" data-layout={layout} ref={container}>
			<SelectionBar
				loaded={entries.length}
				selection={selection}
				touch={library.phone}
			/>
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
	);
}
