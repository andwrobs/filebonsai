import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const stamp = () => Date.now().toString(36);

// Longest main-thread task the browser reports, from before the page loads.
declare global {
	interface Window {
		__longTasks: { start: number; duration: number }[];
		__longTaskObserver: PerformanceObserver;
	}
}

test("the folder tree reveals the current folder, navigates, and opens in a sheet on phones", async ({
	page,
	signInPage,
	library,
	ownerPassword,
}, testInfo) => {
	const project = testInfo.project.name;
	const names = ["A", "B", "C"].map(
		(letter) => `Tree ${project} ${letter} ${stamp()}`,
	);
	const [a, b, c] = names as [string, string, string];
	await page.goto("/");
	await signInPage.signIn(ownerPassword);
	await library.expectFolder("Library");
	for (const name of names) {
		await library.createFolder(name);
		await library.openFolder(name);
	}
	await page.reload();
	await library.expectFolder(c);

	if (project === "desktop") {
		const tree = page.getByRole("treegrid", { name: "Folders" });
		await expect(tree).toBeVisible();
		await expect(tree.getByRole("row", { name: a })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
		await expect(tree.getByRole("row", { name: b })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
		const current = tree.getByRole("row", { name: `${c}, current folder` });
		await expect(current).toBeInViewport({ ratio: 1 });
		await expect(current).toHaveAttribute("data-current", "true");
		// The sidebar keeps Storage in view beneath the tree.
		await expect(page.getByRole("link", { name: "Storage" })).toBeInViewport();

		await tree.getByRole("row", { name: b }).focus();
		await page.keyboard.press("ArrowDown");
		await expect(current).toBeFocused();
		await page.keyboard.press("ArrowLeft");
		await expect(tree.getByRole("row", { name: b })).toBeFocused();
		await page.keyboard.press("ArrowLeft");
		await expect(tree.getByRole("row", { name: b })).toHaveAttribute(
			"aria-expanded",
			"false",
		);
		await page.keyboard.press("ArrowRight");
		await expect(tree.getByRole("row", { name: b })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
		await page.keyboard.press("ArrowUp");
		await expect(tree.getByRole("row", { name: a })).toBeFocused();
		await page.keyboard.press("Enter");
		await library.expectFolder(a);

		// Expansion survives a reload.
		await page.reload();
		await library.expectFolder(a);
		await expect(tree.getByRole("row", { name: b })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
	} else {
		await page.getByRole("button", { name: "Folders", exact: true }).tap();
		const sheet = page.getByRole("dialog", { name: "Folders" });
		await expect(sheet).toBeVisible();
		const tree = sheet.getByRole("treegrid", { name: "Folders" });
		await expect(
			tree.getByRole("row", { name: `${c}, current folder` }),
		).toBeVisible();
		await testInfo.attach("folder-tree-sheet", {
			body: await page.screenshot(),
			contentType: "image/png",
		});
		await tree.getByRole("row", { name: b }).tap();
		await library.expectFolder(b);
		await expect(sheet).toBeHidden();
	}
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
});

test("the current folder is revealed below a large open sibling with more pages", async ({
	page,
	signInPage,
	library,
	ownerPassword,
}, testInfo) => {
	test.skip(testInfo.project.name === "phone", "Checked on the desktop tree.");
	test.setTimeout(120_000);
	const run = stamp();
	const [a, b, c] = ["A", "B", "C"].map(
		(letter) => `Reveal ${letter} ${run}`,
	) as [string, string, string];
	await page.goto("/");
	await signInPage.signIn(ownerPassword);
	await library.expectFolder("Library");
	for (const name of [a, b, c]) {
		await library.createFolder(name);
		await library.openFolder(name);
	}

	// Put C below the sidebar's fold, under a large open sibling whose listing
	// still has a next page. Only the rows in view are mounted, and an idle
	// "load more" row takes no height, so counting it would land one row off.
	const big = `0 Big ${run}`;
	const rootId = await workspaceRootId(page);
	await createFolders(
		page,
		rootId,
		Array.from(
			{ length: 15 },
			(_, i) => `0 Filler ${run} ${String(i).padStart(2, "0")}`,
		),
	);
	await createFolders(page, rootId, [big]);
	await createFolders(
		page,
		await findChildId(page, rootId, big),
		Array.from({ length: 150 }, (_, i) => `Kid ${String(i).padStart(3, "0")}`),
	);
	await page.reload();
	await library.expectFolder(c);
	const tree = page.getByRole("treegrid", { name: "Folders" });
	await tree
		.getByRole("row", { name: big, exact: true })
		.getByRole("button", { name: /expand/i })
		.click();
	await expect(
		tree.getByRole("row", { name: "Kid 000", exact: true }),
	).toBeVisible();

	await page.reload();
	await library.expectFolder(c);
	const current = tree.getByRole("row", { name: `${c}, current folder` });
	await expect(current).toBeInViewport({ ratio: 1 });
	// Brought in with the least scrolling, so it sits at the bottom edge; a row
	// counted too many would leave a gap of a row or more below it.
	const treeBox = await tree.boundingBox();
	const rowBox = await current.boundingBox();
	const gap =
		(treeBox?.y ?? 0) +
		(treeBox?.height ?? 0) -
		((rowBox?.y ?? 0) + (rowBox?.height ?? 0));
	expect(gap, "space below the current row").toBeLessThan(
		(rowBox?.height ?? 0) / 2,
	);
	await expect(tree.getByRole("row", { name: b })).toHaveAttribute(
		"aria-expanded",
		"true",
	);
	await expect(tree.getByRole("row", { name: a })).toHaveAttribute(
		"aria-expanded",
		"true",
	);
});

test("a folder of 1,000 folders pages in and stays responsive", async ({
	page,
	signInPage,
	library,
	ownerPassword,
}, testInfo) => {
	test.skip(
		testInfo.project.name === "phone",
		"Measured once, on the desktop tree.",
	);
	test.setTimeout(240_000);
	const count = 1000;
	const parentName = `Bulk ${stamp()}`;
	await page.addInitScript(() => {
		window.__longTasks = [];
		window.__longTaskObserver = new PerformanceObserver((list) => {
			for (const entry of list.getEntries())
				window.__longTasks.push({
					start: entry.startTime,
					duration: entry.duration,
				});
		});
		window.__longTaskObserver.observe({ type: "longtask", buffered: true });
	});
	await page.goto("/");
	await signInPage.signIn(ownerPassword);
	await library.expectFolder("Library");
	await library.createFolder(parentName);
	await library.openFolder(parentName);
	const parentUrl = page.url();
	const parentId = decodeURIComponent(
		new URL(parentUrl).pathname.split("/").pop() ?? "",
	);

	await createFolders(
		page,
		parentId,
		Array.from(
			{ length: count },
			(_, index) => `Bulk ${String(index + 1).padStart(4, "0")}`,
		),
	);

	await page.reload();
	await library.expectFolder(parentName);
	const tree = page.getByRole("treegrid", { name: "Folders" });
	await expect(tree).toBeVisible();
	let domRows = 0;
	const now = () => page.evaluate(() => performance.now());
	const booted = await now();
	// The current folder's row is labelled "<name>, current folder".
	await tree
		.getByRole("row", { name: `${parentName}, current folder` })
		.focus();
	await page.keyboard.press("ArrowRight");
	const last = tree.getByRole("row", {
		name: `Bulk ${count}`,
		exact: true,
	});
	// Only the rows in view exist, so reaching the last folder by scrolling
	// proves every page loaded, in order. A real mouse wheel, because paging
	// starts once the user has scrolled.
	await tree.hover();
	await expect
		.poll(
			async () => {
				await page.mouse.wheel(0, 100_000);
				return last.isVisible();
			},
			{ timeout: 120_000, intervals: [100] },
		)
		.toBe(true);
	expect(
		await tree.locator('[role="row"]').count(),
		"rows in the DOM",
	).toBeLessThan(100);
	domRows = await tree.locator('[role="row"]').count();
	await tree.evaluate((element) => {
		element.scrollTop = 0;
	});
	const loaded = await now();
	await tree.getByRole("row", { name: "Bulk 0001", exact: true }).focus();
	for (let press = 0; press < 30; press++)
		await page.keyboard.press("ArrowDown");
	await expect(
		tree.getByRole("row", { name: "Bulk 0031", exact: true }),
	).toBeFocused();

	const finished = await now();
	const tasks = await page.evaluate(() => {
		for (const entry of window.__longTaskObserver.takeRecords()) {
			window.__longTasks.push({
				start: entry.startTime,
				duration: entry.duration,
			});
		}
		return window.__longTasks;
	});
	const max = (from: number, to: number) =>
		Math.max(
			0,
			...tasks
				.filter((task) => task.start >= from && task.start < to)
				.map((task) => task.duration),
		);
	const longest = max(0, finished);
	console.log(
		`folder-tree ${count} folders: ${domRows} rows in the DOM; ${tasks.length} long tasks; max ${longest.toFixed(0)} ms overall (page boot ${max(0, booted).toFixed(0)} ms, paging in ${max(booted, loaded).toFixed(0)} ms, 30 ArrowDown presses ${max(loaded, finished).toFixed(0)} ms)`,
	);
	expect(longest).toBeLessThan(200);

	// Revealing a folder deep in a large parent pages to it and scrolls there.
	const deepName = "Bulk 0900";
	const deepId = await findChildId(page, parentId, deepName);
	await page.goto(`/library/${deepId}`);
	await library.expectFolder(deepName);
	await expect(
		tree.getByRole("row", { name: `${deepName}, current folder` }),
	).toBeInViewport({ ratio: 1 });
});

// Creates folders through the API from the signed-in page, eight at a time.
// The folder's own parent is the workspace root when `parentId` is omitted.
async function createFolders(page: Page, parentId: string, names: string[]) {
	const failures = await page.evaluate(
		async ({ parentId, names }) => {
			const csrf = (await (
				await fetch("/api/v1/auth/csrf", { credentials: "include" })
			).json()) as {
				headerName: string;
				token: string;
			};
			let next = 0;
			let failed = 0;
			async function worker() {
				while (next < names.length) {
					const index = next++;
					const response = await fetch("/api/v1/folders", {
						method: "POST",
						credentials: "include",
						headers: {
							"Content-Type": "application/json",
							"Idempotency-Key": crypto.randomUUID(),
							[csrf.headerName]: csrf.token,
						},
						body: JSON.stringify({
							name: names[index],
							parentId,
						}),
					});
					if (!response.ok) failed++;
				}
			}
			await Promise.all(Array.from({ length: 8 }, worker));
			return failed;
		},
		{ parentId, names },
	);
	expect(failures, "failed folder creations").toBe(0);
}

// Finds a child folder's ID by paging the API from the signed-in page.
async function findChildId(page: Page, parentId: string, name: string) {
	const id = await page.evaluate(
		async ({ parentId, name }) => {
			let cursor: string | null = null;
			do {
				const query: string = new URLSearchParams({
					kind: "folder",
					limit: "100",
					...(cursor ? { cursor } : {}),
				}).toString();
				const response: Response = await fetch(
					`/api/v1/entries/${parentId}/children?${query}`,
					{ credentials: "include" },
				);
				const body = (await response.json()) as {
					entries: { id: string; name: string }[];
					nextCursor: string | null;
				};
				const found = body.entries.find((entry) => entry.name === name);
				if (found) return found.id;
				cursor = body.nextCursor;
			} while (cursor);
			return null;
		},
		{ parentId, name },
	);
	expect(id, `${name} in the parent's listing`).not.toBeNull();
	return id as string;
}

async function workspaceRootId(page: Page) {
	return page.evaluate(async () => {
		const response = await fetch("/api/v1/catalog/root", {
			credentials: "include",
		});
		return ((await response.json()) as { id: string }).id;
	});
}
