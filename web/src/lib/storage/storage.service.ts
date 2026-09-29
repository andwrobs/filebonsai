import { type ApiClient, unwrap } from "~/lib/api/api";
import type { StorageSummary, UploadLimits } from "./storage";

type Options = { signal?: AbortSignal };

export interface StorageService {
	/** The configured connection, its capabilities, and committed bytes. */
	summary(options?: Options): Promise<StorageSummary>;
	/** The largest file begin-upload accepts. */
	uploadLimits(options?: Options): Promise<UploadLimits>;
}

type Deps = { api: ApiClient };

export function createStorageService({ api: { http } }: Deps): StorageService {
	function summary({ signal }: Options = {}) {
		return unwrap(http.GET("/api/v1/storage", { signal }));
	}

	function uploadLimits({ signal }: Options = {}) {
		return unwrap(http.GET("/api/v1/upload-limits", { signal }));
	}

	return { summary, uploadLimits };
}
