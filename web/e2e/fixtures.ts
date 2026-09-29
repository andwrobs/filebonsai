import { readFile } from "node:fs/promises";
import { test as base } from "@playwright/test";
import { LibraryPage } from "./pages/library-page";
import { Session } from "./pages/session";
import { SignInPage } from "./pages/sign-in-page";

export { expect } from "@playwright/test";

type Fixtures = {
	/** This run's generated local-owner password. Never log it. */
	ownerPassword: string;
	signInPage: SignInPage;
	library: LibraryPage;
	session: Session;
};

// Specs import `test` from here, not from @playwright/test, so they share the
// stack's origin and the page objects.
export const test = base.extend<Fixtures>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixtures argument.
	baseURL: async ({}, use) => use(stackSetting("FILEBONSAI_E2E_BASE_URL")),
	// biome-ignore lint/correctness/noEmptyPattern: Playwright requires a destructured fixtures argument.
	ownerPassword: async ({}, use) => {
		const file = stackSetting("FILEBONSAI_E2E_OWNER_PASSWORD_FILE");
		await use((await readFile(file, "utf8")).trim());
	},
	signInPage: async ({ page, hasTouch }, use) =>
		use(new SignInPage(page, hasTouch)),
	library: async ({ page, hasTouch }, use) =>
		use(new LibraryPage(page, hasTouch)),
	session: async ({ page, hasTouch }, use) => use(new Session(page, hasTouch)),
});

function stackSetting(name: string) {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} is unset; run the suite with \`npm run e2e\`.`);
	}
	return value;
}
