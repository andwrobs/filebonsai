import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { outputRoot } from "./stack";

// `npm run e2e`. Needs Docker; see docs/testing.md. Everything the run writes
// (logs, and traces and screenshots of failed tests) goes to e2e/.output.
export default defineConfig({
	testDir: ".",
	testMatch: /.*\.e2e\.ts$/,
	outputDir: path.join(outputRoot, "artifacts"),
	globalSetup: "./global-setup.ts",
	forbidOnly: true,
	retries: 0,
	// The projects share one owner and workspace, and the journey is not a
	// concurrency test, so they run one after another.
	workers: 1,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	// One line per test; a failure adds its error and the trace to open.
	reporter: [["list"]],
	preserveOutput: "failures-only",
	use: {
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "off",
		actionTimeout: 10_000,
		navigationTimeout: 20_000,
		contextOptions: { reducedMotion: "reduce" },
	},
	projects: [
		{
			name: "desktop",
			use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
		},
		{
			name: "phone",
			use: {
				browserName: "chromium",
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
				userAgent: devices["Pixel 7"].userAgent,
			},
		},
	],
});
