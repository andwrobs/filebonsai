import assert from "node:assert/strict";
import { test } from "node:test";

import {
  closeInspector,
  inspectorView,
  readDockedOpen,
  settleInspector,
  toggleEntry,
  toggleInspector,
  writeDockedOpen,
  type InspectorState,
} from "./inspector-state.js";

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
  currentVersion: { id: "version", sizeBytes: "5505024" },
  id: "photo",
  kind: "file" as const,
  name: "IMG_8421.JPG",
  parentId: travel.id,
};
const children = [photo, { ...recipes, parentId: travel.id }];
const closed: InspectorState = { dockedOpen: false, entryId: null, folderId: travel.id, overlayOpen: false };

test("the docked preference defaults to closed and survives storage that refuses access", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
  assert.equal(readDockedOpen(storage), false);
  assert.equal(readDockedOpen(undefined), false);
  writeDockedOpen(storage, true);
  assert.equal(readDockedOpen(storage), true);
  const refusing = {
    getItem: () => { throw new Error("SecurityError"); },
    setItem: () => { throw new Error("QuotaExceededError"); },
  };
  assert.equal(readDockedOpen(refusing), false);
  assert.doesNotThrow(() => writeDockedOpen(refusing, true));
});

test("with nothing chosen, or a chosen entry that is gone, the folder itself shows", () => {
  assert.equal(inspectorView(closed, travel, children, true).entry, travel);
  const gone = { ...closed, dockedOpen: true, entryId: "deleted" };
  assert.deepEqual(inspectorView(gone, travel, children, true), { entry: travel, open: true });
});

test("a row's Details button shows that entry, switches between rows and closes on a second press", () => {
  for (const docked of [true, false]) {
    const shown = toggleEntry(closed, travel, children, docked, photo.id);
    assert.deepEqual(inspectorView(shown, travel, children, docked), { entry: photo, open: true });
    const switched = toggleEntry(shown, travel, children, docked, recipes.id);
    assert.equal(inspectorView(switched, travel, children, docked).entry.id, recipes.id);
    assert.equal(inspectorView(toggleEntry(switched, travel, children, docked, recipes.id), travel, children, docked).open, false);
  }
});

test("only the docked column remembers being open; the overlay is per visit", () => {
  assert.equal(toggleEntry(closed, travel, children, true, photo.id).dockedOpen, true);
  const overlay = toggleEntry(closed, travel, children, false, photo.id);
  assert.equal(overlay.dockedOpen, false);
  assert.equal(closeInspector(overlay, false).overlayOpen, false);
});

test("the toolbar toggle reopens on the last entry chosen in this folder only", () => {
  const shown = toggleEntry(closed, travel, children, false, photo.id);
  const hidden = toggleInspector(shown, travel, children, false);
  assert.equal(inspectorView(hidden, travel, children, false).open, false);
  assert.deepEqual(inspectorView(toggleInspector(hidden, travel, children, false), travel, children, false), { entry: photo, open: true });
  // After navigating, the overlay starts closed and a reopen shows the new folder.
  assert.deepEqual(inspectorView(shown, recipes, [], false), { entry: recipes, open: false });
  assert.deepEqual(inspectorView(toggleInspector(shown, recipes, [], false), recipes, [], false), { entry: recipes, open: true });
});

test("a drawer or sheet left behind does not come back with the folder or the breakpoint", () => {
  const shown = toggleEntry(closed, travel, children, false, recipes.id);
  // Open folder, then Back: the overlay stays closed and nothing is still chosen.
  const back = settleInspector(settleInspector(shown, recipes.id), travel.id);
  assert.deepEqual(inspectorView(back, travel, children, false), { entry: travel, open: false });
  // Widening past the breakpoint and narrowing again keeps the choice but not the overlay.
  const narrowedAgain = settleInspector(shown, travel.id);
  const view = inspectorView(narrowedAgain, travel, children, false);
  assert.deepEqual({ entry: view.entry.id, open: view.open }, { entry: recipes.id, open: false });
});

test("an open docked column stays open across folders and shows each folder", () => {
  const docked = toggleEntry(closed, travel, children, true, photo.id);
  assert.deepEqual(inspectorView(docked, recipes, [], true), { entry: recipes, open: true });
});
