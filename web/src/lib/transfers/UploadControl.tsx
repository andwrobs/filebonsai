import { Upload } from "lucide-react";
import { useRef } from "react";
import { transferStore } from "./transfer-store";

// "toolbar" is the labelled page action; "fab" is the floating phone action;
// "inline" sits in empty states.
export function UploadControl({
	parentId,
	variant = "toolbar",
}: {
	parentId: string;
	variant?: "toolbar" | "fab" | "inline";
}) {
	const input = useRef<HTMLInputElement>(null);
	const className =
		variant === "fab"
			? "fab"
			: variant === "toolbar"
				? "button primary toolbar-upload"
				: "button primary";
	return (
		<>
			<button
				aria-label={variant === "fab" ? "Upload files" : undefined}
				className={className}
				onClick={() => input.current?.click()}
				type="button"
			>
				<Upload aria-hidden="true" className="button-icon" strokeWidth={2} />
				{variant === "fab" ? null : <span>Upload</span>}
			</button>
			<input
				ref={input}
				type="file"
				multiple
				hidden
				tabIndex={-1}
				aria-label="Upload files"
				onChange={(event) => {
					const { add } = transferStore.getState();
					for (const file of Array.from(event.target.files ?? [])) {
						add(file, parentId);
					}
					event.target.value = "";
				}}
			/>
		</>
	);
}
