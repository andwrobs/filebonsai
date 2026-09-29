import type { Locator, Page } from "@playwright/test";

// Shared by the page objects: they act the way the project's device does, so
// the phone project taps and the desktop project clicks.
export abstract class Screen {
	constructor(
		readonly page: Page,
		/** The project's `hasTouch`. */
		readonly touch = false,
	) {}

	/** Below the 768px shell breakpoint: top bar, bottom navigation, and FAB. */
	get compact() {
		return (this.page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) < 768;
	}

	protected async press(target: Locator) {
		await (this.touch ? target.tap() : target.click());
	}
}
