import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { LibraryPage } from "./pages/library-page";
import { syntheticFile } from "./synthetic";

// Entry rows in view order; the table's header row has no row header cell.
function entryRows(page: Page, library: LibraryPage, table: boolean) {
	const rows = library.items.getByRole("row");
	return table ? rows.filter({ has: page.getByRole("rowheader") }) : rows;
}

async function expectOrder(
	page: Page,
	library: LibraryPage,
	names: string[],
	table: boolean,
) {
	const rows = entryRows(page, library, table);
	await expect(rows).toHaveCount(names.length);
	for (const [index, name] of names.entries()) {
		await expect(rows.nth(index)).toHaveAccessibleName(name);
	}
}

test("sorts through the server, keeps a grid across reloads, and uses rows on a phone", async ({
	page,
	signInPage,
	library,
	ownerPassword,
}, testInfo) => {
	const phone = testInfo.project.name === "phone";
	const stamp = Date.now().toString(36);
	const small = syntheticFile(`Alpha small ${stamp}`, 1024);
	const large = syntheticFile(`Beta large ${stamp}`, 64 * 1024);
	const folder = `Gamma folder ${stamp}`;

	await page.goto("/");
	await signInPage.signIn(ownerPassword);
	await library.expectFolder("Library");
	await library.createFolder(`Views ${testInfo.project.name} ${stamp}`);
	await library.openFolder(`Views ${testInfo.project.name} ${stamp}`);
	await library.createFolder(folder);
	await library.upload(small);
	await library.upload(large);
	const table = !phone;
	await expectOrder(page, library, [small.name, large.name, folder], table);

	if (phone) {
		// No columns and no view choice; the menu sorts.
		await expect(library.items).toHaveAttribute("data-layout", "stack");
		await expect(page.getByRole("radiogroup", { name: "View" })).toHaveCount(0);
		await page.getByRole("button", { name: "Sort" }).tap();
		await page.getByRole("menuitemradio", { name: "Size" }).tap();
	} else {
		await page.getByRole("columnheader", { name: "Size" }).click();
		await expect(
			page.getByRole("columnheader", { name: "Size" }),
		).toHaveAttribute("aria-sort", "descending");
	}
	await expect(page).toHaveURL(/\?sort=size&order=desc$/);
	// A folder sizes below any file.
	await expectOrder(page, library, [large.name, small.name, folder], table);

	await library.press(page.getByRole("button", { name: "Sort" }));
	await library.press(
		page.getByRole("menuitemcheckbox", { name: "Folders first" }),
	);
	await page.keyboard.press("Escape");
	await expectOrder(page, library, [folder, large.name, small.name], table);
	await page.reload();
	await expectOrder(page, library, [folder, large.name, small.name], table);

	if (phone) return;

	// Arrows move between rows; the grid remembers itself across a reload.
	await entryRows(page, library, true).first().focus();
	await page.keyboard.press("ArrowDown");
	await expect(entryRows(page, library, true).nth(1)).toBeFocused();
	await page.getByRole("radio", { name: "Grid" }).click();
	await expect(library.items).toHaveAttribute("data-layout", "grid");
	await page.reload();
	await expect(library.items).toHaveAttribute("data-layout", "grid");
	await expectOrder(page, library, [folder, large.name, small.name], false);
	await library.items.getByRole("row", { name: large.name }).focus();
	await page.keyboard.press("ArrowLeft");
	await page.keyboard.press("Enter");
	await library.expectFolder(folder);
});
