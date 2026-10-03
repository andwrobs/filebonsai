import type { Entry, FolderEntry } from "~/lib/catalog/catalog";

/**
 * The docked column's open state is a per-viewer preference kept in this browser only;
 * CFG-04 will sync it later. The drawer and sheet never reopen on their own. What the
 * inspector shows is the listing's selection, so it keeps no entry of its own.
 */
export interface InspectorState {
	dockedOpen: boolean;
	/** The overlay belongs to one folder. */
	folderId: string;
	overlayOpen: boolean;
}

const openKey = "filebonsai.inspector.open";

export function viewerStorage(): Storage | undefined {
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
}

export function readDockedOpen(storage: Pick<Storage, "getItem"> | undefined) {
	try {
		return storage?.getItem(openKey) === "true";
	} catch {
		return false;
	}
}

export function writeDockedOpen(
	storage: Pick<Storage, "setItem"> | undefined,
	open: boolean,
) {
	try {
		storage?.setItem(openKey, String(open));
	} catch {
		// Private windows can refuse storage; the panel still works for this visit.
	}
}

/**
 * What is showing: the one selected entry, a summary of several, or the folder
 * itself when nothing loaded is selected.
 */
export function inspectorView(
	state: InspectorState,
	folder: FolderEntry,
	children: readonly Entry[],
	selected: readonly string[],
	docked: boolean,
) {
	const chosen = children.filter((child) => selected.includes(child.id));
	const here = state.folderId === folder.id;
	return {
		entry: chosen.length === 1 ? chosen[0] : folder,
		/** More than one selected: the panel summarizes them instead. */
		several: chosen.length > 1 ? chosen : null,
		open: docked ? state.dockedOpen : here && state.overlayOpen,
	};
}

/** Moving to another folder or across the docked breakpoint ends any drawer or sheet for good. */
export function settleInspector(
	state: InspectorState,
	folderId: string,
): InspectorState {
	return { ...state, folderId, overlayOpen: false };
}

export function closeInspector(
	state: InspectorState,
	docked: boolean,
): InspectorState {
	return docked
		? { ...state, dockedOpen: false }
		: { ...state, overlayOpen: false };
}

export function openInspector(
	state: InspectorState,
	folderId: string,
	docked: boolean,
): InspectorState {
	return docked
		? { ...state, dockedOpen: true, folderId, overlayOpen: false }
		: { ...state, folderId, overlayOpen: true };
}
