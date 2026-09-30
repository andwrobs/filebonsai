import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { viewerStorage } from "~/lib/preferences/viewer-storage";

export type EntryView = "table" | "grid";

export interface EntryViewPreference {
	view: EntryView;
	setView(view: EntryView): void;
}

// Table or grid is a per-viewer preference for every folder, kept in this
// browser; CFG-05 may add per-folder views later.
export const useEntryView = create<EntryViewPreference>()(
	persist(
		(set) => ({
			view: "table",
			setView: (view) => set({ view }),
		}),
		{
			name: "filebonsai:library-view:v1",
			version: 1,
			storage: createJSONStorage(() => viewerStorage),
			partialize: ({ view }) => ({ view }),
			// Stored text can be stale or edited; anything unknown means the table.
			merge: (persisted, current) => {
				const stored = (persisted as { view?: unknown } | null)?.view;
				return { ...current, view: stored === "grid" ? "grid" : "table" };
			},
		},
	),
);
