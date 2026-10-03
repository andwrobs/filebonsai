import { expect, it } from "vitest";
import {
	entryTarget,
	isEmptySpace,
	loadedSelection,
	selectedInOrder,
} from "./entry-selection";

const entries = [{ id: "a" }, { id: "b" }, { id: "c" }];

it("counts only loaded entries, in display order", () => {
	expect(selectedInOrder(new Set(["c", "gone", "a"]), entries)).toEqual([
		"a",
		"c",
	]);
});

it("scopes select-all to loaded entries and drops stale IDs", () => {
	expect([...loadedSelection("all", entries)]).toEqual(["a", "b", "c"]);
	const proposed = new Set(["b", "gone"]);
	expect([...loadedSelection(proposed, entries)]).toEqual(["b"]);
	const loaded = new Set(["b"]);
	expect(loadedSelection(loaded, entries)).toBe(loaded);
});

it("targets the whole selection from a selected entry, or only an unselected one", () => {
	const selected = ["a", "c"];
	expect(entryTarget(selected, "c")).toEqual({
		selection: selected,
		targets: selected,
	});
	expect(entryTarget(selected, "b")).toEqual({
		selection: ["b"],
		targets: ["b"],
	});
	expect(entryTarget([], "b").targets).toEqual(["b"]);
});

it("clears on empty space, never on an entry, a control or the inspector", () => {
	document.body.innerHTML = `<main id="page"><p id="text">Items</p><table><tr role="row"><td id="cell"></td></tr></table><button id="button"><svg id="icon"></svg></button><aside><p id="details"></p></aside></main>`;
	const byId = (id: string) => document.getElementById(id);
	expect(isEmptySpace(byId("page"))).toBe(true);
	expect(isEmptySpace(byId("text"))).toBe(true);
	expect(isEmptySpace(byId("cell"))).toBe(false);
	expect(isEmptySpace(byId("icon"))).toBe(false);
	expect(isEmptySpace(byId("details"))).toBe(false);
	expect(isEmptySpace(null)).toBe(false);
});
