import { expect, test } from "./fixtures";
import { syntheticFile } from "./synthetic";

test("selects entries without opening them and opens folders deliberately", async ({
	page,
	signInPage,
	library,
	ownerPassword,
}, testInfo) => {
	const phone = testInfo.project.name === "phone";
	const stamp = Date.now().toString(36);
	const parent = `Selection ${testInfo.project.name} ${stamp}`;
	const folder = `Folder with a deliberately long name that wraps ${stamp}`;
	const first = syntheticFile(`First ${stamp}`, 1024);
	const second = syntheticFile(`Second ${stamp}`, 2048);

	await page.goto("/");
	await signInPage.signIn(ownerPassword);
	await library.createFolder(parent);
	await library.openFolder(parent);
	await library.createFolder(folder);
	await library.upload(first);
	await library.upload(second);
	await expect(library.items).toHaveAttribute("aria-multiselectable", "true");
	const selected = library.items.locator('[role="row"][aria-selected="true"]');
	const count = page.getByRole("toolbar", { name: "Selection" });

	if (phone) {
		await page.getByRole("button", { name: "Select", exact: true }).tap();
		await library.entry(folder).tap();
		await library.entry(first.name).tap();
		await expect(selected).toHaveCount(2);
		await expect(count).toContainText("2 selected");
		await library.expectFolder(parent);
		await page.screenshot({
			path: testInfo.outputPath("selection-phone.png"),
		});
		await page.getByRole("button", { name: "Done" }).tap();
		await expect(selected).toHaveCount(0);
		await library.openFolder(folder);
		return;
	}

	await library.entry(folder).click();
	await expect(selected).toHaveCount(1);
	await library.expectFolder(parent);
	await library.entry(second.name).click({ modifiers: ["ControlOrMeta"] });
	await expect(selected).toHaveCount(2);
	await expect(count).toContainText("2 selected");

	await page.getByRole("radio", { name: "Grid" }).click();
	await expect(selected).toHaveCount(2);
	await page.screenshot({ path: testInfo.outputPath("selection-grid.png") });
	await page.getByRole("radio", { name: "Table" }).click();

	await library.entry(first.name).click();
	// Name order: First, the folder, Second.
	await library.entry(second.name).click({ modifiers: ["Shift"] });
	await expect(selected).toHaveCount(3);
	await page.screenshot({ path: testInfo.outputPath("selection-table.png") });

	// Details shows the selection: several, then the one a Details button picks.
	const details = page.getByRole("complementary", { name: "Details" });
	if (!(await details.isVisible())) {
		await page.getByRole("button", { name: "Details", exact: true }).click();
	}
	await expect(details).toContainText("3 items selected");
	await page
		.getByRole("button", { name: `Details for ${second.name}`, exact: true })
		.click();
	await expect(selected).toHaveCount(1);
	await expect(details.getByRole("heading", { level: 2 })).toHaveText(
		second.name,
	);
	await library.entry(first.name).click();
	await expect(details.getByRole("heading", { level: 2 })).toHaveText(
		first.name,
	);
	await page.screenshot({
		path: testInfo.outputPath("selection-inspector.png"),
	});
	// Arrows move the selection, and Details follows.
	await page.keyboard.press("ArrowDown");
	await expect(details.getByRole("heading", { level: 2 })).toHaveText(folder);

	// Escape in the inspector closes it; in the listing it clears.
	await details.getByRole("button", { name: "Close details" }).focus();
	await page.keyboard.press("Escape");
	await expect(details).toBeHidden();
	await expect(selected).toHaveCount(1);
	await library.entry(first.name).click();
	await page.keyboard.press("Escape");
	await expect(selected).toHaveCount(0);

	// Clicking empty space below the listing clears the selection.
	await library.entry(first.name).click();
	await expect(selected).toHaveCount(1);
	await page.mouse.click(700, 600);
	await expect(selected).toHaveCount(0);

	await library.openFolder(folder);
});
