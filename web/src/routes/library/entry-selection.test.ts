import { expect, it } from "vitest";
import {
	entryTarget,
	escapeClearsSelection,
	loadedSelection,
	movesFocusOnly,
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

it("tells focus movement from selection keys", () => {
	const key = (key: string, modifiers: Partial<KeyboardEvent> = {}) => ({
		key,
		shiftKey: false,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		...modifiers,
	});
	for (const k of ["ArrowDown", "ArrowLeft", "Home", "PageDown", "n"]) {
		expect(movesFocusOnly(key(k))).toBe(true);
	}
	expect(movesFocusOnly(key(" "))).toBe(false);
	expect(movesFocusOnly(key("Enter"))).toBe(false);
	expect(movesFocusOnly(key("ArrowDown", { shiftKey: true }))).toBe(false);
	expect(movesFocusOnly(key("a", { ctrlKey: true }))).toBe(false);
});

it("leaves Escape to fields, overlays, and handlers that claimed it", () => {
	const pressEscape = (target: Element, claimed = false) => {
		const event = new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true,
			cancelable: true,
		});
		if (claimed) event.preventDefault();
		let result: boolean | undefined;
		target.addEventListener("keydown", (e) => {
			result = escapeClearsSelection(e as KeyboardEvent);
		});
		target.dispatchEvent(event);
		return result;
	};
	document.body.innerHTML = `<input id="field"><div role="menu"><button id="item"></button></div><button id="plain"></button>`;
	const byId = (id: string) => document.getElementById(id) as Element;
	expect(pressEscape(byId("plain"))).toBe(true);
	expect(pressEscape(byId("plain"), true)).toBe(false);
	expect(pressEscape(byId("field"))).toBe(false);
	expect(pressEscape(byId("item"))).toBe(false);
});
