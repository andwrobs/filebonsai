import { QueryClient } from "@tanstack/react-query";
import {
	act,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useNavigate, useParams } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { catalogKeys, folderQuery } from "~/lib/catalog/catalog.query";
import { renderRoute } from "../../../../../test-utils/render-route";
import { apiError, stubApi } from "../../../../../test-utils/stub-api";
import { stubVirtualLayout } from "../../../../../test-utils/virtual-layout";
import { useExpandedFolders } from "./expanded-folders.store";
import { FolderTree } from "./FolderTree";

const stamp = "2026-09-21T00:00:00Z";
const entry = (
	id: string,
	name: string,
	parentId: string | null,
	kind: "folder" | "file" = "folder",
) => ({
	ancestors: [],
	createdAt: stamp,
	id,
	kind,
	name,
	parentId,
	updatedAt: stamp,
});
const root = entry("root", "Library", null);
const travel = entry("travel", "Travel", "root");
const taxes = entry("taxes", "Taxes", "root");
const music = entry("music", "Music", "root");
const europe = entry("europe", "Europe", "travel");
const italy = entry("italy", "Italy", "europe");
const receipt = entry("receipt", "receipt.pdf", "root", "file");

type Pages = Record<string, object[][]>;

// Serves a tree of folders; `pages` lists each parent's children page by page.
function serveTree(pages: Pages) {
	return (path: string, request: Request) => {
		const url = new URL(request.url);
		if (path === "/api/v1/catalog/root") return Response.json(root);
		const children = path.match(/^\/api\/v1\/entries\/([^/]+)\/children$/);
		if (children) {
			const parent = pages[children[1] as string] ?? [[]];
			const cursor = url.searchParams.get("cursor");
			const index = cursor ? Number(cursor.replace("page-", "")) : 0;
			return Response.json({
				entries: parent[index] ?? [],
				nextCursor: index + 1 < parent.length ? `page-${index + 1}` : null,
			});
		}
		return apiError(404, "ENTRY_NOT_FOUND");
	};
}

const observers = new Set<{
	callback: IntersectionObserverCallback;
	element?: Element;
}>();

let restoreLayout = () => {};

beforeEach(() => {
	restoreLayout = stubVirtualLayout();
	localStorage.clear();
	useExpandedFolders.setState({ expanded: [] });
	observers.clear();
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			entry: { callback: IntersectionObserverCallback; element?: Element };
			constructor(callback: IntersectionObserverCallback) {
				this.entry = { callback };
				observers.add(this.entry);
			}
			observe(element: Element) {
				this.entry.element = element;
			}
			unobserve() {}
			disconnect() {
				observers.delete(this.entry);
			}
		},
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	restoreLayout();
});

// Report every sentinel as scrolled into view.
function scrollToEnd() {
	act(() => {
		for (const { callback, element } of [...observers]) {
			callback(
				[
					{
						isIntersecting: true,
						target: element,
					} as IntersectionObserverEntry,
				],
				{} as IntersectionObserver,
			);
		}
	});
}

// Scrolls the tree the way a browser does: move, then announce it.
function scrollTreeTo(top: number) {
	const tree = screen.getByRole("treegrid");
	act(() => {
		tree.scrollTop = top;
		tree.dispatchEvent(new Event("scroll"));
	});
}

// The shell derives the current folder from the URL; so does this harness.
function Harness() {
	const { entryId } = useParams();
	const navigate = useNavigate();
	return (
		<>
			<FolderTree currentId={entryId} />
			<button onClick={() => navigate("/library/root")} type="button">
				Go to root
			</button>
		</>
	);
}

function renderTree(
	pages: Pages,
	{
		at = "/library/root",
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		}),
		serve = serveTree(pages),
	}: {
		at?: string;
		queryClient?: QueryClient;
		serve?: ReturnType<typeof serveTree>;
	} = {},
) {
	const api = stubApi(serve);
	const view = renderRoute(
		[{ path: "/library/:entryId", Component: Harness }],
		{
			initialEntries: [at],
			queryClient,
		},
	);
	return { ...view, ...api };
}

