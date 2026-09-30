import { expect, it } from "vitest";
import {
	type CachedSubfolders,
	nearestScrollTop,
	rowIndexOf,
	visibleRows,
} from "./visible-rows";

const page = (
	folderIds: string[],
	more: Partial<CachedSubfolders> = {},
): CachedSubfolders => ({
	folderIds,
	loaded: true,
	hasNextPage: false,
	isError: false,
	isFetching: false,
	...more,
});

const rowsFor = (
	cache: Record<string, CachedSubfolders>,
	expanded: string[],
	rootId: string | undefined = "root",
) =>
	visibleRows({
		rootId,
		expanded: new Set(expanded),
		read: (id) => cache[id],
	});

it("lists folders depth first, through expanded folders only", () => {
	const rows = rowsFor(
		{
			root: page(["a", "b"]),
			a: page(["a1", "a2"]),
			a1: page(["deep"]),
			b: page(["b1"]),
		},
		["a", "b"],
	);
	expect(
		rows.map((row) => (row.kind === "folder" ? row.id : row.kind)),
	).toEqual(["a", "a1", "a2", "b", "b1"]);
	expect(rowIndexOf(rows, "b1")).toBe(4);
	expect(rowIndexOf(rows, "deep")).toBe(-1);
});

it("gives an idle load row no height, so a listing with a next page adds no row", () => {
	const rows = rowsFor(
		{
			root: page(["a", "b"]),
			a: page(["a1"], { hasNextPage: true }),
			b: page([]),
		},
		["a"],
	);
	expect(
		rows.map((row) => (row.kind === "folder" ? row.id : row.kind)),
	).toEqual(["a", "a1", "b"]);
	// The folder after the open, idle one sits at index 2, not 3.
	expect(rowIndexOf(rows, "b")).toBe(2);
});

it("counts a load row only while its listing is being fetched", () => {
	const rows = rowsFor(
		{
			root: page(["a", "b"]),
			a: page(["a1"], { hasNextPage: true, isFetching: true }),
		},
		["a"],
	);
	expect(
		rows.map((row) => (row.kind === "folder" ? row.id : row.kind)),
	).toEqual(["a", "a1", "loader", "b"]);
	// An open folder whose first page is on its way, and a refetch of a
	// complete listing (which renders no load row at all).
	expect(
		rowsFor(
			{
				root: page(["a"]),
				a: { ...page([]), loaded: false, isFetching: true },
			},
			["a"],
		).map((row) => row.kind),
	).toEqual(["folder", "unsettled", "loader"]);
	expect(
		rowsFor({ root: page(["a"]), a: page(["a1"], { isFetching: true }) }, [
			"a",
		]).map((row) => row.kind),
	).toEqual(["folder", "folder"]);
});

it("won't place a folder below an open parent that hasn't loaded its first page", () => {
	const cache = {
		root: page(["big", "target"]),
		big: { ...page([]), loaded: false, isFetching: true },
	};
	// Big's kids would push the target down by an unknown amount.
	expect(rowIndexOf(rowsFor(cache, ["big"]), "target")).toBe(-1);
	// Not yet asked for at all is just as unknown.
	expect(rowIndexOf(rowsFor({ root: cache.root }, ["big"]), "target")).toBe(-1);
	// A folder above it is placed regardless, and a collapsed parent is no obstacle.
	expect(rowIndexOf(rowsFor(cache, ["big"]), "big")).toBe(0);
	expect(rowIndexOf(rowsFor(cache, []), "target")).toBe(1);
	// Once it loads, the target is placed after its kids.
	expect(
		rowIndexOf(
			rowsFor({ ...cache, big: page(["k1", "k2"]) }, ["big"]),
			"target",
		),
	).toBe(3);
	// A failed parent won't change, so it doesn't hold the target back.
	expect(
		rowIndexOf(
			rowsFor({ ...cache, big: { ...cache.big, isError: true } }, ["big"]),
			"target",
		),
	).toBe(2);
});

it("keeps the target's index right below open folders with idle next pages", () => {
	const rows = rowsFor(
		{
			root: page(["big", "a", "target"]),
			big: page(["k1", "k2", "k3"], { hasNextPage: true }),
			a: page(["a1"], { hasNextPage: true }),
		},
		["big", "a"],
	);
	expect(rowIndexOf(rows, "target")).toBe(6);
});

it("counts a retry row, and no load row, after a failed listing", () => {
	const rows = rowsFor(
		{
			root: page(["a", "b"]),
			a: page(["a1"], { hasNextPage: true, isError: true }),
		},
		["a"],
	);
	expect(
		rows.map((row) => (row.kind === "folder" ? row.id : row.kind)),
	).toEqual(["a", "a1", "retry", "b"]);
	const failedOutright = rowsFor(
		{ root: page(["a"]), a: { ...page([]), loaded: false, isError: true } },
		["a"],
	);
	expect(failedOutright.map((row) => row.kind)).toEqual(["folder", "retry"]);
});

it("shows nothing for a folder that loaded empty, and ignores collapsed ones", () => {
	const rows = rowsFor({ root: page(["a"]), a: page([]) }, ["a"]);
	expect(rows).toEqual([{ kind: "folder", id: "a" }]);
	expect(rowsFor({ root: page(["a"]) }, [])).toEqual([
		{ kind: "folder", id: "a" },
	]);
});

it("scrolls as little as possible to bring a row into view", () => {
	const view = { rowSize: 36, viewportHeight: 360 };
	// Already fully visible: stay put.
	expect(nearestScrollTop({ ...view, index: 4, scrollTop: 0 })).toBe(0);
	expect(nearestScrollTop({ ...view, index: 9, scrollTop: 0 })).toBe(0);
	// Below the view: its bottom edge meets the viewport's.
	expect(nearestScrollTop({ ...view, index: 10, scrollTop: 0 })).toBe(36);
	expect(nearestScrollTop({ ...view, index: 100, scrollTop: 0 })).toBe(3276);
	// Above the view: its top edge meets the viewport's.
	expect(nearestScrollTop({ ...view, index: 2, scrollTop: 720 })).toBe(72);
	// Partly hidden at the top or bottom counts as out of view.
	expect(nearestScrollTop({ ...view, index: 0, scrollTop: 20 })).toBe(0);
	expect(nearestScrollTop({ ...view, index: 10, scrollTop: 20 })).toBe(36);
});
