import { screen } from "@testing-library/react";
import { useSearchParams } from "react-router";
import { expect, it } from "vitest";
import { renderRoute } from "../../../test-utils/render-route";
import { typingState, useSearchDraft } from "./useSearchDraft";

function Search() {
	const [params, setParams] = useSearchParams();
	const [draft, setDraft] = useSearchDraft(params.get("q") ?? "");
	return (
		<>
			<input
				aria-label="Search"
				value={draft}
				onChange={(event) => {
					setDraft(event.target.value);
					setParams(
						{ q: event.target.value },
						{ replace: true, state: typingState },
					);
				}}
			/>
			<button type="button" onClick={() => setParams({ q: "reset" })}>
				Other control
			</button>
		</>
	);
}

it("keeps typed text, and takes the URL's value after Back or another control", async () => {
	const { user } = renderRoute([{ path: "/", Component: Search }], {
		initialEntries: ["/?q=first", "/?q=second"],
	});
	const box = screen.getByRole("textbox", { name: "Search" });
	expect(box).toHaveValue("second");

	await user.type(box, "!");
	expect(box).toHaveValue("second!");
	expect(screen.getByLabelText("Test location")).toHaveTextContent(
		"/?q=second%21",
	);

	await user.click(screen.getByRole("button", { name: "Other control" }));
	expect(box).toHaveValue("reset");

	await user.click(screen.getByRole("button", { name: "Test back" }));
	expect(box).toHaveValue("second!");
	await user.click(screen.getByRole("button", { name: "Test back" }));
	expect(box).toHaveValue("first");
});
