import { useState } from "react";
import type { Key, Selection } from "react-aria-components";
import type { Entry } from "~/lib/catalog/catalog";
import {
	entryTarget,
	loadedSelection,
	selectedInOrder,
} from "../../entry-selection";

/** The props every entry collection (table, grid, rows) takes for selection. */
export interface CollectionSelection {
	selectionMode: "multiple";
	/**
	 * "replace": click selects one, Cmd/Ctrl toggles, Shift extends, arrows move
	 * the selection, Escape clears, and double-click or Enter opens. "toggle" is
	 * touch selection mode: taps toggle.
	 */
	selectionBehavior: "replace" | "toggle";
	selectedKeys: Set<Key>;
	onSelectionChange(selection: Selection): void;
}

export interface EntrySelection {
	/** Selected entry IDs that are loaded, in display order. */
	selected: readonly string[];
	/** Touch selection mode: taps toggle and folders don't open. */
	selecting: boolean;
	collection: CollectionSelection;
	selectAll(): void;
	/** Make one entry the whole selection. */
	selectOnly(entryId: string): void;
	clear(): void;
	/** The visible Select action on touch. */
	startSelecting(): void;
	/**
	 * LIB-22's targeting rule for an entry's context action: a selected entry
	 * acts for the whole selection; an unselected one becomes the selection.
	 */
	target(entryId: string): readonly string[];
}

interface State {
	folderId: string;
	keys: Set<Key>;
	selecting: boolean;
}

/**
 * The current folder's selection, which the inspector shows. It belongs to one
 * folder: another folder starts empty, and leaving the Library (sign-out,
 * another workspace) discards it. IDs that are no longer loaded stop counting,
 * so a refresh prunes removed entries.
 */
export function useEntrySelection({
	entries,
	folderId,
	touch,
}: {
	entries: readonly Entry[];
	folderId: string;
	/** Phones select by tapping in an explicit mode. */
	touch: boolean;
}): EntrySelection {
	const [state, setState] = useState<State>(() => empty(folderId));
	const current = state.folderId === folderId ? state : empty(folderId);
	const selected = selectedInOrder(current.keys, entries);
	const keys =
		selected.length === current.keys.size
			? current.keys
			: new Set<Key>(selected);
	const selecting = touch && (current.selecting || selected.length > 0);

	const set = (next: Set<Key>, nextSelecting = current.selecting) =>
		setState({ folderId, keys: next, selecting: nextSelecting });

	return {
		selected,
		selecting,
		collection: {
			selectionMode: "multiple",
			selectionBehavior: selecting ? "toggle" : "replace",
			selectedKeys: keys,
			onSelectionChange: (selection) =>
				set(loadedSelection(selection, entries)),
		},
		selectAll: () => set(new Set(entries.map(({ id }) => id))),
		selectOnly: (entryId) => set(new Set([entryId])),
		clear: () => set(new Set(), false),
		startSelecting: () => set(keys, true),
		target: (entryId) => {
			const { selection, targets } = entryTarget(selected, entryId);
			if (selection !== selected) set(new Set(selection));
			return targets;
		},
	};
}

function empty(folderId: string): State {
	return { folderId, keys: new Set(), selecting: false };
}
