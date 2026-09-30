import { screen } from "@testing-library/react";
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
