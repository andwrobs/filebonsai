import type { FileEntry } from "~/lib/catalog/catalog";

export const IMAGE_PREVIEW_LIMIT = 5 * 1024 * 1024;
export const TEXT_PREVIEW_LIMIT = 256 * 1024;

type PreviewType = {
	kind: "image" | "text";
	mimeType: string;
	maxBytes: number;
};
export type PreviewPolicy =
	| PreviewType
	| { kind: "unsupported" }
	| { kind: "too-large"; maxBytes: number };

const imageTypes: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
};

/** Allow only explicit formats; the server's attachment type never selects a renderer. */
export function previewPolicy(
	entry: Pick<FileEntry, "name" | "currentVersion">,
): PreviewPolicy {
	const dot = entry.name.lastIndexOf(".");
	const extension = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : "";
	const mimeType = imageTypes[extension];
	const allowed: PreviewType | undefined = mimeType
		? { kind: "image", mimeType, maxBytes: IMAGE_PREVIEW_LIMIT }
		: extension === "txt" || extension === "log"
			? {
					kind: "text",
					mimeType: "text/plain;charset=utf-8",
					maxBytes: TEXT_PREVIEW_LIMIT,
				}
			: undefined;
	if (!allowed) return { kind: "unsupported" };
	const size = BigInt(entry.currentVersion.sizeBytes);
	if (size > BigInt(allowed.maxBytes))
		return { kind: "too-large", maxBytes: allowed.maxBytes };
	return allowed;
}
