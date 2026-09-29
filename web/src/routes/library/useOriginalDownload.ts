import { useState } from "react";
import { catalogService } from "~/services";

// Callers place the button and the status line; a row and the inspector lay
// them out differently. The whole original is buffered as a Blob first.
export function useOriginalDownload(id: string, name: string) {
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	async function download() {
		setBusy(true);
		setMessage("");
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
			setMessage("Original sent to your browser for saving.");
		} catch {
			setMessage(
				"Download failed. Check your session or connection and try again.",
			);
		} finally {
			setBusy(false);
		}
	}
	return {
		busy,
		download: () => void download(),
		status: busy ? "Downloading…" : message,
	};
}
