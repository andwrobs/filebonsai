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

it("counts a load row after a listing with a next page and before its siblings' children", () => {
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
	).toEqual(["a", "a1", "loader", "b"]);
	expect(rowIndexOf(rows, "b")).toBe(3);
});

it("counts a load row for a listing that is open but hasn't arrived, and for the root before it is known", () => {
	expect(rowsFor({ root: page(["a"]) }, ["a"]).map((row) => row.kind)).toEqual([
		"folder",
		"loader",
	]);
	expect(rowsFor({}, [], undefined).map((row) => row.kind)).toEqual(["loader"]);
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
