import { act, screen, within } from "@testing-library/react";
import type { LoaderFunctionArgs } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { firstPageQuery } from "~/lib/catalog/catalog.query";
import { queryClient } from "~/lib/query/client";
import { renderRoute } from "../../../test-utils/render-route";
import { apiError, csrf, stubApi } from "../../../test-utils/stub-api";
import type { Route } from "./+types/library.route";
import LibraryRoute, {
	clientLoader,
	ErrorBoundary,
	meta,
} from "./library.route";

const root = {
	ancestors: [],
	createdAt: "2026-09-21T00:00:00Z",
	id: "root",
	kind: "folder",
	name: "Library",
	parentId: null,
	updatedAt: "2026-09-21T00:00:00Z",
	revision: 1,
};
const travel = {
	...root,
	ancestors: [{ id: "root", name: "Library" }],
	id: "travel",
	name: "Travel",
	parentId: "root",
};
const photo = {
	...root,
	id: "photo",
	kind: "file",
	name: "IMG_8421.JPG",
	parentId: "root",
	currentVersion: {
		id: "v1",
		sha256: "4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358",
		sizeBytes: "5505024",
		storageConnectionName: "Local disk",
	},
	versionCount: 1,
};

beforeEach(() => {
	queryClient.clear();
	// jsdom has no layout; report a wide screen so the inspector docks.
	vi.stubGlobal("matchMedia", () => ({
		matches: true,
		addEventListener() {},
		removeEventListener() {},
	}));
});
afterEach(() => vi.unstubAllGlobals());

function renderLibrary(entryId = "root") {
	return renderRoute(
		[
			{
				path: "/library/:entryId",
				Component: LibraryRoute,
				// The stub types params loosely; the path above supplies entryId.
				loader: (args: LoaderFunctionArgs) =>
					clientLoader(args as unknown as Route.ClientLoaderArgs),
				meta,
				ErrorBoundary,
			},
			{ path: "/sign-in", Component: () => <h1>Sign in</h1> },
		],
		{ initialEntries: [`/library/${entryId}`], queryClient },
	);
}

function serveFolder(children: () => object[]) {
	return (path: string) => {
		if (path === "/api/v1/entries/root") return Response.json(root);
		if (path === "/api/v1/entries/root/children") {
			return Response.json({ entries: children(), nextCursor: null });
		}
		if (path === "/api/v1/entries/photo") return Response.json(photo);
		return apiError(404, "ENTRY_NOT_FOUND");
	};
}

it("lists a folder's entries with their kind and size", async () => {
	stubApi(serveFolder(() => [travel, photo]));
	renderLibrary();
	expect(
		await screen.findByRole("heading", { level: 1, name: "Library" }),
	).toBeInTheDocument();
	expect(document.title).toBe("Library · Filebonsai");
	const table = screen.getByRole("grid", { name: "Items" });
	const [header, ...rows] = within(table).getAllByRole("row");
	expect(
		within(header as HTMLElement)
			.getAllByRole("columnheader")
			.map((column) => column.textContent),
	).toEqual(["Name", "Kind", "Size", "Modified", "Actions"]);
	expect(rows).toHaveLength(2);
	expect(rows[0]).toHaveAccessibleName("Travel");
	expect(rows[0]).toHaveAttribute("data-href", "/library/travel");
	expect(
		within(rows[1] as HTMLElement).getByText("5.2 MB"),
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Download IMG_8421.JPG" }),
	).toBeInTheDocument();
	expect(screen.getByText("2 items")).toBeInTheDocument();
});

it("offers ways to fill an empty folder", async () => {
	stubApi(serveFolder(() => []));
	renderLibrary();
	expect(await screen.findByText("This folder is empty")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Create folder" }),
	).toBeInTheDocument();
});

