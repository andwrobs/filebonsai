import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { isUnauthorized } from "~/lib/api/api";
import { maximumBytes, type StorageSummary } from "~/lib/storage/storage";
import {
	storageSummaryQuery,
	uploadLimitsQuery,
} from "~/lib/storage/storage.query";
import { type StorageFailure, storageFailure } from "../../storage";

export type StorageDetailsState =
	| { status: "loading" }
	| { status: "ready"; summary: StorageSummary; maximumBytes: bigint | null }
	| { status: "failed"; failure: StorageFailure };

// Loaded here rather than in a clientLoader: this page owns its loading, error,
// and unavailable states inside the shell, and reads fresh values on each visit.
export function useStorageDetails() {
	const navigate = useNavigate();
	const summary = useQuery({
		...storageSummaryQuery(),
		refetchOnMount: "always",
	});
	const limits = useQuery({ ...uploadLimitsQuery(), refetchOnMount: "always" });
	const signedOut = isUnauthorized(summary.error);
	useEffect(() => {
		if (signedOut) void navigate("/sign-in", { replace: true });
	}, [signedOut, navigate]);

	let state: StorageDetailsState = { status: "loading" };
	if (summary.data && !limits.isPending) {
		// The page still describes the connection when only the limit read fails.
		const limit = limits.data ? maximumBytes(limits.data) : undefined;
		state = {
			status: "ready",
			summary: summary.data,
			maximumBytes: limit ?? null,
		};
	} else if (summary.isError && !summary.isFetching && !signedOut) {
		state = { status: "failed", failure: storageFailure(summary.error) };
	}

	return {
		state,
		retry() {
			void summary.refetch();
			void limits.refetch();
		},
	};
}
