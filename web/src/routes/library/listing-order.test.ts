import { expect, it } from "vitest";
import { defaultListingOrder } from "~/lib/catalog/catalog";
import {
	directionLabel,
	orderFromSearch,
	searchWithOrder,
	sortBy,
} from "./listing-order";

it("round-trips an order through the URL, leaving out defaults and keeping other parameters", () => {
	const order = { sort: "size", order: "desc", foldersFirst: true } as const;
	const search = searchWithOrder(
		new URLSearchParams("view=x&sort=name"),
		order,
	);
	expect(search.toString()).toBe("view=x&sort=size&order=desc&folders=first");
	expect(orderFromSearch(search)).toEqual(order);
	expect(searchWithOrder(search, defaultListingOrder).toString()).toBe(
		"view=x",
	);
});

it("falls back to the default for anything it doesn't know", () => {
	expect(
		orderFromSearch(new URLSearchParams("sort=kind&order=up&folders=yes")),
	).toEqual(defaultListingOrder);
});

it("starts each field at its natural direction and flips the current one", () => {
	const byName = defaultListingOrder;
	expect(sortBy(byName, "updatedAt")).toEqual({
		...byName,
		sort: "updatedAt",
		order: "desc",
	});
	expect(sortBy(byName, "size").order).toBe("desc");
	expect(sortBy(byName, "name").order).toBe("desc");
	expect(sortBy({ ...byName, foldersFirst: true }, "size").foldersFirst).toBe(
		true,
	);
	expect(directionLabel("updatedAt", "desc")).toBe("Newest first");
});
