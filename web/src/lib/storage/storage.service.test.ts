import { expect, it } from "vitest";
import { createApiClient } from "~/lib/api/api";
import { maximumBytes } from "./storage";
import { createStorageService } from "./storage.service";

it("reads the summary and the upload limit with cookie credentials", async () => {
	const requests: Request[] = [];
	const storage = createStorageService({
		api: createApiClient({
			baseUrl: "http://test",
			fetch: async (request) => {
				requests.push(request);
				return request.url.endsWith("/storage")
					? Response.json({
							connection: {
								displayName: "Family archive",
								providerKind: "local",
							},
							capabilities: {
								sha256Verification: true,
								resumableUploads: false,
								rangeDownloads: false,
							},
							usedBytes: "9007199254740993",
						})
					: Response.json({ maximumBytes: "134217728" });
			},
		}),
	});
	expect((await storage.summary()).usedBytes).toBe("9007199254740993");
	expect(maximumBytes(await storage.uploadLimits())).toBe(134217728n);
	expect(requests.map((request) => [request.url, request.credentials])).toEqual(
		[
			["http://test/api/v1/storage", "include"],
			["http://test/api/v1/upload-limits", "include"],
		],
	);
});

it("accepts only an exact decimal limit", () => {
	expect(maximumBytes({ maximumBytes: "0" })).toBe(0n);
	expect(maximumBytes({ maximumBytes: "9007199254740993" })).toBe(
		9007199254740993n,
	);
	for (const invalid of ["", "-1", "1.5", "012", "1e3"]) {
		expect(maximumBytes({ maximumBytes: invalid })).toBeUndefined();
	}
});
