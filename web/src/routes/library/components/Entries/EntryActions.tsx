import { Download, Info } from "lucide-react";
import type { Entry } from "~/lib/catalog/catalog";
import { Button } from "~/lib/ui/button";
import { cn } from "~/lib/ui/utils";
import type { EntryItem } from "./useEntries";

/** Download (files) and Details, the same in every view. */
export function EntryActions({
	className,
	item,
}: {
	className?: string;
	item: EntryItem;
}) {
	const { entry } = item;
	return (
		<span className={cn("flex justify-end gap-1", className)}>
			{entry.kind === "file" ? (
				<Button
					aria-busy={item.downloading}
					aria-label={`Download ${entry.name}`}
					isDisabled={item.downloading}
					onPress={item.download}
					size="icon"
					variant="ghost"
				>
					<Download aria-hidden="true" />
				</Button>
			) : null}
			<DetailsButton entry={entry} item={item} />
		</span>
	);
}

function DetailsButton({ entry, item }: { entry: Entry; item: EntryItem }) {
	return (
		<Button
			aria-controls={item.inspected ? item.inspectorId : undefined}
			aria-expanded={item.inspected}
			aria-label={`Details for ${entry.name}`}
			onPress={(event) => item.toggleDetails(event.target as HTMLButtonElement)}
			size="icon"
			variant="ghost"
		>
			<Info aria-hidden="true" />
		</Button>
	);
}

/** A file's download progress or result; empty (and hidden) otherwise. */
export function DownloadStatus({
	className,
	item,
}: {
	className?: string;
	item: EntryItem;
}) {
	if (item.entry.kind !== "file") return null;
	return (
		<span
			className={cn("text-sm text-muted-foreground empty:hidden", className)}
			role="status"
		>
			{item.downloadStatus}
		</span>
	);
}
