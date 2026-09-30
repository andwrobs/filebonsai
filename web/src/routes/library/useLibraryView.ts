import { useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import type { ListingOrder, SortField } from "~/lib/catalog/catalog";
import { type EntryView, useEntryView } from "./entry-view.store";
import { searchWithOrder, sortBy } from "./listing-order";

export interface LibraryView {
	/** The order the listing on screen was loaded in. */
	order: ListingOrder;
	/** A column header: the same field flips, another starts at its natural direction. */
	sortBy(field: SortField): void;
	setOrder(order: ListingOrder): void;
	view: EntryView;
	setView(view: EntryView): void;
	/** Phones always get rows, so they have no view choice. */
	phone: boolean;
}

/**
 * The Library's presentation: the order in the URL (the loader reads it and
 * fetches the first page again), and the table or grid remembered per viewer.
 */
export function useLibraryView(order: ListingOrder): LibraryView {
	const [, setSearch] = useSearchParams();
	const view = useEntryView((state) => state.view);
	const setView = useEntryView((state) => state.setView);
	const phone = useIsPhone();
	// Replace: a new order isn't a new place, so Back leaves the folder.
	const setOrder = (next: ListingOrder) =>
		setSearch((current) => searchWithOrder(current, next), {
			preventScrollReset: true,
			replace: true,
		});
	return {
		order,
		sortBy: (field) => setOrder(sortBy(order, field)),
		setOrder,
		view,
		setView,
		phone,
	};
}

// Below the shell's `md` breakpoint (bottom navigation), as CSS decides it.
const phoneQuery = () => window.matchMedia?.("(min-width: 48rem)");

function subscribe(onChange: () => void) {
	const query = phoneQuery();
	query?.addEventListener("change", onChange);
	return () => query?.removeEventListener("change", onChange);
}

function useIsPhone() {
	return useSyncExternalStore(
		subscribe,
		() => phoneQuery()?.matches === false,
		() => false,
	);
}
