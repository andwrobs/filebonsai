import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { ApiError } from "~/lib/api/api";
import { queryClient } from "~/lib/query/client";
import { storageService, transfersService } from "~/services";
import {
	cancellable,
	failureMessage,
	oversizeMessage,
	sessionUnavailable,
	settled,
	stateMessages,
	type Transfer,
	type TransferAction,
	type Upload,
} from "./transfers";
import { createUploadLimit, type UploadLimit } from "./upload-limit";

export interface TransferState {
	/** Every upload started in this tab, oldest first. */
	items: Transfer[];
	/** Starts uploading a file into a folder and returns its key. */
	add(file: File, parentId: string): string;
	/**
	 * Continues, checks, or cancels a transfer. A cancel supersedes a running
	 * operation; replies to the superseded one are ignored.
	 */
	run(key: string, action: TransferAction): Promise<void>;
}

type Deps = {
	transfers: typeof transfersService;
	limit: UploadLimit;
};

export function createTransferStore({ transfers, limit }: Deps) {
	// Each run takes the next epoch for its transfer; only the latest may write.
	const epochs = new Map<string, number>();
	const current = (key: string, epoch: number) => epochs.get(key) === epoch;

	return createStore<TransferState>()((set, get) => {
		function patch(key: string, changes: Partial<Transfer>) {
			set(({ items }) => ({
				items: items.map((item) =>
					item.key === key ? { ...item, ...changes } : item,
				),
			}));
		}

		function add(file: File, parentId: string) {
			const key = crypto.randomUUID();
			set(({ items }) => ({
				items: [
					...items,
					{ key, file, parentId, busy: false, message: "Waiting to begin…" },
				],
			}));
			void run(key, "continue");
			return key;
		}

		async function run(key: string, action: TransferAction) {
			const item = get().items.find((candidate) => candidate.key === key);
			if (!item || (item.busy && action !== "cancel") || settled(item)) return;
			const epoch = (epochs.get(key) ?? 0) + 1;
			epochs.set(key, epoch);
			patch(key, { busy: true, message: "Checking upload…" });
			const accept = (upload: Upload) => {
				if (!current(key, epoch)) throw new Error("Superseded operation");
				patch(key, { upload, message: stateMessages[upload.state] });
				return upload;
			};
			try {
				await transfers.confirmSession().catch((error: unknown) => {
					throw error instanceof ApiError && error.kind === "http"
						? new Error(sessionUnavailable)
						: error;
				});
				if (!item.upload) {
					const size = BigInt(item.file.size);
					const refusing = await limit.refusing(size);
					if (!current(key, epoch)) return;
					if (refusing !== undefined) {
						patch(key, {
							refused: true,
							message: oversizeMessage(size, refusing),
						});
						return;
					}
				}
				// Reuse the same key after a lost begin reply to recover the reserved intent.
				let upload = accept(
					item.upload
						? await transfers.status(item.upload.id)
						: await transfers.begin(
								{
									parentId: item.parentId,
									name: item.file.name,
									sizeBytes: String(item.file.size),
								},
								key,
							),
				);
				if (action === "cancel" && cancellable(upload.state)) {
					accept(await transfers.cancel(upload.id));
				} else if (action === "continue") {
					if (upload.state === "INITIATED") {
						patch(key, {
							message: "Sending whole file and awaiting body verification…",
						});
						upload = accept(await transfers.send(upload.id, item.file));
					}
					if (upload.state === "STAGED") {
						patch(key, {
							message: "Finalizing. Availability is not confirmed yet…",
						});
						accept(await transfers.complete(upload.id));
					}
				}
			} catch (error) {
				// The server may have been reconfigured since the limit was read.
				if (error instanceof ApiError && error.status === 413) limit.forget();
				if (!current(key, epoch)) return;
				patch(key, { message: failureMessage(error) });
			} finally {
				if (current(key, epoch)) patch(key, { busy: false });
			}
		}

		return { items: [], add, run };
	});
}

// Owned outside route components: navigation only changes who observes a
// transfer, never whether it runs. Closing or reloading the tab ends them all.
export const transferStore = createTransferStore({
	transfers: transfersService,
	limit: createUploadLimit({ queryClient, storage: storageService }),
});

export function useTransfers<T>(selector: (state: TransferState) => T) {
	return useStore(transferStore, selector);
}
