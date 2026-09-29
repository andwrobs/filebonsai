import { screen, within } from "@testing-library/react";
import type { LoaderFunctionArgs } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { catalogKeys } from "~/lib/catalog/catalog.query";
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
	createdAt: "2026-09-21T00:00:00Z",
	id: "root",
	kind: "folder",
	name: "Library",
	parentId: null,
	updatedAt: "2026-09-21T00:00:00Z",
};
const travel = { ...root, id: "travel", name: "Travel", parentId: "root" };
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
	const rows = within(
		screen.getByRole("region", { name: "Items" }),
	).getAllByRole("listitem");
	expect(rows).toHaveLength(2);
	expect(
		within(rows[0] as HTMLElement).getByRole("link", { name: "Travel" }),
	).toHaveAttribute("href", "/library/travel");
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
		await screen.findByRole("link", { name: "Photos" }),
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
	await user.click(screen.getByRole("link", { name: "Travel" }));
	expect(
		await screen.findByRole("heading", { level: 1, name: "Travel" }),
	).toBeInTheDocument();
	const nextForm = screen.getByLabelText("Folder name");
	expect(nextForm).toHaveValue("");

	reply();
	await vi.waitFor(() =>
		expect(
			queryClient.getQueryState(catalogKeys.folder("root"))?.isInvalidated,
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