// The tree's own listings; the Library's folder query asks for children too.
const treeListings = (requests: Request[], id: string) =>
	requests.filter(
		(request) =>
			new URL(request.url).pathname === `/api/v1/entries/${id}/children` &&
			new URL(request.url).searchParams.get("kind") === "folder",
	);

const row = (name: string | RegExp) => screen.getByRole("row", { name });
const topLevel: Pages = {
	root: [[travel, taxes, music, receipt]],
	travel: [[europe]],
	europe: [[italy]],
	italy: [[]],
	taxes: [[]],
};

it("lists the root's subfolders as rows of a labelled tree, one page of 100", async () => {
	const { requests } = renderTree(topLevel);
	const tree = await screen.findByRole("treegrid", { name: "Folders" });
	await screen.findByRole("row", { name: "Travel" });
	expect(
		screen.getAllByRole("row").map((item) => item.getAttribute("aria-label")),
	).toEqual(["Travel", "Taxes", "Music"]);
	expect(tree).toBeInTheDocument();
	const params = new URL(treeListings(requests, "root")[0]?.url ?? "")
		.searchParams;
	expect(params.get("kind")).toBe("folder");
	expect(params.get("limit")).toBe("100");
	// A cursor is bound to foldersFirst, so the tree never sends it.
	expect(params.has("foldersFirst")).toBe(false);
	// Rows are links, and only opened folders have been asked for their children.
	expect(row("Travel")).toHaveAttribute("data-href", "/library/travel");
	expect(
		requests.some((request) => request.url.includes("/entries/travel/")),
	).toBe(false);
});

it("moves focus with the arrow keys, Home, and End", async () => {
	const { user } = renderTree(topLevel);
	await screen.findByRole("row", { name: "Travel" });
	await user.tab();
	expect(row("Travel")).toHaveFocus();
	await user.keyboard("{ArrowDown}");
	expect(row("Taxes")).toHaveFocus();
	await user.keyboard("{ArrowUp}");
	expect(row("Travel")).toHaveFocus();
	await user.keyboard("{End}");
	expect(row("Music")).toHaveFocus();
	await user.keyboard("{Home}");
	expect(row("Travel")).toHaveFocus();
});

it("expands with ArrowRight, collapses with ArrowLeft, and steps out to the parent", async () => {
	const { user, requests } = renderTree(topLevel);
	await screen.findByRole("row", { name: "Travel" });
	expect(row("Travel")).toHaveAttribute("aria-expanded", "false");
	await user.tab();
	await user.keyboard("{ArrowRight}");
	expect(row("Travel")).toHaveAttribute("aria-expanded", "true");
	expect(await screen.findByRole("row", { name: "Europe" })).toHaveAttribute(
		"aria-level",
		"2",
	);
	expect(treeListings(requests, "travel")).toHaveLength(1);

	await user.keyboard("{ArrowDown}");
	expect(row("Europe")).toHaveFocus();
	await user.keyboard("{ArrowLeft}");
	expect(row("Travel")).toHaveFocus();
	await user.keyboard("{ArrowLeft}");
	expect(row("Travel")).toHaveAttribute("aria-expanded", "false");
	expect(screen.queryByRole("row", { name: "Europe" })).not.toBeInTheDocument();
});

it("opens a folder in the Library on Enter", async () => {
	const { user } = renderTree(topLevel);
	await screen.findByRole("row", { name: "Travel" });
	await user.tab();
	await user.keyboard("{ArrowDown}{Enter}");
	expect(screen.getByLabelText("Test location")).toHaveTextContent(
		"/library/taxes",
	);
});

