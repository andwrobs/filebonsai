import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Entry, FolderEntry } from "~/lib/catalog/catalog";
import {
	closeInspector,
	type InspectorState,
	inspectorView,
	readDockedOpen,
	settleInspector,
	toggleEntry,
	toggleInspector,
	viewerStorage,
	writeDockedOpen,
} from "../../inspector-state";

// Matches the shell breakpoint in app.css: the sidebar and a docked inspector need this width.
const wideScreen = "(min-width: 1100px)";

function subscribeToWidth(notify: () => void) {
	const query = window.matchMedia(wideScreen);
	query.addEventListener("change", notify);
	return () => query.removeEventListener("change", notify);
}

function useDocked() {
	return useSyncExternalStore(
		subscribeToWidth,
		() => window.matchMedia(wideScreen).matches,
		() => true,
	);
}

export type Inspector = ReturnType<typeof useInspector>;

// One owner for the toolbar toggle, the rows' Details buttons, and the panel.
export function useInspector(folder: FolderEntry, children: readonly Entry[]) {
	const docked = useDocked();
	const [state, setState] = useState<InspectorState>(() => ({
		dockedOpen: readDockedOpen(viewerStorage()),
		entryId: null,
		folderId: folder.id,
		overlayOpen: false,
	}));
	const [layout, setLayout] = useState({ docked, folderId: folder.id });
	const [restorePending, setRestorePending] = useState(false);
	const opener = useRef<HTMLElement | null>(null);
	const focusRequest = useRef(false);
	const toggleButton = useRef<HTMLButtonElement>(null);
	// Settle during render so a stale drawer or sheet never mounts, not even for one frame.
	if (layout.docked !== docked || layout.folderId !== folder.id) {
		setLayout({ docked, folderId: folder.id });
		if (state.overlayOpen) setRestorePending(true);
		setState(settleInspector(state, folder.id));
	}
	useEffect(
		() => writeDockedOpen(viewerStorage(), state.dockedOpen),
		[state.dockedOpen],
	);
	// After the close commits: a modal dialog keeps the page inert until it is gone.
	useEffect(() => {
		if (!restorePending) return;
		setRestorePending(false);
		const target = opener.current;
		opener.current = null;
		// The opener can vanish (a folder reloads); the toolbar toggle is always there.
		(target?.isConnected ? target : toggleButton.current)?.focus();
	}, [restorePending]);
	const view = inspectorView(state, folder, children, docked);

	function close() {
		setState(closeInspector(state, docked));
		setRestorePending(true);
	}

	// Whatever was pressed last, opening or closing, is where focus comes back to.
	function apply(next: InspectorState, trigger: HTMLElement) {
		opener.current = trigger;
		if (!inspectorView(next, folder, children, docked).open) return close();
		focusRequest.current = true;
		setState(next);
	}

	return {
		...view,
		close,
		docked,
		focusRequest,
		isFolder: view.entry.id === folder.id,
		toggleButton,
		toggle: (trigger: HTMLElement) =>
			apply(toggleInspector(state, folder, children, docked), trigger),
		toggleEntry: (entryId: string, trigger: HTMLElement) =>
			apply(toggleEntry(state, folder, children, docked, entryId), trigger),
	};
}
