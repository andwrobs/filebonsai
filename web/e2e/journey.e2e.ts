import { expect, test } from "./fixtures";
import { syntheticFile } from "./synthetic";

// The M1 journey against a real PostgreSQL-profile backend, once per project
// (1440×900 desktop, 390×844 touch phone).
test("sign in, create a folder, upload, download the same bytes, sign out", async ({
	page,
	signInPage,
	library,
	session,
	ownerPassword,
}, testInfo) => {
	const project = testInfo.project.name;
	const folder = `Synthetic e2e ${project} ${Date.now().toString(36)}`;
	const file = syntheticFile(`Synthetic e2e ${project} body`);

	await test.step("sign in", async () => {
		await page.goto("/");
		await signInPage.expectShown();
		await signInPage.signIn(ownerPassword);
		await library.expectFolder("Library");
	});

	await test.step("create and open a folder", async () => {
		await library.createFolder(folder);
		await library.openFolder(folder);
	});

	await test.step("upload a synthetic file", async () => {
		await library.upload(file);
	});

	await test.step("download it and compare SHA-256", async () => {
		const saved = await library.download(file.name);
		expect(saved.suggestedFilename).toBe(file.name);
		expect(saved.sha256).toBe(file.sha256);
	});

	await test.step("sign out", async () => {
		await session.signOut();
		await session.expectSignedOut();
		await page.goto("/");
		await signInPage.expectShown();
	});
});
