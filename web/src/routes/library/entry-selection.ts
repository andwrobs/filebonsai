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
 * A key that only moves focus in a collection: arrows, Home/End, paging, and
 * type-ahead letters. React Aria's "replace" behavior would select whatever
 * they reach; Filebonsai keeps focus and selection apart. Shift extends and
 * Space selects, so those still count.
 */
export function movesFocusOnly(event: {
	key: string;
	shiftKey: boolean;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
}): boolean {
	if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
		return false;
	}
	if (navigationKeys.has(event.key)) return true;
	return event.key.length === 1 && event.key !== " ";
}

const navigationKeys = new Set([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End",
	"PageUp",
	"PageDown",
]);

/**
 * Whether a page-level Escape belongs to the selection. A field, a menu, a
 * dialog, or anything that already handled the key keeps it.
 */
export function escapeClearsSelection(event: KeyboardEvent): boolean {
	if (event.key !== "Escape" || event.defaultPrevented) return false;
	const target = event.target;
	if (!(target instanceof Element)) return true;
	if (target.closest(ownsEscape)) return false;
	return !(target instanceof HTMLElement && target.isContentEditable);
}

const ownsEscape = [
	"input",
	"textarea",
	"select",
	"dialog",
	'[role="dialog"]',
	'[role="alertdialog"]',
	'[role="menu"]',
	'[role="listbox"]',
	'[role="combobox"]',
].join(",");
