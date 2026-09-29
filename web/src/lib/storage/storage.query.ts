import { queryOptions } from "@tanstack/react-query";
import { storageService } from "~/services";

export const storageKeys = {
	all: ["storage"] as const,
	summary: () => [...storageKeys.all, "summary"] as const,
	uploadLimits: () => [...storageKeys.all, "upload-limits"] as const,
};

export function storageSummaryQuery() {
	return queryOptions({
		queryKey: storageKeys.summary(),
		queryFn: ({ signal }) => storageService.summary({ signal }),
	});
}

// Read once per tab: transfers read it again after a 413 or before refusing a
// file (lib/transfers/upload-limit.ts), and the Storage page on every visit.
// A failed read isn't retried; the server still enforces the limit.
export function uploadLimitsQuery(
	storage: Pick<typeof storageService, "uploadLimits"> = storageService,
) {
	return queryOptions({
		queryKey: storageKeys.uploadLimits(),
		queryFn: ({ signal }) => storage.uploadLimits({ signal }),
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
	});
}