it("stops offering to expand a folder once it has no subfolders", async () => {
	const { user } = renderTree(topLevel);
	await screen.findByRole("row", { name: "Taxes" });
	expect(row("Taxes")).toHaveAttribute("aria-expanded", "false");
	await user.tab();
	await user.keyboard("{ArrowDown}{ArrowRight}");
	await waitFor(() =>
		expect(row("Taxes")).not.toHaveAttribute("aria-expanded"),
	);
	expect(row("Taxes")).not.toHaveAttribute("data-has-child-items");
});

it("mounts only the rows in view and loads the next page when the end scrolls into view", async () => {
	const first = Array.from({ length: 100 }, (_, index) =>
		entry(`a-${index}`, `Album ${index}`, "root"),
	);
	const second = [entry("z-0", "Zeta", "root"), entry("z-1", "Zulu", "root")];
	const { requests } = renderTree({ root: [first, second] });
	await screen.findByRole("row", { name: "Album 0" });
	// 600px of 36px rows, plus a little overscan.
	expect(screen.getAllByRole("row").length).toBeLessThan(40);
	expect(
		screen.queryByRole("row", { name: "Album 99" }),
	).not.toBeInTheDocument();

	scrollTreeTo(100 * 36);
	expect(
		await screen.findByRole("row", { name: "Album 99" }),
	).toBeInTheDocument();
	// The end is in view, but nobody has scrolled or typed yet.
	scrollToEnd();
	await settle();
	expect(treeListings(requests, "root")).toHaveLength(1);
	fireEvent.wheel(screen.getByRole("treegrid"));
	scrollToEnd();
	await waitFor(() => expect(treeListings(requests, "root")).toHaveLength(2));
	expect(
		new URL(treeListings(requests, "root")[1]?.url ?? "").searchParams.get(
			"cursor",
		),
	).toBe("page-1");
	scrollTreeTo(102 * 36);
	expect(await screen.findByRole("row", { name: "Zulu" })).toBeInTheDocument();
	// The last page has no next cursor, so nothing more is asked for.
	scrollToEnd();
	expect(treeListings(requests, "root")).toHaveLength(2);
});

it("offers a retry row when a folder's children fail to load", async () => {
	let fail = true;
	const serve = serveTree(topLevel);
	const { user } = renderTree(topLevel, {
		serve: (path, request) =>
			fail && path === "/api/v1/entries/travel/children"
				? apiError(500, "SERVER_ERROR")
				: serve(path, request),
	});
	await screen.findByRole("row", { name: "Travel" });
	await user.tab();
	await user.keyboard("{ArrowRight}");
	await screen.findByRole("row", { name: "Retry loading folders" });
	expect(row("Travel")).toHaveAttribute("aria-expanded", "true");
	fail = false;
	await user.keyboard("{ArrowDown}{Enter}");
	expect(
		await screen.findByRole("row", { name: "Europe" }),
	).toBeInTheDocument();
	expect(
		screen.queryByRole("row", { name: "Retry loading folders" }),
	).not.toBeInTheDocument();
});

it("opens every ancestor of the current folder and marks its row", async () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	queryClient.setQueryData(folderQuery("italy").queryKey, {
		folder: {
			...italy,
			kind: "folder" as const,
			ancestors: [
				{ id: "root", name: "Library" },
				{ id: "travel", name: "Travel" },
				{ id: "europe", name: "Europe" },
			],
		},
		children: [],
		nextCursor: null,
	});
	renderTree(topLevel, { at: "/library/italy", queryClient });
	const current = await screen.findByRole("row", {
		name: "Italy, current folder",
	});
	expect(current).toHaveAttribute("data-current", "true");
	expect(current).toHaveAttribute("aria-level", "3");
	expect(row("Travel")).toHaveAttribute("aria-expanded", "true");
	expect(row("Europe")).toHaveAttribute("aria-expanded", "true");
	// Revealing never moves focus.
	expect(document.body).toHaveFocus();
	expect(useExpandedFolders.getState().expanded).toEqual(["travel", "europe"]);
});

