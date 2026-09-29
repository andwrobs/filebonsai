import { useEffect, useState } from "react";
import type { FileEntry } from "~/lib/catalog/catalog";
import { catalogService } from "~/services";
import type { PreviewPolicy } from "../../preview-policy";

export type PreviewState =
	| { kind: "loading" }
	| { kind: "image"; url: string }
	| { kind: "text"; content: string }
	| { kind: "failed" };

/**
 * Loads one allow-listed original for preview. It checks the size again after
 * the fetch, types the Blob from the policy, never from the server, and revokes
 * the image URL when the entry, its version, or the component goes away.
 */
export function usePreview(
	entry: FileEntry,
	policy: Extract<PreviewPolicy, { kind: "image" | "text" }>,
) {
	const [state, setState] = useState<PreviewState>({ kind: "loading" });
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new version is new content.
	useEffect(() => {
		let active = true;
		let objectUrl: string | undefined;
		const controller = new AbortController();
		setState({ kind: "loading" });
		async function load() {
			try {
				const original = await catalogService.downloadOriginal(entry.id, {
					signal: controller.signal,
				});
				if (!active) return;
				if (original.size > policy.maxBytes) {
					throw new Error("Preview unavailable");
				}
				// The content endpoint is an attachment. Give only allow-listed extensions a safe type.
				const typed = new Blob([original], { type: policy.mimeType });
				if (policy.kind === "text") {
					const content = await typed.text();
					if (active) setState({ kind: "text", content });
				} else {
					objectUrl = URL.createObjectURL(typed);
					setState({ kind: "image", url: objectUrl });
				}
			} catch {
				if (active) setState({ kind: "failed" });
			}
		}
		void load();
		return () => {
			active = false;
			controller.abort();
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [
		entry.id,
		entry.currentVersion.id,
		policy.kind,
		policy.maxBytes,
		policy.mimeType,
	]);

	return {
		state,
		/** The browser couldn't decode the image; drop it and say so. */
		failDecode() {
			if (state.kind === "image") URL.revokeObjectURL(state.url);
			setState({ kind: "failed" });
		},
	};
}
