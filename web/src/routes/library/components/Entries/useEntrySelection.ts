import {
	type FocusEvent,
	type KeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import type { Key, Selection } from "react-aria-components";
import type { Entry } from "~/lib/catalog/catalog";
import {
	entryTarget,
	escapeClearsSelection,
	loadedSelection,
	movesFocusOnly,
	selectedInOrder,
} from "../../entry-selection";

/** The props every entry collection (table, grid, rows) takes for selection. */
export interface CollectionSelection {
	selectionMode: "multiple";
	/**
	 * "replace": click selects one, Cmd/Ctrl toggles, Shift extends, and
	 * double-click or Enter opens. "toggle" is touch selection mode: taps toggle.
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
	/** Capture handlers for the element around the collection. */
	guard: {
		onPointerDownCapture(): void;
		onKeyDownCapture(event: KeyboardEvent): void;
		onFocusCapture(event: FocusEvent): void;
	};
	selectAll(): void;
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
 * The current folder's selection, separate from keyboard focus and from the
 * inspected entry. It belongs to one folder: another folder starts empty, and
 * leaving the Library (sign-out, another workspace) discards it. IDs that are
 * no longer loaded stop counting, so a refresh prunes removed entries.
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
	const clear = () => set(new Set(), false);

	// React Aria's "replace" behavior selects whatever focus reaches. Drop
	// those proposals: arrows and type-ahead move focus, and focus arriving
	// from outside (Tab, or the inspector returning it) selects nothing.
	const guard = useRef({ ignore: false, pointer: false });
	const ignoreThisEvent = () => {
		guard.current.ignore = true;
		queueMicrotask(() => {
			guard.current.ignore = false;
		});
	};

	const hasSelection = selected.length > 0;
	useEffect(() => {
		if (!hasSelection) return;
		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			if (!escapeClearsSelection(event)) return;
			setState((previous) => ({
				...previous,
				keys: new Set(),
				selecting: false,
			}));
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [hasSelection]);

	return {
		selected,
		selecting,
		collection: {
			selectionMode: "multiple",
			selectionBehavior: selecting ? "toggle" : "replace",
			selectedKeys: keys,
			onSelectionChange: (selection) => {
				if (guard.current.ignore) return;
				set(loadedSelection(selection, entries));
			},
		},
		guard: {
			onPointerDownCapture: () => {
				guard.current.pointer = true;
				const release = () => {
					// After the press's own handlers, which may select.
					setTimeout(() => {
						guard.current.pointer = false;
					});
				};
				window.addEventListener("pointerup", release, {
					capture: true,
					once: true,
				});
				window.addEventListener("pointercancel", release, {
					capture: true,
					once: true,
				});
			},
			onKeyDownCapture: (event) => {
				if (movesFocusOnly(event)) ignoreThisEvent();
			},
			onFocusCapture: (event) => {
				const from = event.relatedTarget;
				const inside =
					from instanceof Node && event.currentTarget.contains(from);
				if (!inside && !guard.current.pointer) ignoreThisEvent();
			},
		},
		selectAll: () => set(new Set(entries.map(({ id }) => id))),
		clear,
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