it("pages toward the current folder and scrolls it into view without moving focus", async () => {
	restoreLayout();
	// A scroll height tall enough for every row the virtualizer will lay out.
	restoreLayout = stubVirtualLayout({ scrollHeight: 10_000 });
	const first = Array.from({ length: 100 }, (_, index) =>
		entry(`a-${index}`, `Album ${index}`, "root"),
	);
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	queryClient.setQueryData(folderQuery("z-0").queryKey, {
		folder: {
			...entry("z-0", "Zeta", "root"),
			kind: "folder" as const,
			ancestors: [{ id: "root", name: "Library" }],
		},
		children: [],
		nextCursor: null,
	});
	renderTree(
		{ root: [first, [entry("z-0", "Zeta", "root")]], "z-0": [[]] },
		{ at: "/library/z-0", queryClient },
	);
	const tree = screen.getByRole("treegrid");
	// Row 100 (after 100 albums) bottoms out at 3,636px; the view is 600px tall.
	await waitFor(() => expect(tree.scrollTop).toBe(101 * 36 - 600));
	scrollTreeTo(tree.scrollTop);
	expect(
		await screen.findByRole("row", { name: "Zeta, current folder" }),
	).toBeInTheDocument();
	expect(document.body).toHaveFocus();
});

it("reveals a current folder after more than ten sibling pages", async () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	queryClient.setQueryData(folderQuery("travel").queryKey, {
		folder: {
			...travel,
			kind: "folder" as const,
			ancestors: [{ id: "root", name: "Library" }],
		},
		children: [],
		nextCursor: null,
	});
	const pages = Array.from({ length: 11 }, (_, index) => [
		entry(`sibling-${index}`, `Sibling ${index}`, "root"),
	]);
	pages.push([travel]);
	const { requests } = renderTree(
		{ root: pages },
		{
			at: "/library/travel",
			queryClient,
		},
	);
	expect(
		await screen.findByRole("row", { name: "Travel, current folder" }),
	).toBeInTheDocument();
	expect(treeListings(requests, "root")).toHaveLength(12);
	expect(document.body).toHaveFocus();
});

it("remembers which folders are open across a remount", async () => {
	const first = renderTree(topLevel);
	await screen.findByRole("row", { name: "Travel" });
	await first.user.tab();
	await first.user.keyboard("{ArrowRight}");
	await screen.findByRole("row", { name: "Europe" });
	first.unmount();

	// A reload starts from an empty store and reads what was saved.
	const saved = localStorage.getItem("filebonsai:folder-tree:v1") ?? "";
	useExpandedFolders.setState({ expanded: [] });
	localStorage.setItem("filebonsai:folder-tree:v1", saved);
	await useExpandedFolders.persist.rehydrate();

	renderTree(topLevel);
	expect(
		await screen.findByRole("row", { name: "Europe" }),
	).toBeInTheDocument();
	expect(row("Travel")).toHaveAttribute("aria-expanded", "true");
});

it("refreshes a folder's subfolders when that folder is invalidated", async () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const pages: Pages = { ...topLevel, travel: [[europe]] };
	const { user } = renderTree(pages, { queryClient });
	await screen.findByRole("row", { name: "Travel" });
	await user.tab();
	await user.keyboard("{ArrowRight}");
	await screen.findByRole("row", { name: "Europe" });

	pages.travel = [[europe, entry("asia", "Asia", "travel")]];
	await act(() =>
		queryClient.invalidateQueries({ queryKey: catalogKeys.folder("travel") }),
	);
	expect(await screen.findByRole("row", { name: "Asia" })).toBeInTheDocument();
});

it("keeps only folders from a server that ignores the kind filter", async () => {
	renderTree({ root: [[travel, receipt]] });
	await screen.findByRole("row", { name: "Travel" });
	expect(
		screen.queryByRole("row", { name: "receipt.pdf" }),
	).not.toBeInTheDocument();
});

