import { screen } from "@testing-library/react";
import { data } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderRoute } from "../test-utils/render-route";
import { ErrorBoundary, meta } from "./root";

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => consoleError.mockRestore());

function renderFailure(failure: unknown) {
	return renderRoute([
		{
			path: "/",
			loader: () => {
				throw failure;
			},
			Component: () => null,
			ErrorBoundary,
			meta,
		},
	]);
}

it("shows an error page with details in development and a way back", async () => {
	renderFailure(new Error("Sample failure"));
	expect(
		await screen.findByRole("heading", { name: "Something went wrong" }),
	).toBeInTheDocument();
	expect(screen.getByText("Sample failure")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
	expect(
		screen.getByRole("link", { name: "Go to your Library" }),
	).toHaveAttribute("href", "/");
	expect(document.title).toBe("Error · Filebonsai");
});

it("names a thrown 404 as a missing page", async () => {
	renderFailure(data(null, { status: 404 }));
	expect(
		await screen.findByRole("heading", { name: "Page not found" }),
	).toBeInTheDocument();
});