it("navigates a nested folder through its ancestors and collapsed parent menu", async () => {
	const albums = {
		...travel,
		ancestors: [
			{ id: "root", name: "Library" },
			{ id: "travel", name: "Travel" },
		],
		id: "albums",
		name: "Albums",
		parentId: "travel",
	};
	const summer = {
		...albums,
		ancestors: [...albums.ancestors, { id: "albums", name: "Albums" }],
		id: "summer",
		name: "Summer photographs with a very long folder name",
		parentId: "albums",
	};
	stubApi((path) => {
		const folders = { root, travel, albums, summer };
		const id = path.replace("/api/v1/entries/", "");
		if (id in folders)
			return Response.json(folders[id as keyof typeof folders]);
		if (id.endsWith("/children")) {
			return Response.json({ entries: [], nextCursor: null });
		}
		return apiError(404, "ENTRY_NOT_FOUND");
	});
	const { user } = renderLibrary("summer");
	const path = await screen.findByRole("navigation", { name: "Folder path" });
	expect(within(path).getByRole("link", { name: "Library" })).toHaveAttribute(
		"href",
		"/library/root",
	);
	expect(within(path).getByRole("link", { name: "Albums" })).toHaveAttribute(
		"href",
		"/library/albums",
	);
	expect(
		within(path).getByRole("heading", { name: summer.name }),
	).toHaveAttribute("title", summer.name);
	await user.click(
		within(path).getByRole("button", { name: "More parent folders" }),
	);
	await user.click(await screen.findByRole("menuitem", { name: "Travel" }));
	expect(
		await screen.findByRole("heading", { level: 1, name: "Travel" }),
	).toBeInTheDocument();
	await user.click(screen.getByRole("link", { name: "Library" }));
	expect(
		await screen.findByRole("heading", { level: 1, name: "Library" }),
	).toBeInTheDocument();
});

it("creates a folder with an idempotency key and shows it after the refresh", async () => {
	const children: object[] = [];
	const serve = serveFolder(() => children);
	const { requests } = stubApi((path, request) => {
		if (path === "/api/v1/auth/csrf") return csrf();
		if (path === "/api/v1/folders" && request.method === "POST") {
			const created = { ...travel, id: "photos", name: "Photos" };
			children.push(created);
			return Response.json(created, { status: 201 });
		}
		return serve(path);
	});
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("button", { name: "New folder" }));
	const form = screen.getByRole("region", { name: "Create folder" });
	await user.type(within(form).getByLabelText("Folder name"), "Photos");
	await user.click(within(form).getByRole("button", { name: "Create folder" }));
	expect(
		await screen.findByRole("row", { name: "Photos" }),
	).toBeInTheDocument();
	expect(screen.queryByLabelText("Folder name")).not.toBeInTheDocument();
	const post = requests.find((request) => request.method === "POST");
	expect(post?.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
	expect(post?.headers.get("X-CSRF-TOKEN")).toBe("test-csrf");
});

it("keeps the form open and names a duplicate", async () => {
	stubApi((path, request) => {
		if (path === "/api/v1/auth/csrf") return csrf();
		if (request.method === "POST") return apiError(409, "NAME_CONFLICT");
		return serveFolder(() => [travel])(path);
	});
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("button", { name: "New folder" }));
	await user.type(screen.getByLabelText("Folder name"), "Travel");
	await user.click(screen.getByRole("button", { name: "Create folder" }));
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"An entry with that name already exists in this folder.",
	);
	expect(screen.getByLabelText("Folder name")).toHaveValue("Travel");
});

it("keeps an invalid folder name in the labelled field and blocks submission", async () => {
	const { requests } = stubApi(serveFolder(() => []));
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("button", { name: "New folder" }));
	const name = screen.getByRole("textbox", { name: "Folder name" });
	await user.type(name, "Draft");
	await user.clear(name);
	expect(name).toHaveAttribute("aria-invalid", "true");
	expect(name).toHaveAccessibleDescription("Enter a folder name.");
	expect(
		within(screen.getByRole("region", { name: "Create folder" })).getByRole(
			"button",
			{ name: "Create folder" },
		),
	).toBeDisabled();
	expect(requests.some((request) => request.method === "POST")).toBe(false);
});

it("sends a signed-out visitor to sign in", async () => {
	stubApi(() => apiError(401, "AUTH_REQUIRED"));
	renderLibrary();
	expect(
		await screen.findByRole("heading", { name: "Sign in" }),
	).toBeInTheDocument();
	expect(screen.getByLabelText("Test location")).toHaveTextContent("/sign-in");
});

