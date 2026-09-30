import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useExpandedFolders } from "./expanded-folders.store";

const storageKey = "filebonsai:folder-tree:v1";

beforeEach(() => {
	localStorage.clear();
	useExpandedFolders.setState({ expanded: [] });
});
afterEach(() => vi.unstubAllGlobals());

const ids = (count: number, from = 0) =>
	Array.from({ length: count }, (_, index) => `folder-${from + index}`);

it("keeps the 500 most recently expanded folders", () => {
	useExpandedFolders.getState().setExpanded(new Set(ids(500)));
	useExpandedFolders.getState().reveal(["extra"]);
	const { expanded } = useExpandedFolders.getState();
	expect(expanded).toHaveLength(500);
	expect(expanded[0]).toBe("folder-1");
	expect(expanded.at(-1)).toBe("extra");

	useExpandedFolders.getState().setExpanded(new Set(ids(600)));
	expect(useExpandedFolders.getState().expanded).toEqual(ids(500, 100));
});

it("reveals only what is missing, in order, and repeats harmlessly", () => {
	const store = useExpandedFolders.getState();
	store.setExpanded(new Set(["a"]));
	store.reveal(["a", "b", "c"]);
	expect(useExpandedFolders.getState().expanded).toEqual(["a", "b", "c"]);
	const before = useExpandedFolders.getState().expanded;
	store.reveal(["b", "c"]);
	expect(useExpandedFolders.getState().expanded).toBe(before);
});

it("persists expansion under a versioned key", async () => {
	useExpandedFolders.getState().reveal(["a", "b"]);
	expect(JSON.parse(localStorage.getItem(storageKey) ?? "null")).toEqual({
		state: { expanded: ["a", "b"] },
		version: 1,
	});
	// A reload starts from an empty store and reads what was saved.
	const saved = localStorage.getItem(storageKey) ?? "";
	useExpandedFolders.setState({ expanded: [] });
	localStorage.setItem(storageKey, saved);
	await useExpandedFolders.persist.rehydrate();
	expect(useExpandedFolders.getState().expanded).toEqual(["a", "b"]);
});

it("keeps working when storage throws", async () => {
	const failing = {
		getItem: () => {
			throw new Error("blocked");
		},
		setItem: () => {
			throw new Error("blocked");
		},
		removeItem: () => {
			throw new Error("blocked");
		},
	};
	vi.stubGlobal("localStorage", failing);
	await useExpandedFolders.persist.rehydrate();
	useExpandedFolders.getState().reveal(["a"]);
	expect(useExpandedFolders.getState().expanded).toEqual(["a"]);
});
