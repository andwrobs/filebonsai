import type { Entry, FolderEntry } from "../../../src/lib/api/api-types.js";

/**
 * The docked column's open state is a per-viewer preference kept in this browser only;
 * CFG-04 will sync it later. The drawer and sheet never reopen on their own.
 */
export interface InspectorState {
  dockedOpen: boolean;
  /** Null shows the folder itself. The target and overlay belong to one folder. */
  entryId: string | null;
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

export function writeDockedOpen(storage: Pick<Storage, "setItem"> | undefined, open: boolean) {
  try {
    storage?.setItem(openKey, String(open));
  } catch {
    // Private windows can refuse storage; the panel still works for this visit.
  }
}

/** What is showing: the chosen child, or the folder itself when nothing here matches. */
export function inspectorView(state: InspectorState, folder: FolderEntry, children: readonly Entry[], docked: boolean) {
  const here = state.folderId === folder.id;
  const entry: Entry = (here && state.entryId ? children.find((child) => child.id === state.entryId) : undefined) ?? folder;
  return { entry, open: docked ? state.dockedOpen : here && state.overlayOpen };
}

/** Moving to another folder or across the docked breakpoint ends any drawer or sheet for good. */
export function settleInspector(state: InspectorState, folderId: string): InspectorState {
  return { ...state, entryId: state.folderId === folderId ? state.entryId : null, folderId, overlayOpen: false };
}

export function closeInspector(state: InspectorState, docked: boolean): InspectorState {
  return docked ? { ...state, dockedOpen: false } : { ...state, overlayOpen: false };
}

function show(state: InspectorState, folderId: string, entryId: string | null, docked: boolean): InspectorState {
  return docked
    ? { ...state, dockedOpen: true, entryId, folderId, overlayOpen: false }
    : { ...state, entryId, folderId, overlayOpen: true };
}

/** A row's Details button: show that entry, or close when it is already showing. */
export function toggleEntry(state: InspectorState, folder: FolderEntry, children: readonly Entry[], docked: boolean, entryId: string) {
  const view = inspectorView(state, folder, children, docked);
  return view.open && view.entry.id === entryId ? closeInspector(state, docked) : show(state, folder.id, entryId, docked);
}

/** The toolbar toggle: close, or reopen on the last entry chosen in this folder. */
export function toggleInspector(state: InspectorState, folder: FolderEntry, children: readonly Entry[], docked: boolean) {
  if (inspectorView(state, folder, children, docked).open) return closeInspector(state, docked);
  return show(state, folder.id, state.folderId === folder.id ? state.entryId : null, docked);
}
