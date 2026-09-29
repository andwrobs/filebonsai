import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderRoute } from "../../../test-utils/render-route";
import NotFoundRoute, { meta } from "./not-found.route";

it("names the missing path and links home", () => {
	renderRoute([{ path: "*", Component: NotFoundRoute, meta }], {
		initialEntries: ["/no/such/page"],
	});
	expect(document.title).toBe("Page not found · Filebonsai");
	expect(
		screen.getByRole("heading", { name: "Page not found" }),
	).toBeInTheDocument();
	expect(
		screen.getByText("/no/such/page", { selector: "code" }),
	).toBeInTheDocument();
	expect(
		screen.getByRole("link", { name: "Go to your Library" }),
	).toHaveAttribute("href", "/");
});