it("names a missing folder", async () => {
	stubApi(serveFolder(() => []));
	renderLibrary("gone");
	expect(
		await screen.findByRole("heading", {
			name: "This folder is not available.",
		}),
	).toBeInTheDocument();
	expect(
		screen.getByRole("link", { name: "Return to Library" }),
	).toHaveAttribute("href", "/");
});

it("treats a file at a folder address as missing", async () => {
	stubApi((path) =>
		path === "/api/v1/entries/photo/children"
			? Response.json({ entries: [], nextCursor: null })
			: serveFolder(() => [])(path),
	);
	renderLibrary("photo");
	expect(
		await screen.findByRole("heading", {
			name: "This folder is not available.",
		}),
	).toBeInTheDocument();
});

it("lets a late reply refresh its own folder without closing the next folder's form", async () => {
	let reply!: () => void;
	const replied = new Promise<void>((resolve) => {
		reply = resolve;
	});
	const serve = serveFolder(() => [travel]);
	stubApi(async (path) => {
		if (path === "/api/v1/auth/csrf") return csrf();
		if (path === "/api/v1/folders") {
			await replied;
			return Response.json(
				{ ...travel, id: "photos", name: "Photos" },
				{ status: 201 },
			);
		}
		if (path === "/api/v1/entries/travel") return Response.json(travel);
		if (path === "/api/v1/entries/travel/children") {
			return Response.json({ entries: [], nextCursor: null });
		}
		return serve(path);
	});
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("button", { name: "New folder" }));
	await user.type(screen.getByLabelText("Folder name"), "Photos");
	await user.click(
		within(screen.getByRole("region", { name: "Create folder" })).getByRole(
			"button",
			{ name: "Create folder" },
		),
	);
	await user.dblClick(screen.getByRole("row", { name: "Travel" }));
	expect(
		await screen.findByRole("heading", { level: 1, name: "Travel" }),
	).toBeInTheDocument();
	const nextForm = screen.getByLabelText("Folder name");
	expect(nextForm).toHaveValue("");

	reply();
	await vi.waitFor(() =>
		expect(
			queryClient.getQueryState(firstPageQuery("root").queryKey)?.isInvalidated,
		).toBe(true),
	);
	expect(screen.getByLabelText("Folder name")).toBe(nextForm);
});

it("shows a file's versions, storage connection and copyable digest", async () => {
	const legacy = {
		...photo,
		currentVersion: { ...photo.currentVersion, id: "v0", sha256: null },
		id: "legacy",
		name: "scan.tiff",
		versionCount: 3,
	};
	stubApi(serveFolder(() => [photo, legacy]));
	const { user } = renderLibrary();
	await user.click(
		await screen.findByRole("button", { name: "Details for IMG_8421.JPG" }),
	);
	const details = screen.getByRole("complementary", { name: "Details" });
	const field = (term: string) =>
		within(details).getByText(term, { selector: "dt" }).nextElementSibling;
	expect(field("Versions")).toHaveTextContent("1");
	expect(field("Stored on")).toHaveTextContent("Local disk");
	expect(field("SHA-256")).toHaveTextContent(photo.currentVersion.sha256);
	expect(
		within(details).getByRole("button", { name: "Copy SHA-256" }),
	).toBeInTheDocument();

	await user.click(
		screen.getByRole("button", { name: "Details for scan.tiff" }),
	);
	expect(field("Versions")).toHaveTextContent("3");
	expect(field("SHA-256")).toHaveTextContent("Not recorded");
	expect(
		within(details).queryByRole("button", { name: "Copy SHA-256" }),
	).not.toBeInTheDocument();
});

const childrenSearches = (requests: Request[]) =>
	requests
		.map((request) => new URL(request.url))
		.filter((url) => url.pathname === "/api/v1/entries/root/children")
		.map((url) => url.search);

