import type { Key } from "react-aria-components";
import { create } from "zustand";
import {
	createJSONStorage,
	persist,
	type StateStorage,
} from "zustand/middleware";

const maxExpanded = 500;

// Storage can be missing or throw (private windows, blocked site data); the
// tree then just forgets what was expanded.
const safeLocalStorage: StateStorage = {
	getItem: (name) => {
		try {
			return localStorage.getItem(name);
		} catch {
			return null;
		}
	},
	setItem: (name, value) => {
		try {
			localStorage.setItem(name, value);
		} catch {
			// Not remembering is acceptable.
		}
	},
	removeItem: (name) => {
		try {
			localStorage.removeItem(name);
		} catch {
			// Nothing to remove.
		}
	},
};

export interface ExpandedFolders {
	/** Folder IDs, least recently expanded first; at most 500. */
	expanded: string[];
	/** Takes the tree's expanded set, whose iteration order is expansion order. */
	setExpanded(keys: Iterable<Key>): void;
	/** Expands the folders not yet expanded, keeping every existing choice. */
	reveal(ids: readonly string[]): void;
}

const newest = (ids: string[]) => ids.slice(-maxExpanded);

// Which folders the tree shows open. IDs aren't secrets; the sidebar tree and
// the sheet tree share one list, and every reload restores it.
export const useExpandedFolders = create<ExpandedFolders>()(
	persist(
		(set) => ({
			expanded: [],
			setExpanded: (keys) =>
				set({ expanded: newest([...keys].map((key) => String(key))) }),
			reveal: (ids) =>
				set((state) => {
					const missing = ids.filter((id) => !state.expanded.includes(id));
					return missing.length === 0
						? state
						: { expanded: newest([...state.expanded, ...missing]) };
				}),
		}),
		{
			name: "filebonsai:folder-tree:v1",
			version: 1,
			storage: createJSONStorage(() => safeLocalStorage),
			partialize: ({ expanded }) => ({ expanded }),
			// Stored text can be stale or edited; anything but a list of strings
			// falls back to nothing expanded.
			merge: (persisted, current) => {
				const stored = (persisted as { expanded?: unknown } | null)?.expanded;
				const valid =
					Array.isArray(stored) &&
					stored.every((id): id is string => typeof id === "string");
				return { ...current, expanded: valid ? newest(stored) : [] };
			},
		},
	),
);
