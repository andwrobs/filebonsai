import { useId } from "react";
import type { FileEntry } from "~/lib/catalog/catalog";
import { formatBytes } from "~/lib/format/bytes";
import { type PreviewPolicy, previewPolicy } from "../../preview-policy";
import { usePreview } from "./usePreview";

export function FilePreview({ entry }: { entry: FileEntry }) {
	const titleId = useId();
	const policy = previewPolicy(entry);
	return (
		<section
			aria-labelledby={titleId}
			className="inspector-section inspector-preview"
		>
			<h3 className="inspector-section-title" id={titleId}>
				Preview
			</h3>
			{policy.kind === "unsupported" ? (
				<p className="inspector-preview-message">
					Preview isn't available for this file type. Download the original to
					open it.
				</p>
			) : null}
			{policy.kind === "too-large" ? (
				<p className="inspector-preview-message">
					This file is over the {formatBytes(String(policy.maxBytes))} preview
					limit. Download the original to open it.
				</p>
			) : null}
			{policy.kind === "image" || policy.kind === "text" ? (
				<LoadedPreview entry={entry} policy={policy} />
			) : null}
		</section>
	);
}

function LoadedPreview({
	entry,
	policy,
}: {
	entry: FileEntry;
	policy: Extract<PreviewPolicy, { kind: "image" | "text" }>;
}) {
	const { state, failDecode } = usePreview(entry, policy);
	if (state.kind === "loading") {
		return (
			<p className="inspector-preview-message" role="status">
				Loading preview…
			</p>
		);
	}
	if (state.kind === "failed") {
		return (
			<p className="inspector-preview-message" role="status">
				Preview couldn't be loaded. You can still download the original.
			</p>
		);
	}
	if (state.kind === "text") {
		return <pre className="inspector-preview-text">{state.content}</pre>;
	}
	return (
		<img
			alt={`Preview of ${entry.name}`}
			className="inspector-preview-image"
			onError={failDecode}
			src={state.url}
		/>
	);
}
