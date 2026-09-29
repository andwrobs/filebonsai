// @vitest-environment node
// Node's fetch reads Node Blobs; jsdom's File would reach it as "[object File]".
import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { createApiClient } from "~/lib/api/api";
import { createStorageService } from "~/lib/storage/storage.service";
import { createTransferStore } from "./transfer-store";
import { oversizeMessage, settled } from "./transfers";
import { createTransfersService } from "./transfers.service";
import { createUploadLimit } from "./upload-limit";

type Store = ReturnType<typeof createTransferStore>;

function store(respond: (request: Request) => Response | Promise<Response>) {
	const api = createApiClient({
		baseUrl: "http://test",
		fetch: async (request) => respond(request),
	});
	return createTransferStore({
		transfers: createTransfersService({ api }),
		limit: createUploadLimitFor(api),
	});
}

function createUploadLimitFor(api: ReturnType<typeof createApiClient>) {
	return createUploadLimit({
		queryClient: new QueryClient(),
		storage: createStorageService({ api }),
	});
}

const items = (transfers: Store) => transfers.getState().items;

async function idle(transfers: Store) {
	while (items(transfers).some((item) => item.busy)) {
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}

const stateAfter = (request: Request) =>
	request.url.endsWith("/complete")
		? "AVAILABLE"
		: request.url.endsWith("/content")
			? "STAGED"
			: "INITIATED";

for (const content of ["", "synthetic original"]) {
	it(`uploads the exact binary body (${content.length} bytes) with cookies and CSRF`, async () => {
		let state = "INITIATED";
		const transfers = store(async (request) => {
			expect(request.credentials).toBe("include");
			if (request.url.endsWith("csrf"))
				return Response.json({ token: "test-token" });
			if (request.url.endsWith("/upload-limits"))
				return Response.json({ maximumBytes: "1024" });
			if (request.method !== "GET") {
				expect(request.headers.get("X-CSRF-TOKEN")).toBe("test-token");
			}
			if (request.url.endsWith("/content")) {
				expect(request.headers.get("Content-Type")).toBe(
					"application/octet-stream",
				);
				expect(await request.text()).toBe(content);
				state = "STAGED";
			} else if (request.url.endsWith("/complete")) {
				state = "AVAILABLE";
			} else if (request.method === "POST") {
				expect((await request.json()).sizeBytes).toBe(String(content.length));
			}
			return Response.json({ id: "upload", state });
		});
		transfers.getState().add(new File([content], "test.txt"), "folder");
		await idle(transfers);
		expect(items(transfers)[0]?.upload?.state).toBe("AVAILABLE");
	});
}

it("reuses the begin intent after lost replies and never resends accepted bytes", async () => {
	let state = "INITIATED";
	let begins = 0;
	let bodies = 0;
	const keys: (string | null)[] = [];
	const transfers = store(async (request) => {
		if (request.url.endsWith("csrf")) return Response.json({ token: "token" });
		if (request.url.endsWith("/upload-limits"))
			return Response.json({ maximumBytes: "1024" });
		if (request.url.endsWith("/uploads")) {
			keys.push(request.headers.get("Idempotency-Key"));
			if (++begins === 1) throw new TypeError("lost response");
		}
		if (request.url.endsWith("/content")) {
			bodies++;
			state = "STAGED";
		}
		if (request.url.endsWith("/complete")) {
			state = "RECONCILING";
			throw new TypeError("lost response");
		}
		return Response.json({ id: "upload", state });
	});
	const key = transfers
		.getState()
		.add(new File(["body"], "test.txt"), "folder");
	await idle(transfers);
	expect(items(transfers)[0]?.message).toBe(
		"Connection lost. The outcome is unknown. Check status before continuing.",
	);
	await transfers.getState().run(key, "continue");
	await transfers.getState().run(key, "continue");
	expect(keys[0]).toBe(keys[1]);
	expect(bodies).toBe(1);
	expect(items(transfers)[0]?.upload?.state).toBe("RECONCILING");
	state = "AVAILABLE";
	await transfers.getState().run(key, "check");
	expect(items(transfers)[0]?.upload?.state).toBe("AVAILABLE");
});

it("retries an interrupted body from byte zero, and the server confirms cancellation", async () => {
	let bodies = 0;
	let state = "INITIATED";
	const transfers = store(async (request) => {
		if (request.url.endsWith("csrf")) return Response.json({ token: "token" });
		if (request.url.endsWith("/upload-limits"))
			return Response.json({ maximumBytes: "1024" });
		if (request.url.endsWith("content")) {
			bodies++;
			expect(await request.text()).toBe("whole body");
			throw new TypeError("interrupted");
		}
		if (request.method === "DELETE") state = "CANCELLED";
		return Response.json({ id: "upload", state });
	});
	const key = transfers
		.getState()
		.add(new File(["whole body"], "test.txt"), "folder");
	await idle(transfers);
	await transfers.getState().run(key, "continue");
	expect(bodies).toBe(2);
	await transfers.getState().run(key, "cancel");
	expect(items(transfers)[0]?.upload?.state).toBe("CANCELLED");
});

it("names a lost session instead of guessing the outcome", async () => {
	const transfers = store((request) =>
		request.url.endsWith("csrf")
			? Response.json({ code: "AUTH_REQUIRED" }, { status: 403 })
			: Response.json({ id: "upload", state: "INITIATED" }),
	);
	transfers.getState().add(new File(["body"], "test.txt"), "folder");
	await idle(transfers);
	expect(items(transfers)[0]?.message).toBe(
		"Session unavailable. Sign in again, then check status.",
	);
});

it("refuses files over the server limit before beginning, confirming only refusals", async () => {
	let limitReads = 0;
	const begun: string[] = [];
	const transfers = store(async (request) => {
		if (request.url.endsWith("csrf")) return Response.json({ token: "token" });
		if (request.url.endsWith("/upload-limits")) {
			limitReads++;
			return Response.json({ maximumBytes: "4" });
		}
		if (request.url.endsWith("/uploads"))
			begun.push((await request.json()).name);
		return Response.json({ id: "upload", state: stateAfter(request) });
	});
	const over = transfers
		.getState()
		.add(new File(["12345"], "over.bin"), "folder");
	transfers.getState().add(new File(["1234"], "exact.bin"), "folder");
	await idle(transfers);
	const [refused, exact] = items(transfers);
	expect(refused?.refused).toBe(true);
	expect(refused?.upload).toBeUndefined();
	expect(refused?.message).toBe(
		"Too large to upload: 5 B is over the 4 B limit. Nothing was sent.",
	);
	expect(refused && settled(refused)).toBe(true);
	expect(exact?.upload?.state).toBe("AVAILABLE");
	await transfers.getState().run(over, "continue");
	expect(begun).toEqual(["exact.bin"]);
	// One shared read for both files, plus one fresh read confirming the refusal.
	expect(limitReads).toBe(2);
});

function limitScenario(limits: string[]) {
	const counts = { reads: 0, begins: 0 };
	let serverLimit = 0n;
	const transfers = store(async (request) => {
		if (request.url.endsWith("csrf")) return Response.json({ token: "token" });
		if (request.url.endsWith("/upload-limits")) {
			const maximumBytes = limits[
				Math.min(counts.reads++, limits.length - 1)
			] as string;
			serverLimit = BigInt(maximumBytes);
			return Response.json({ maximumBytes });
		}
		if (request.url.endsWith("/uploads")) {
			counts.begins++;
			if (BigInt((await request.json()).sizeBytes) > serverLimit) {
				return Response.json({ code: "TOO_LARGE" }, { status: 413 });
			}
		}
		return Response.json({ id: "upload", state: stateAfter(request) });
	});
	return {
		transfers,
		counts,
		lower: (limit: string) => {
			serverLimit = BigInt(limit);
		},
	};
}

it("reads the limit again after a 413 answers a stale cached limit", async () => {
	const { transfers, counts, lower } = limitScenario(["10", "4"]);
	transfers.getState().add(new File(["123"], "first.bin"), "folder");
	await idle(transfers);
	expect(counts.reads).toBe(1);
	lower("4");
	const key = transfers
		.getState()
		.add(new File(["12345"], "second.bin"), "folder");
	await idle(transfers);
	expect(counts.begins).toBe(2);
	expect(items(transfers)[1]?.refused).toBeUndefined();
	await transfers.getState().run(key, "continue");
	expect(counts.begins).toBe(2);
	expect(items(transfers)[1]?.refused).toBe(true);
});

it("honours a raised limit instead of a stale cached refusal", async () => {
	const { transfers, counts } = limitScenario(["4", "8"]);
	transfers.getState().add(new File(["12345"], "grown.bin"), "folder");
	await idle(transfers);
	expect(counts.reads).toBe(2);
	expect(items(transfers)[0]?.refused).toBeUndefined();
	expect(items(transfers)[0]?.upload?.state).toBe("AVAILABLE");
});

it("defers to the server when the limit can't be read", async () => {
	let limit: string | undefined;
	let begins = 0;
	const transfers = store((request) => {
		if (request.url.endsWith("csrf")) return Response.json({ token: "token" });
		if (request.url.endsWith("/upload-limits")) {
			return limit
				? Response.json({ maximumBytes: limit })
				: Response.json({ code: "STORAGE_UNAVAILABLE" }, { status: 503 });
		}
		begins++;
		return Response.json(
			{
				code: "TOO_LARGE",
				message: "Upload exceeds the configured size limit",
			},
			{ status: 413 },
		);
	});
	const key = transfers
		.getState()
		.add(new File(["12345"], "big.bin"), "folder");
	await idle(transfers);
	expect(begins).toBe(1);
	expect(items(transfers)[0]?.refused).toBeUndefined();
	limit = "4";
	await transfers.getState().run(key, "continue");
	expect(begins).toBe(1);
	expect(items(transfers)[0]?.refused).toBe(true);
});

it("falls back to exact bytes when rounded sizes match", () => {
	const limit = 128n * 1024n * 1024n;
	expect(oversizeMessage(2n * 1024n * 1024n * 1024n, limit)).toBe(
		"Too large to upload: 2 GB is over the 128 MB limit. Nothing was sent.",
	);
	expect(oversizeMessage(limit + 1n, limit)).toBe(
		`Too large to upload: ${(limit + 1n).toLocaleString()} bytes is over the ${limit.toLocaleString()} bytes limit. Nothing was sent.`,
	);
});

it("cancellation fences a pending body and uses a rotated CSRF token", async () => {
	let state = "INITIATED";
	let token = "first";
	let release!: () => void;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	let receiving!: () => void;
	const received = new Promise<void>((resolve) => {
		receiving = resolve;
	});
	const transfers = store(async (request) => {
		if (request.url.endsWith("csrf")) return Response.json({ token });
		if (request.url.endsWith("/upload-limits"))
			return Response.json({ maximumBytes: "1024" });
		if (request.method !== "GET") {
			expect(request.headers.get("X-CSRF-TOKEN")).toBe(token);
		}
		if (request.url.endsWith("content")) {
			state = "RECEIVING";
			receiving();
			await pending;
			return Response.json({ id: "upload", state: "STAGED" });
		}
		expect(
			request.url.endsWith("complete"),
			"a cancelled body must not complete",
		).toBe(false);
		if (request.method === "DELETE") state = "CANCELLED";
		return Response.json({ id: "upload", state });
	});
	const key = transfers
		.getState()
		.add(new File(["body"], "test.txt"), "folder");
	await received;
	token = "rotated";
	await transfers.getState().run(key, "cancel");
	release();
	await new Promise((resolve) => setTimeout(resolve, 5));
	expect(items(transfers)[0]?.upload?.state).toBe("CANCELLED");
});
