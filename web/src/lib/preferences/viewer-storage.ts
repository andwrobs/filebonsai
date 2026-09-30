import type { StateStorage } from "zustand/middleware";

/**
 * This browser's local storage for per-viewer preferences, such as which
 * folders the tree shows open or the Library's view. Storage can be missing or
 * throw (private windows, blocked site data); a preference then lasts only for
 * this visit. CFG-04 will sync preferences across devices later.
 */
export const viewerStorage: StateStorage = {
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
