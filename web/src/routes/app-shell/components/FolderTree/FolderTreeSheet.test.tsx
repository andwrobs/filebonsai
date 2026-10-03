import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderRoute } from "../../../../../test-utils/render-route";
import { stubApi } from "../../../../../test-utils/stub-api";
import { stubVirtualLayout } from "../../../../../test-utils/virtual-layout";
import { useExpandedFolders } from "./expanded-folders.store";
import { FolderTreeSheet } from "./FolderTreeSheet";

const stamp = "2026-09-21T00:00:00Z";
const folder = (id: string, name: string, parentId: string | null) => ({
	ancestors: [],
	createdAt: stamp,
	id,
	kind: "folder",
	name,
	parentId,
	updatedAt: stamp,
	revision: 1,
});

let restoreLayout = () => {};

beforeEach(() => {
	restoreLayout = stubVirtualLayout();
	localStorage.clear();
	useExpandedFolders.setState({ expanded: [] });
	stubApi((path) =>
		path === "/api/v1/catalog/root"
			? Response.json(folder("root", "Library", null))
			: Response.json({
					entries: [folder("travel", "Travel", "root")],
					nextCursor: null,
				}),
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	restoreLayout();
	document.documentElement.style.removeProperty("--breakpoint-wide");
});

it("closes when the viewport enters the wide shell and stays closed on return", async () => {
	document.documentElement.style.setProperty("--breakpoint-wide", "68.75rem");
	const listeners = new Set<() => void>();
	let wide = false;
	vi.stubGlobal("matchMedia", () => ({
		get matches() {
			return wide;
		},
		addEventListener: (_: string, listener: () => void) =>
			listeners.add(listener),
		removeEventListener: (_: string, listener: () => void) =>
			listeners.delete(listener),
	}));
	const { user } = renderRoute([
		{ path: "/", Component: () => <FolderTreeSheet /> },
	]);
	await user.click(screen.getByRole("button", { name: "Folders" }));
	await screen.findByRole("dialog", { name: "Folders" });
	act(() => {
		wide = true;
		for (const listener of listeners) listener();
	});
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	act(() => {
		wide = false;
		for (const listener of listeners) listener();
	});
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	await user.click(screen.getByRole("button", { name: "Folders" }));
	expect(
		await screen.findByRole("dialog", { name: "Folders" }),
	).toBeInTheDocument();
});

it("opens the tree on request and closes it when a folder is chosen", async () => {
	const { user } = renderRoute(
		[
			{ path: "/", Component: () => <FolderTreeSheet /> },
			{ path: "/library/:entryId", Component: () => <FolderTreeSheet /> },
		],
		{ initialEntries: ["/"] },
	);
	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

	await user.click(screen.getByRole("button", { name: "Folders" }));
	const dialog = await screen.findByRole("dialog", { name: "Folders" });
	await user.click(await screen.findByRole("row", { name: "Travel" }));

	expect(screen.getByLabelText("Test location")).toHaveTextContent(
		"/library/travel",
	);
	expect(dialog).not.toBeInTheDocument();
});

it("closes when the current folder's row is pressed, though the path doesn't change", async () => {
	const { user } = renderRoute(
		[
			{
				path: "/library/:entryId",
				Component: () => <FolderTreeSheet currentId="travel" />,
			},
		],
		{ initialEntries: ["/library/travel"] },
	);
	await user.click(screen.getByRole("button", { name: "Folders" }));
	await screen.findByRole("dialog", { name: "Folders" });
	await user.click(
		await screen.findByRole("row", { name: "Travel, current folder" }),
	);

	expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	expect(screen.getByLabelText("Test location")).toHaveTextContent(
		"/library/travel",
	);
});