it("sorts from the table headers through the server and the URL", async () => {
	const { requests } = stubApi(serveFolder(() => [travel, photo]));
	const { user } = renderLibrary();
	const modified = await screen.findByRole("columnheader", {
		name: "Modified",
	});
	const name = screen.getByRole("columnheader", { name: "Name" });
	expect(name).toHaveAttribute("aria-sort", "ascending");
	expect(
		screen.getByRole("columnheader", { name: "Kind" }),
	).not.toHaveAttribute("aria-sort");

	// A new field starts newest first; pressing it again flips it.
	await user.click(modified);
	await vi.waitFor(() =>
		expect(modified).toHaveAttribute("aria-sort", "descending"),
	);
	expect(screen.getByLabelText("Test location")).toHaveTextContent(
		"/library/root?sort=updatedAt&order=desc",
	);
	await user.click(modified);
	await vi.waitFor(() =>
		expect(modified).toHaveAttribute("aria-sort", "ascending"),
	);
	expect(childrenSearches(requests)).toEqual([
		"?sort=name&order=asc&foldersFirst=false",
		"?sort=updatedAt&order=desc&foldersFirst=false",
		"?sort=updatedAt&order=asc&foldersFirst=false",
	]);
});

it("composes header clicks while the first sort request is still pending", async () => {
	let release = () => {};
	const delayed = new Promise<void>((resolve) => {
		release = resolve;
	});
	const serve = serveFolder(() => [travel, photo]);
	const { requests } = stubApi(async (path, request) => {
		const search = new URL(request.url).searchParams;
		if (
			path.endsWith("/children") &&
			search.get("sort") === "size" &&
			search.get("order") === "desc"
		)
			await delayed;
		return serve(path);
	});
	const { user } = renderLibrary();
	const size = await screen.findByRole("columnheader", { name: "Size" });
	await user.click(size);
	await vi.waitFor(() =>
		expect(childrenSearches(requests)).toContain(
			"?sort=size&order=desc&foldersFirst=false",
		),
	);
	await user.click(size);
	try {
		await vi.waitFor(() =>
			expect(size).toHaveAttribute("aria-sort", "ascending"),
		);
		expect(screen.getByLabelText("Test location")).toHaveTextContent(
			"/library/root?sort=size",
		);
	} finally {
		release();
	}
});

it("preserves pending grouping when a sort field is chosen", async () => {
	let release = () => {};
	const delayed = new Promise<void>((resolve) => {
		release = resolve;
	});
	const serve = serveFolder(() => [travel, photo]);
	const { requests } = stubApi(async (path, request) => {
		const search = new URL(request.url).searchParams;
		if (
			path.endsWith("/children") &&
			search.get("sort") === "name" &&
			search.get("foldersFirst") === "true"
		)
			await delayed;
		return serve(path);
	});
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("button", { name: "Sort" }));
	await user.click(
		screen.getByRole("menuitemcheckbox", { name: "Folders first" }),
	);
	await vi.waitFor(() =>
		expect(childrenSearches(requests)).toContain(
			"?sort=name&order=asc&foldersFirst=true",
		),
	);
	await user.click(screen.getByRole("menuitemradio", { name: "Size" }));
	try {
		await vi.waitFor(() =>
			expect(screen.getByLabelText("Test location")).toHaveTextContent(
				"/library/root?sort=size&order=desc&folders=first",
			),
		);
	} finally {
		release();
	}
});

it.each([
	"field",
	"grouping",
] as const)("can reverse a pending menu %s choice", async (choice) => {
	let release = () => {};
	const delayed = new Promise<void>((resolve) => {
		release = resolve;
	});
	const serve = serveFolder(() => [travel, photo]);
	const { requests } = stubApi(async (path, request) => {
		const search = new URL(request.url).searchParams;
		if (
			path.endsWith("/children") &&
			(choice === "field"
				? search.get("sort") === "size"
				: search.get("foldersFirst") === "true")
		)
			await delayed;
		return serve(path);
	});
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("button", { name: "Sort" }));
	try {
		if (choice === "field") {
			await user.click(screen.getByRole("menuitemradio", { name: "Size" }));
			await vi.waitFor(() =>
				expect(childrenSearches(requests)).toContain(
					"?sort=size&order=desc&foldersFirst=false",
				),
			);
			await user.click(screen.getByRole("button", { name: "Sort" }));
			expect(
				screen.getByRole("menuitemradio", { name: "Size" }),
			).toHaveAttribute("aria-checked", "true");
			await user.click(screen.getByRole("menuitemradio", { name: "Name" }));
			await user.click(screen.getByRole("button", { name: "Sort" }));
			expect(
				screen.getByRole("menuitemradio", { name: "Name" }),
			).toHaveAttribute("aria-checked", "true");
		} else {
			const grouping = screen.getByRole("menuitemcheckbox", {
				name: "Folders first",
			});
			await user.click(grouping);
			await vi.waitFor(() =>
				expect(childrenSearches(requests)).toContain(
					"?sort=name&order=asc&foldersFirst=true",
				),
			);
			expect(grouping).toHaveAttribute("aria-checked", "true");
			await user.click(grouping);
			expect(grouping).toHaveAttribute("aria-checked", "false");
		}
		await vi.waitFor(() =>
			expect(screen.getByLabelText("Test location")).toHaveTextContent(
				/^\/library\/root$/,
			),
		);
	} finally {
		await act(async () => {
			release();
			await delayed;
		});
	}
});

