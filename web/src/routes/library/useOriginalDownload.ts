import { useCallback, useState } from "react";
import { catalogService } from "~/services";

// The whole original is buffered as a Blob first, then handed to the browser.
async function saveOriginal(id: string, name: string) {
	try {
		const blob = await catalogService.downloadOriginal(id);
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = name;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
		return "Original sent to your browser for saving.";
	} catch {
		return "Download failed. Check your session or connection and try again.";
	}
}

// Callers place the button and the status line; a row and the inspector lay
// them out differently.
export function useOriginalDownload(id: string, name: string) {
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	async function download() {
		setBusy(true);
		setMessage("");
		setMessage(await saveOriginal(id, name));
		setBusy(false);
	}
	return {
		busy,
		download: () => void download(),
		status: busy ? "Downloading…" : message,
	};
}

export interface OriginalDownloads {
	busy(id: string): boolean;
	download(id: string, name: string): void;
	status(id: string): string;
}

/** Downloads started from a listing, keyed by entry, so its rows stay plain views. */
export function useOriginalDownloads(): OriginalDownloads {
	const [downloads, setDownloads] = useState<
		Readonly<Record<string, { busy: boolean; message: string }>>
	>({});
	const update = useCallback(
		(id: string, busy: boolean, message: string) =>
			setDownloads((current) => ({ ...current, [id]: { busy, message } })),
		[],
	);
	return {
		busy: (id) => downloads[id]?.busy ?? false,
		download: (id, name) => {
			update(id, true, "");
			void saveOriginal(id, name).then((message) => update(id, false, message));
		},
		status: (id) => {
			const download = downloads[id];
			return download?.busy ? "Downloading…" : (download?.message ?? "");
		},
	};
}