// Zeta is the 101st top-level folder, so finding it takes a second page.
function deepFolder() {
	const first = Array.from({ length: 100 }, (_, index) =>
		entry(`a-${index}`, `Album ${index}`, "root"),
	);
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	queryClient.setQueryData(folderQuery("z-0").queryKey, {
		folder: {
			...entry("z-0", "Zeta", "root"),
			kind: "folder" as const,
			ancestors: [{ id: "root", name: "Library" }],
		},
		children: [],
		nextCursor: null,
	});
	const pages = { root: [first, [entry("z-0", "Zeta", "root")]], "z-0": [[]] };
	return { pages, queryClient, at: "/library/z-0" };
}

// A scroll height the test raises once it wants the virtualizer "grown".
function growableScrollHeight() {
	const size = { height: 0 };
	Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
		configurable: true,
		get: () => size.height,
	});
	return size;
}

const settle = () => act(() => new Promise((done) => setTimeout(done, 120)));

it("stops scrolling to the current folder once the user scrolls or types", async () => {
	restoreLayout();
	restoreLayout = stubVirtualLayout({ scrollHeight: 10_000 });
	const { pages, queryClient, at } = deepFolder();
	const { requests } = renderTree(pages, { at, queryClient });
	const tree = screen.getByRole("treegrid");
	fireEvent.wheel(tree);
	await waitFor(() => expect(treeListings(requests, "root")).toHaveLength(2));
	await settle();
	expect(tree.scrollTop).toBe(0);
});

it("drops a pending scroll when the tree unmounts", async () => {
	restoreLayout();
	restoreLayout = stubVirtualLayout();
	const height = growableScrollHeight();
	const { pages, queryClient, at } = deepFolder();
	const view = renderTree(pages, { at, queryClient });
	const tree = screen.getByRole("treegrid");
	await waitFor(() =>
		expect(treeListings(view.requests, "root")).toHaveLength(2),
	);
	await settle();
	view.unmount();
	height.height = 10_000;
	await settle();
	expect(tree.scrollTop).toBe(0);
});

it("drops a pending scroll when the current folder changes", async () => {
	restoreLayout();
	restoreLayout = stubVirtualLayout();
	const height = growableScrollHeight();
	const { pages, queryClient, at } = deepFolder();
	const { requests, user } = renderTree(pages, { at, queryClient });
	const tree = screen.getByRole("treegrid");
	await waitFor(() => expect(treeListings(requests, "root")).toHaveLength(2));
	await settle();
	await user.click(screen.getByRole("button", { name: "Go to root" }));
	height.height = 10_000;
	await settle();
	expect(tree.scrollTop).toBe(0);
});

it("leaves an ancestor the user closed closed when the folder is refetched", async () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const listing = {
		folder: {
			...italy,
			kind: "folder" as const,
			ancestors: [
				{ id: "root", name: "Library" },
				{ id: "travel", name: "Travel" },
				{ id: "europe", name: "Europe" },
			],
		},
		children: [],
		nextCursor: null,
	};
	queryClient.setQueryData(folderQuery("italy").queryKey, listing);
	const { user } = renderTree(topLevel, { at: "/library/italy", queryClient });
	await screen.findByRole("row", { name: "Italy, current folder" });
	await user.click(
		within(row("Europe")).getByRole("button", { name: /collapse/i }),
	);
	expect(row("Europe")).toHaveAttribute("aria-expanded", "false");

	// A refetch hands back the folder as a new object (it was renamed or touched).
	act(() => {
		queryClient.setQueryData(folderQuery("italy").queryKey, {
			...listing,
			folder: { ...listing.folder, updatedAt: "2026-09-22T00:00:00Z" },
		});
	});
	await settle();
	expect(row("Europe")).toHaveAttribute("aria-expanded", "false");
});
