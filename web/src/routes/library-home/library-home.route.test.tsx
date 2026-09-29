import { screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "~/lib/query/client";
import { renderRoute } from "../../../test-utils/render-route";
import { apiError, stubApi } from "../../../test-utils/stub-api";
import LibraryHomeRoute, {
	clientLoader,
	ErrorBoundary,
} from "./library-home.route";

beforeEach(() => queryClient.clear());
afterEach(() => vi.unstubAllGlobals());

function renderHome() {
	return renderRoute(
		[
			{
				path: "/",
				Component: LibraryHomeRoute,
				loader: clientLoader,
				ErrorBoundary,
			},
			{ path: "/library/:entryId", Component: () => <h1>Folder</h1> },
			{ path: "/sign-in", Component: () => <h1>Sign in</h1> },
		],
		{ queryClient },
	);
}

it("opens the workspace's root folder", async () => {
	stubApi(() =>
		Response.json({
			createdAt: "2026-09-21T00:00:00Z",
			id: "root-id",
			kind: "folder",
			name: "Library",
			parentId: null,
			updatedAt: "2026-09-21T00:00:00Z",
		}),
	);
	renderHome();
	expect(
		await screen.findByRole("heading", { name: "Folder" }),
	).toBeInTheDocument();
	expect(screen.getByLabelText("Test location")).toHaveTextContent(
		"/library/root-id",
	);
});

it("sends a signed-out visitor to sign in", async () => {
	stubApi(() => apiError(401, "AUTH_REQUIRED"));
	renderHome();
	expect(
		await screen.findByRole("heading", { name: "Sign in" }),
	).toBeInTheDocument();
});

it("says the Library is unavailable when the root can't be read", async () => {
	stubApi(() => apiError(403, "FORBIDDEN"));
	renderHome();
	expect(
		await screen.findByRole("heading", { name: "The Library is unavailable." }),
	).toBeInTheDocument();
});
