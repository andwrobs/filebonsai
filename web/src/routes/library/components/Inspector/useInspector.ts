import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Entry, FolderEntry } from "~/lib/catalog/catalog";
import {
	closeInspector,
	type InspectorState,
	inspectorView,
	openInspector,
	readDockedOpen,
	settleInspector,
	viewerStorage,
	writeDockedOpen,
} from "../../inspector-state";

// Matches the wide shell: the sidebar and a docked inspector need this width.
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

/** The listing's selection, which the inspector shows. */
interface Selected {
	selected: readonly string[];
	selectOnly(entryId: string): void;
}

// One owner for the toolbar toggle, the rows' Details buttons, and the panel.
export function useInspector(
	folder: FolderEntry,
	children: readonly Entry[],
	selection: Selected,
) {
	const docked = useDocked();
	const [state, setState] = useState<InspectorState>(() => ({
		dockedOpen: readDockedOpen(viewerStorage()),
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
	const view = inspectorView(
		state,
		folder,
		children,
		selection.selected,
		docked,
	);

	function close() {
		setState(closeInspector(state, docked));
		setRestorePending(true);
	}

	// Whatever was pressed last, opening or closing, is where focus comes back to.
	function open(trigger: HTMLElement) {
		opener.current = trigger;
		focusRequest.current = true;
		setState(openInspector(state, folder.id, docked));
	}
	function closeFrom(trigger: HTMLElement) {
		opener.current = trigger;
		close();
	}

	return {
		...view,
		close,
		docked,
		focusRequest,
		isFolder: view.entry.id === folder.id,
		toggleButton,
		toggle: (trigger: HTMLElement) =>
			view.open ? closeFrom(trigger) : open(trigger),
		/** A row's Details button: show that entry alone, or close when it already is. */
		toggleEntry: (entryId: string, trigger: HTMLElement) => {
			if (view.open && view.entry.id === entryId) return closeFrom(trigger);
			selection.selectOnly(entryId);
			open(trigger);
		},
	};
}