it("loads the order in the URL and ignores values it doesn't know", async () => {
	const { requests } = stubApi(serveFolder(() => [travel, photo]));
	renderLibrary("root?sort=size&order=desc&folders=first");
	expect(
		await screen.findByRole("columnheader", { name: "Size" }),
	).toHaveAttribute("aria-sort", "descending");
	queryClient.clear();

	renderLibrary("root?sort=kind&order=sideways");
	await vi.waitFor(() => expect(childrenSearches(requests)).toHaveLength(2));
	expect(childrenSearches(requests)).toEqual([
		"?sort=size&order=desc&foldersFirst=true",
		"?sort=name&order=asc&foldersFirst=false",
	]);
});

it("sorts from the menu, including folders first", async () => {
	const { requests } = stubApi(serveFolder(() => [travel, photo]));
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("button", { name: "Sort" }));
	await user.click(
		screen.getByRole("menuitemcheckbox", { name: "Folders first" }),
	);
	// A checkbox item leaves the menu open for another choice.
	await user.keyboard("{Escape}");
	await vi.waitFor(() =>
		expect(screen.getByLabelText("Test location")).toHaveTextContent(
			"/library/root?folders=first",
		),
	);
	await user.click(screen.getByRole("button", { name: "Sort" }));
	await user.click(screen.getByRole("menuitemradio", { name: "Size" }));
	await user.click(screen.getByRole("button", { name: "Sort" }));
	expect(
		screen.getByRole("menuitemradio", { name: "Largest first" }),
	).toHaveAttribute("aria-checked", "true");
	expect(childrenSearches(requests).at(-1)).toBe(
		"?sort=size&order=desc&foldersFirst=true",
	);
});

it("switches to a grid and remembers it for this viewer", async () => {
	localStorage.clear();
	stubApi(serveFolder(() => [travel, photo]));
	const { user } = renderLibrary();
	await screen.findByRole("columnheader", { name: "Name" });
	await user.click(screen.getByRole("radio", { name: "Grid" }));
	expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
	const grid = screen.getByRole("grid", { name: "Items" });
	expect(grid).toHaveAttribute("data-layout", "grid");
	expect(within(grid).getByRole("row", { name: "Travel" })).toHaveAttribute(
		"data-href",
		"/library/travel",
	);
	expect(
		within(grid).getByRole("button", { name: "Download IMG_8421.JPG" }),
	).toBeInTheDocument();
	expect(
		JSON.parse(localStorage.getItem("filebonsai:library-view:v1") ?? "{}"),
	).toMatchObject({ state: { view: "grid" } });
	await user.click(screen.getByRole("radio", { name: "Table" }));
	expect(
		screen.getByRole("columnheader", { name: "Name" }),
	).toBeInTheDocument();
});

it("shows rows and no view choice on a phone", async () => {
	vi.stubGlobal("matchMedia", () => ({
		matches: false,
		addEventListener() {},
		removeEventListener() {},
	}));
	stubApi(serveFolder(() => [travel, photo]));
	renderLibrary();
	const list = await screen.findByRole("grid", { name: "Items" });
	expect(list).toHaveAttribute("data-layout", "stack");
	expect(within(list).getByText(/^5\.2 MB · /)).toBeInTheDocument();
	expect(screen.queryByRole("radio", { name: "Grid" })).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Sort" })).toBeInTheDocument();
});

