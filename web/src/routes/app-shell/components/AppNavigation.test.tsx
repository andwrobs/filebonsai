import { screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderRoute } from "../../../../test-utils/render-route";
import { apiError, stubApi } from "../../../../test-utils/stub-api";
import { AppSidebar } from "./AppNavigation";

beforeEach(() => {
	document.documentElement.style.setProperty("--breakpoint-wide", "68.75rem");
});
afterEach(() => {
	document.documentElement.style.removeProperty("--breakpoint-wide");
	vi.unstubAllGlobals();
});

function widthMatches(matches: boolean) {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: matches && query === "(min-width: 68.75rem)",
		addEventListener() {},
		removeEventListener() {},
	}));
}

function renderSidebar() {
	const { requests } = stubApi(() => apiError(404, "ENTRY_NOT_FOUND"));
	renderRoute([
		{ path: "/", Component: () => <AppSidebar current="library" /> },
	]);
	return requests;
}

const askedForFolders = (requests: Request[]) =>
	requests.some((request) => request.url.includes("/api/v1/catalog/root"));

it("mounts the inline folder tree only at the wide breakpoint", async () => {
	widthMatches(true);
	const requests = renderSidebar();
	expect(
		await screen.findByRole("heading", { name: "Folders" }),
	).toBeInTheDocument();
	expect(askedForFolders(requests)).toBe(true);
});

it("doesn't mount, or fetch for, a tree nobody can see on the rail or a phone", async () => {
	widthMatches(false);
	const requests = renderSidebar();
	// The rail's Folders button is there; the tree behind it isn't.
	expect(
		await screen.findByRole("button", { name: "Folders" }),
	).toBeInTheDocument();
	expect(screen.queryByRole("heading", { name: "Folders" })).toBeNull();
	await new Promise((done) => setTimeout(done, 50));
	expect(askedForFolders(requests)).toBe(false);
});
