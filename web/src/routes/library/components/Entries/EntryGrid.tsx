import { GridList, GridListItem } from "react-aria-components";
import { cn } from "~/lib/ui/utils";
import { EntryIcon } from "../EntryIcon";
import { DownloadStatus, EntryActions } from "./EntryActions";
import { SelectionMark } from "./SelectionMark";
import type { EntryItem } from "./useEntries";
import type { CollectionSelection } from "./useEntrySelection";

const item =
	"relative flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-2 text-foreground outline-none data-focus-visible:outline-2 data-focus-visible:outline-solid data-focus-visible:outline-offset-2 data-focus-visible:outline-ring";

/**
 * Tiles with a large type icon (thumbnails come with the preview pipeline).
 * Arrows move between tiles in two dimensions; Tab reaches a tile's buttons.
 */
export function EntryGrid({
	items,
	labelledBy,
	selection,
}: {
	items: readonly EntryItem[];
	labelledBy: string;
	selection: CollectionSelection;
}) {
	return (
		<GridList
			aria-labelledby={labelledBy}
			className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3"
			items={items}
			keyboardNavigationBehavior="tab"
			layout="grid"
			{...selection}
		>
			{(entry) => (
				<GridListItem
					className={cn(
						item,
						"hover:bg-accent data-selected:border-selection-border data-selected:bg-selection data-selected:text-selection-foreground",
					)}
					href={entry.href}
					id={entry.entry.id}
					textValue={entry.entry.name}
				>
					{({ isSelected, selectionBehavior }) => (
						<>
							<SelectionMark
								selected={isSelected}
								toggling={selectionBehavior === "toggle"}
								className="absolute top-3 left-3"
							/>
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
						</>
					)}
				</GridListItem>
			)}
		</GridList>
	);
}
