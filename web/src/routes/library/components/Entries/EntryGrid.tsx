import { GridList, GridListItem } from "react-aria-components";
import { cn } from "~/lib/ui/utils";
import { EntryIcon } from "../EntryIcon";
import { DownloadStatus, EntryActions } from "./EntryActions";
import type { EntryItem } from "./useEntries";

const item =
	"relative flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-2 text-foreground outline-none data-focus-visible:outline-2 data-focus-visible:outline-solid data-focus-visible:outline-offset-2 data-focus-visible:outline-ring";

/**
 * Tiles with a large type icon (thumbnails come with the preview pipeline).
 * Arrows move between tiles in two dimensions; Tab reaches a tile's buttons.
 */
export function EntryGrid({
	items,
	labelledBy,
}: {
	items: readonly EntryItem[];
	labelledBy: string;
}) {
	return (
		<GridList
			aria-labelledby={labelledBy}
			className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3"
			items={items}
			keyboardNavigationBehavior="tab"
			layout="grid"
		>
			{(entry) => (
				<GridListItem
					className={cn(
						item,
						entry.inspected
							? "border-selection-border bg-selection text-selection-foreground"
							: "hover:bg-accent",
						entry.href ? "cursor-pointer" : undefined,
					)}
					data-inspected={entry.inspected || undefined}
					href={entry.href}
					id={entry.entry.id}
					textValue={entry.entry.name}
				>
					<span className="grid aspect-[4/3] place-items-center rounded-md bg-muted">
						<EntryIcon
							className="size-12"
							family={entry.family}
							strokeWidth={1.25}
						/>
					</span>
					<span className="grid gap-0.5 px-1">
						<span
							className="line-clamp-2 text-sm font-medium wrap-anywhere"
							title={entry.entry.name}
						>
							{entry.entry.name}
						</span>
						<span className="flex items-center justify-between gap-1">
							<span
								className="truncate text-xs text-muted-foreground"
								title={`Modified ${entry.modifiedFull}`}
							>
								{entry.meta}
							</span>
							<EntryActions className="-mr-1 gap-0" item={entry} />
						</span>
						<DownloadStatus className="text-xs" item={entry} />
					</span>
				</GridListItem>
			)}
		</GridList>
	);
}