it("moves between rows with the arrow keys and opens a folder with Enter", async () => {
	stubApi((path) =>
		path === "/api/v1/entries/travel"
			? Response.json(travel)
			: path === "/api/v1/entries/travel/children"
				? Response.json({ entries: [], nextCursor: null })
				: serveFolder(() => [photo, travel])(path),
	);
	const { user } = renderLibrary();
	const photoRow = await screen.findByRole("row", { name: "IMG_8421.JPG" });
	act(() => photoRow.focus());
	await user.keyboard("{ArrowDown}");
	expect(screen.getByRole("row", { name: "Travel" })).toHaveFocus();
	await user.keyboard("{Enter}");
	expect(
		await screen.findByRole("heading", { level: 1, name: "Travel" }),
	).toBeInTheDocument();
});

const notes = {
	...photo,
	id: "notes",
	name: "notes.txt",
	currentVersion: { ...photo.currentVersion, id: "v2", sizeBytes: "12" },
};

function selectedNames() {
	return screen
		.getAllByRole("row")
		.filter((row) => row.getAttribute("aria-selected") === "true")
		.map((row) => row.getAttribute("data-key"));
}

it("selects one, toggles, and extends a range without opening a folder", async () => {
	stubApi(serveFolder(() => [travel, photo, notes]));
	const { user } = renderLibrary();
	const grid = await screen.findByRole("grid", { name: "Items" });
	expect(grid).toHaveAttribute("aria-multiselectable", "true");

	await user.click(screen.getByRole("row", { name: "Travel" }));
	expect(selectedNames()).toEqual(["travel"]);
	expect(screen.getByText("1 selected")).toHaveAttribute("role", "status");
	expect(
		screen.getByRole("heading", { level: 1, name: "Library" }),
	).toBeVisible();

	await user.keyboard("{Control>}");
	await user.click(screen.getByRole("row", { name: "notes.txt" }));
	await user.keyboard("{/Control}");
	expect(selectedNames()).toEqual(["travel", "notes"]);

	await user.click(screen.getByRole("row", { name: "IMG_8421.JPG" }));
	await user.keyboard("{Shift>}");
	await user.click(screen.getByRole("row", { name: "notes.txt" }));
	await user.keyboard("{/Shift}");
	expect(selectedNames()).toEqual(["photo", "notes"]);

	await user.click(screen.getByRole("button", { name: "Clear" }));
	expect(selectedNames()).toEqual([]);
	expect(screen.getByText("3 items")).toHaveAttribute("role", "status");
	expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
});

it("moves and extends the selection from the keyboard", async () => {
	stubApi(serveFolder(() => [travel, photo, notes]));
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("row", { name: "Travel" }));
	expect(selectedNames()).toEqual(["travel"]);

	// Arrows move the selection, as in Drive and Finder; Shift extends it.
	await user.keyboard("{ArrowDown}");
	expect(screen.getByRole("row", { name: "IMG_8421.JPG" })).toHaveFocus();
	expect(selectedNames()).toEqual(["photo"]);
	await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
	expect(selectedNames()).toEqual(["photo", "notes"]);

	await user.keyboard("{Control>}a{/Control}");
	expect(selectedNames()).toEqual(["travel", "photo", "notes"]);
	expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
	await user.keyboard("{Escape}");
	expect(selectedNames()).toEqual([]);
});

it("keeps the selection through sorting and view changes and prunes it on refresh", async () => {
	localStorage.clear();
	let children = [travel, photo, notes];
	stubApi(serveFolder(() => children));
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("row", { name: "notes.txt" }));
	await user.keyboard("{Control>}");
	await user.click(screen.getByRole("row", { name: "Travel" }));
	await user.keyboard("{/Control}");

	await user.click(screen.getByRole("columnheader", { name: "Size" }));
	await vi.waitFor(() =>
		expect(
			screen
				.getByRole("columnheader", { name: "Size" })
				.getAttribute("aria-sort"),
		).toMatch(/ascending|descending/),
	);
	expect(selectedNames().sort()).toEqual(["notes", "travel"]);

	await user.click(screen.getByRole("radio", { name: "Grid" }));
	expect(selectedNames().sort()).toEqual(["notes", "travel"]);

	children = [travel, photo];
	await act(() => queryClient.invalidateQueries());
	await vi.waitFor(() =>
		expect(screen.queryByRole("row", { name: "notes.txt" })).toBeNull(),
	);
	expect(selectedNames()).toEqual(["travel"]);
	expect(screen.getByText("1 selected")).toBeInTheDocument();
});

