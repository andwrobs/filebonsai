import { expect, test } from "./fixtures";

test("nested breadcrumbs navigate on desktop and phone", async ({
	page,
	signInPage,
	library,
	ownerPassword,
}, testInfo) => {
	const first = `Synthetic path ${testInfo.project.name} ${Date.now().toString(36)}`;
	const middle = "Travel";
	const third = "Italy";
	const fourth = "Florence";
	const leaf = "Summer photographs with a very long folder name";
	await page.goto("/");
	await signInPage.signIn(ownerPassword);
	await library.expectFolder("Library");
	await library.createFolder(first);
	await library.openFolder(first);
	await library.createFolder(middle);
	await library.openFolder(middle);
	await library.createFolder(third);
	await library.openFolder(third);
	await library.createFolder(fourth);
	await library.openFolder(fourth);
	await library.createFolder(leaf);
	await library.openFolder(leaf);
	await page.reload();
	await library.expectFolder(leaf);

	const breadcrumbs = page.getByRole("navigation", { name: "Folder path" });
	await expect(
		breadcrumbs.getByRole("link", { name: "Library" }),
	).toBeVisible();
	if (testInfo.project.name === "desktop") {
		await expect(breadcrumbs.getByRole("link", { name: third })).toBeVisible();
		await expect(breadcrumbs.getByRole("link", { name: fourth })).toBeVisible();
		await expect(breadcrumbs.getByRole("link", { name: middle })).toBeHidden();
	} else {
		await expect(breadcrumbs.getByRole("link", { name: third })).toBeHidden();
		await expect(breadcrumbs.getByRole("link", { name: fourth })).toBeHidden();
		await expect(
			breadcrumbs.getByRole("button", { name: "More parent folders" }),
		).toBeVisible();
	}
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
	await expect(
		page.getByRole("button", { name: "New folder" }),
	).toBeInViewport();
	await expect(
		breadcrumbs.getByRole("heading", { name: leaf }),
	).toHaveAttribute("title", leaf);
	await testInfo.attach("nested-breadcrumbs", {
		body: await page.screenshot(),
		contentType: "image/png",
	});

	await breadcrumbs
		.getByRole("button", { name: "More parent folders" })
		.focus();
	await page.keyboard.press("Enter");
	await expect(page.getByRole("menuitem", { name: first })).toBeFocused();
	await page.keyboard.press("Enter");
	await library.expectFolder(first);
	await page.goBack();
	await library.expectFolder(leaf);
	await page.goForward();
	await library.expectFolder(first);
});
