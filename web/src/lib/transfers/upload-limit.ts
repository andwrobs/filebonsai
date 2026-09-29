import type { QueryClient } from "@tanstack/react-query";
import { maximumBytes } from "~/lib/storage/storage";
import { storageKeys, uploadLimitsQuery } from "~/lib/storage/storage.query";
import type { storageService } from "~/services";

// The preflight only saves a doomed request: an unknown limit leaves the
// decision to the server, and a refusal is confirmed against a fresh read.
export interface UploadLimit {
	/** The largest accepted size, read once per tab; undefined when unreadable. */
	read(): Promise<bigint | undefined>;
	/** The limit a file of this size exceeds, confirmed by a fresh read, or undefined. */
	refusing(size: bigint): Promise<bigint | undefined>;
	/** Drops the held limit, for when the server answered 413. */
	forget(): void;
}

type Deps = {
	queryClient: QueryClient;
	storage: Pick<typeof storageService, "uploadLimits">;
};

export function createUploadLimit({ queryClient, storage }: Deps): UploadLimit {
	// Marks the held limit stale so the next read fetches; an open Storage page
	// stays subscribed to the same entry.
	function forget() {
		void queryClient.invalidateQueries({
			queryKey: storageKeys.uploadLimits(),
			refetchType: "none",
		});
	}

	async function read() {
		let limit: bigint | undefined;
		try {
			limit = maximumBytes(
				await queryClient.fetchQuery(uploadLimitsQuery(storage)),
			);
		} catch {
			// Query holds no data after a failed read, so the next call reads again.
			return undefined;
		}
		if (limit === undefined) forget();
		return limit;
	}

	async function refusing(size: bigint) {
		const held = await read();
		if (held === undefined || size <= held) return undefined;
		forget();
		const fresh = await read();
		return fresh !== undefined && size > fresh ? fresh : undefined;
	}

	return { read, refusing, forget };
}