it("shows the selection in Details and clears it on empty space", async () => {
	localStorage.clear();
	stubApi(serveFolder(() => [travel, photo]));
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("row", { name: "Travel" }));

	// A row's Details button makes that entry the selection and shows it.
	await user.click(
		screen.getByRole("button", { name: "Details for IMG_8421.JPG" }),
	);
	expect(selectedNames()).toEqual(["photo"]);
	const details = await screen.findByRole("complementary", {
		name: "Details",
	});
	expect(within(details).getByRole("heading", { level: 2 })).toHaveTextContent(
		"IMG_8421.JPG",
	);

	// Details follows whatever is selected next.
	await user.click(screen.getByRole("row", { name: "Travel" }));
	expect(within(details).getByRole("heading", { level: 2 })).toHaveTextContent(
		"Travel",
	);
	await user.keyboard("{Control>}");
	await user.click(screen.getByRole("row", { name: "IMG_8421.JPG" }));
	await user.keyboard("{/Control}");
	expect(within(details).getByRole("heading", { level: 2 })).toHaveTextContent(
		"2 items selected",
	);

	// Escape in the inspector closes it and keeps the selection.
	act(() => within(details).getAllByRole("button")[0]?.focus());
	await user.keyboard("{Escape}");
	expect(
		screen.queryByRole("complementary", { name: "Details" }),
	).not.toBeInTheDocument();
	expect(selectedNames()).toEqual(["travel", "photo"]);

	// Clicking empty space clears it; controls keep it.
	await user.click(screen.getByRole("button", { name: "New folder" }));
	expect(selectedNames()).toEqual(["travel", "photo"]);
	await user.click(screen.getByRole("banner").parentElement as HTMLElement);
	expect(selectedNames()).toEqual([]);
});

it("starts touch selection with Select, where taps toggle instead of opening", async () => {
	vi.stubGlobal("matchMedia", () => ({
		matches: false,
		addEventListener() {},
		removeEventListener() {},
	}));
	stubApi(serveFolder(() => [travel, photo]));
	const { user } = renderLibrary();
	expect(await screen.findByRole("row", { name: "Travel" })).toHaveAttribute(
		"data-href",
		"/library/travel",
	);
	await user.click(screen.getByRole("button", { name: "Select" }));
	expect(screen.getByText("Tap items to select")).toBeInTheDocument();
	expect(screen.getByRole("row", { name: "Travel" })).not.toHaveAttribute(
		"data-href",
	);
	await user.click(screen.getByRole("row", { name: "Travel" }));
	await user.click(screen.getByRole("row", { name: "IMG_8421.JPG" }));
	expect(selectedNames()).toEqual(["travel", "photo"]);
	await user.click(screen.getByRole("row", { name: "Travel" }));
	expect(selectedNames()).toEqual(["photo"]);
	expect(
		screen.getByRole("heading", { level: 1, name: "Library" }),
	).toBeVisible();

	await user.click(screen.getByRole("button", { name: "Done" }));
	expect(selectedNames()).toEqual([]);
	expect(screen.getByRole("row", { name: "Travel" })).toHaveAttribute(
		"data-href",
		"/library/travel",
	);
});

it("forgets the selection in another folder", async () => {
	stubApi((path) =>
		path === "/api/v1/entries/travel"
			? Response.json(travel)
			: path === "/api/v1/entries/travel/children"
				? Response.json({ entries: [notes], nextCursor: null })
				: serveFolder(() => [photo, travel])(path),
	);
	const { user } = renderLibrary();
	await user.click(await screen.findByRole("row", { name: "IMG_8421.JPG" }));
	await user.dblClick(screen.getByRole("row", { name: "Travel" }));
	await screen.findByRole("heading", { level: 1, name: "Travel" });
	expect(selectedNames()).toEqual([]);
	expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
});
