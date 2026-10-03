import {
	defaultListingOrder,
	type ListingOrder,
	type SortField,
	type SortOrder,
} from "~/lib/catalog/catalog";

const fields: readonly SortField[] = ["name", "updatedAt", "size", "kind"];
const orders: readonly SortOrder[] = ["asc", "desc"];

const isField = (value: string | null): value is SortField =>
	fields.includes(value as SortField);
const isOrder = (value: string | null): value is SortOrder =>
	orders.includes(value as SortOrder);

/**
 * The Library's order lives in the URL, so Back and a reload keep it. Anything
 * unrecognized falls back to the default rather than failing the page.
 */
export function orderFromSearch(search: URLSearchParams): ListingOrder {
	const sort = search.get("sort");
	const order = search.get("order");
	return {
		sort: isField(sort) ? sort : defaultListingOrder.sort,
		order: isOrder(order) ? order : defaultListingOrder.order,
		foldersFirst: search.get("folders") === "first",
	};
}

/** Writes an order into the URL's search, leaving out defaults and other parameters. */
export function searchWithOrder(search: URLSearchParams, order: ListingOrder) {
	const next = new URLSearchParams(search);
	next.delete("sort");
	next.delete("order");
	next.delete("folders");
	if (order.sort !== defaultListingOrder.sort) next.set("sort", order.sort);
	if (order.order !== defaultListingOrder.order) next.set("order", order.order);
	if (order.foldersFirst) next.set("folders", "first");
	return next;
}

// Names and kinds read A to Z first; dates and sizes read newest and largest first.
const firstOrder: Record<SortField, SortOrder> = {
	name: "asc",
	updatedAt: "desc",
	size: "desc",
	kind: "asc",
};

/** A column header: the same field flips its direction, another starts at its natural one. */
export function sortBy(current: ListingOrder, sort: SortField): ListingOrder {
	if (current.sort === sort) {
		return { ...current, order: current.order === "asc" ? "desc" : "asc" };
	}
	return { ...current, sort, order: firstOrder[sort] };
}

export const fieldLabels: Record<SortField, string> = {
	name: "Name",
	updatedAt: "Modified",
	size: "Size",
	kind: "Kind",
};

/** Plain-language direction for a field, as the sort menu shows it. */
export function directionLabel(sort: SortField, order: SortOrder) {
	const labels: Record<SortField, [string, string]> = {
		name: ["A to Z", "Z to A"],
		updatedAt: ["Oldest first", "Newest first"],
		size: ["Smallest first", "Largest first"],
		// The server puts folders before every kind and unrecognized files after.
		kind: ["A to Z", "Z to A"],
	};
	return labels[sort][order === "asc" ? 0 : 1];
}
