import { expect, it } from "vitest";

import {
	closeInspector,
	type InspectorState,
	inspectorView,
	readDockedOpen,
	settleInspector,
	toggleEntry,
	toggleInspector,
	writeDockedOpen,
} from "./inspector-state";

const folder = (id: string) => ({
	createdAt: "2026-09-21T00:00:00Z",
	id,
	kind: "folder" as const,
	name: `Folder ${id}`,
	parentId: null,
	updatedAt: "2026-09-21T00:00:00Z",
});
const travel = folder("travel");
const recipes = folder("recipes");
const photo = {
	...travel,
	currentVersion: {
		id: "version",
		sha256: null,
		sizeBytes: "5505024",
		storageConnectionName: "Local disk",
	},
	versionCount: 1,
	id: "photo",
	kind: "file" as const,
	name: "IMG_8421.JPG",
	parentId: travel.id,
};
const children = [photo, { ...recipes, parentId: travel.id }];
const closed: InspectorState = {
	dockedOpen: false,
	entryId: null,
	folderId: travel.id,
	overlayOpen: false,
};

it("the docked preference defaults to closed and survives storage that refuses access", () => {
	const values = new Map<string, string>();
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value),
	};
	expect(readDockedOpen(storage)).toBe(false);
	expect(readDockedOpen(undefined)).toBe(false);
	writeDockedOpen(storage, true);
	expect(readDockedOpen(storage)).toBe(true);
	const refusing = {
		getItem: () => {
			throw new Error("SecurityError");
		},
		setItem: () => {
			throw new Error("QuotaExceededError");
		},
	};
	expect(readDockedOpen(refusing)).toBe(false);
	expect(() => writeDockedOpen(refusing, true)).not.toThrow();
});

it("with nothing chosen, or a chosen entry that is gone, the folder itself shows", () => {
	expect(inspectorView(closed, travel, children, true).entry).toBe(travel);
	const gone = { ...closed, dockedOpen: true, entryId: "deleted" };
	expect(inspectorView(gone, travel, children, true)).toEqual({
		entry: travel,
		open: true,
	});
});

it("a row's Details button shows that entry, switches between rows and closes on a second press", () => {
	for (const docked of [true, false]) {
		const shown = toggleEntry(closed, travel, children, docked, photo.id);
		expect(inspectorView(shown, travel, children, docked)).toEqual({
			entry: photo,
			open: true,
		});
		const switched = toggleEntry(shown, travel, children, docked, recipes.id);
		expect(inspectorView(switched, travel, children, docked).entry.id).toBe(
			recipes.id,
		);
		expect(
			inspectorView(
				toggleEntry(switched, travel, children, docked, recipes.id),
				travel,
				children,
				docked,
			).open,
		).toBe(false);
	}
});

it("only the docked column remembers being open; the overlay is per visit", () => {
	expect(toggleEntry(closed, travel, children, true, photo.id).dockedOpen).toBe(
		true,
	);
	const overlay = toggleEntry(closed, travel, children, false, photo.id);
	expect(overlay.dockedOpen).toBe(false);
	expect(closeInspector(overlay, false).overlayOpen).toBe(false);
});

it("the toolbar toggle reopens on the last entry chosen in this folder only", () => {
	const shown = toggleEntry(closed, travel, children, false, photo.id);
	const hidden = toggleInspector(shown, travel, children, false);
	expect(inspectorView(hidden, travel, children, false).open).toBe(false);
	expect(
		inspectorView(
			toggleInspector(hidden, travel, children, false),
			travel,
			children,
			false,
		),
	).toEqual({ entry: photo, open: true });
	// After navigating, the overlay starts closed and a reopen shows the new folder.
	expect(inspectorView(shown, recipes, [], false)).toEqual({
		entry: recipes,
		open: false,
	});
	expect(
		inspectorView(
			toggleInspector(shown, recipes, [], false),
			recipes,
			[],
			false,
		),
	).toEqual({ entry: recipes, open: true });
});

it("a drawer or sheet left behind does not come back with the folder or the breakpoint", () => {
	const shown = toggleEntry(closed, travel, children, false, recipes.id);
	// Open folder, then Back: the overlay stays closed and nothing is still chosen.
	const back = settleInspector(settleInspector(shown, recipes.id), travel.id);
	expect(inspectorView(back, travel, children, false)).toEqual({
		entry: travel,
		open: false,
	});
	// Widening past the breakpoint and narrowing again keeps the choice but not the overlay.
	const narrowedAgain = settleInspector(shown, travel.id);
	const view = inspectorView(narrowedAgain, travel, children, false);
	expect({ entry: view.entry.id, open: view.open }).toEqual({
		entry: recipes.id,
		open: false,
	});
});

it("an open docked column stays open across folders and shows each folder", () => {
	const docked = toggleEntry(closed, travel, children, true, photo.id);
	expect(inspectorView(docked, recipes, [], true)).toEqual({
		entry: recipes,
		open: true,
	});
});
