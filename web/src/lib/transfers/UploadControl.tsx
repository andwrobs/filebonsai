import { Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "~/lib/ui/button";
import { transferStore } from "./transfer-store";

// "toolbar" is the labelled page action (phones hide it for the floating button);
// "fab" is the floating phone action, kept above the bottom navigation and any
// transfer tray (TransferTray publishes --tray-height); "inline" sits in empty
// states. The toolbar and inline buttons move onto lib/ui with the Library list.
export function UploadControl({
	parentId,
	variant = "toolbar",
}: {
	parentId: string;
	variant?: "toolbar" | "fab" | "inline";
}) {
	const input = useRef<HTMLInputElement>(null);
	const choose = () => input.current?.click();
	return (
		<>
			{variant === "fab" ? (
				<Button
					aria-label="Upload files"
					className="fixed right-[max(--spacing(4),env(safe-area-inset-right))] bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+var(--tray-height,0px)+--spacing(4))] z-15 size-14 rounded-pill border-0 p-0 shadow-floating md:hidden"
					onPress={choose}
				>
					<Upload aria-hidden="true" className="size-6" strokeWidth={2} />
				</Button>
			) : (
				<button
					className={
						variant === "toolbar"
							? "button primary toolbar-upload"
							: "button primary"
					}
					onClick={choose}
					type="button"
				>
					<Upload aria-hidden="true" className="button-icon" strokeWidth={2} />
					<span>Upload</span>
				</button>
			)}
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
