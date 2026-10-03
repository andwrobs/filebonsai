import { expect, it } from "vitest";

import {
	closeInspector,
	type InspectorState,
	inspectorView,
	openInspector,
	readDockedOpen,
	settleInspector,
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
	family: "image",
	kind: "file" as const,
	name: "IMG_8421.JPG",
	parentId: travel.id,
};
const children = [photo, { ...recipes, parentId: travel.id }];
const closed: InspectorState = {
	dockedOpen: false,
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

it("shows the one selected entry, a summary of several, or the folder", () => {
	const open = openInspector(closed, travel.id, true);
	expect(inspectorView(open, travel, children, [], true)).toEqual({
		entry: travel,
		several: null,
		open: true,
	});
	expect(inspectorView(open, travel, children, ["photo"], true).entry).toBe(
		photo,
	);
	// A selected ID that is no longer loaded shows the folder.
	expect(inspectorView(open, travel, children, ["deleted"], true).entry).toBe(
		travel,
	);
	const both = inspectorView(
		open,
		travel,
		children,
		["photo", "recipes"],
		true,
	);
	expect(both.entry).toBe(travel);
	expect(both.several?.map(({ id }) => id)).toEqual(["photo", "recipes"]);
});

it("only the docked column remembers being open; the overlay is per visit", () => {
	expect(openInspector(closed, travel.id, true).dockedOpen).toBe(true);
	const overlay = openInspector(closed, travel.id, false);
	expect(overlay.dockedOpen).toBe(false);
	expect(closeInspector(overlay, false).overlayOpen).toBe(false);
});

it("a drawer or sheet left behind does not come back with the folder or the breakpoint", () => {
	const shown = openInspector(closed, travel.id, false);
	const back = settleInspector(settleInspector(shown, recipes.id), travel.id);
	expect(inspectorView(back, travel, children, [], false).open).toBe(false);
	expect(inspectorView(shown, recipes, [], [], false).open).toBe(false);
});

it("an open docked column stays open across folders and shows each folder", () => {
	const docked = openInspector(closed, travel.id, true);
	expect(inspectorView(docked, recipes, [], [], true)).toEqual({
		entry: recipes,
		several: null,
		open: true,
	});
});
