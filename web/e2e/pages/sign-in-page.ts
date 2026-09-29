import { expect } from "@playwright/test";
import { Screen } from "./screen";

export class SignInPage extends Screen {
	readonly heading = this.page.getByRole("heading", {
		level: 1,
		name: "Sign in",
	});

	async goto() {
		await this.page.goto("/sign-in");
		await this.expectShown();
	}

	async expectShown() {
		await expect(this.heading).toBeVisible();
	}

	async signIn(password: string) {
		await this.page.getByLabel("Password").fill(password);
		await this.press(this.page.getByRole("button", { name: "Sign in" }));
	}
}
