import type { components } from "~/lib/api/generated/schema";

export type StorageSummary = components["schemas"]["StorageSummaryResponse"];
export type UploadLimits = components["schemas"]["UploadLimitsResponse"];

const decimal = /^(0|[1-9][0-9]*)$/;

/** The limit as a number of bytes, or undefined when the server sent something else. */
export function maximumBytes(limits: UploadLimits) {
	return decimal.test(limits.maximumBytes)
		? BigInt(limits.maximumBytes)
		: undefined;
}
