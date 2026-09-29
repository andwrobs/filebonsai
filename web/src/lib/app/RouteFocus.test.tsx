import { screen } from "@testing-library/react";
import { Link, Outlet } from "react-router";
import { expect, it } from "vitest";
import { renderRoute } from "../../../test-utils/render-route";
import { RouteFocus } from "./RouteFocus";

function Page({ title }: { title: string }) {
	return (
		<main>
			<h1>{title}</h1>
			<Link to="/next">Next page</Link>
			<Link to="?filter=on">Filter this page</Link>
		</main>
	);
}

function renderPages() {
	return renderRoute([
		{
			Component: () => (
				<>
					<RouteFocus />
					<Outlet />
				</>
			),
			children: [
				{ path: "/", Component: () => <Page title="Home" /> },
				{ path: "/next", Component: () => <Page title="Next" /> },
			],
		},
	]);
}

it("leaves focus alone on the first load", () => {
	renderPages();
	expect(document.body).toHaveFocus();
});

it("focuses the new page's heading when the path changes", async () => {
	const { user } = renderPages();
	await user.click(screen.getByRole("link", { name: "Next page" }));
	expect(screen.getByRole("heading", { name: "Next" })).toHaveFocus();
});

it("keeps focus where it is when only the search changes", async () => {
	const { user } = renderPages();
	const filter = screen.getByRole("link", { name: "Filter this page" });
	await user.click(filter);
	expect(screen.getByLabelText("Test location")).toHaveTextContent(
		"/?filter=on",
	);
	expect(filter).toHaveFocus();
});
