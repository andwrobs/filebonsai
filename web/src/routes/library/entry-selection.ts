import type { Key, Selection } from "react-aria-components";

// Pure rules for the Library's entry selection. useEntrySelection owns the state
// and its lifecycle; the views only render it.

/** Selected IDs that are loaded, in the order they are displayed. */
export function selectedInOrder(
	keys: ReadonlySet<Key>,
	entries: readonly { id: string }[],
): string[] {
	return entries.filter((entry) => keys.has(entry.id)).map(({ id }) => id);
}

/**
 * What a collection proposed, limited to loaded entries. React Aria's "all"
 * means every loaded entry, never ones a later page might bring.
 */
export function loadedSelection(
	selection: Selection,
	entries: readonly { id: string }[],
): Set<Key> {
	const loaded = new Set<Key>(entries.map(({ id }) => id));
	if (selection === "all") return loaded;
	// Keep React Aria's own set when it can: it carries the Shift anchor.
	if ([...selection].every((key) => loaded.has(key))) return selection;
	return new Set([...selection].filter((key) => loaded.has(key)));
}

/**
 * Who an entry's context action (LIB-22) applies to. A selected entry acts for
 * the whole selection, which stays as it is; an unselected entry becomes the
 * only selection.
 */
export function entryTarget(
	selected: readonly string[],
	entryId: string,
): { selection: readonly string[]; targets: readonly string[] } {
	if (selected.includes(entryId)) {
		return { selection: selected, targets: selected };
	}
	return { selection: [entryId], targets: [entryId] };
}

/**
 * Whether a click landed on empty space, which clears the selection as in
 * Drive or Finder. Entries, controls, fields and the inspector keep it.
 */
export function isEmptySpace(target: EventTarget | null): boolean {
	return target instanceof Element && !target.closest(keepsSelection);
}

const keepsSelection = [
	"a",
	"button",
	"input",
	"label",
	"select",
	"textarea",
	"aside",
	"dialog",
	'[role="row"]',
	'[role="columnheader"]',
	'[role="toolbar"]',
	'[role="dialog"]',
	'[role="menu"]',
].join(",");
