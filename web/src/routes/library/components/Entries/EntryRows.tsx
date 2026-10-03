import { GridList, GridListItem } from "react-aria-components";
import { cn } from "~/lib/ui/utils";
import { EntryIcon } from "../EntryIcon";
import { DownloadStatus, EntryActions } from "./EntryActions";
import { SelectionMark } from "./SelectionMark";
import type { EntryItem } from "./useEntries";
import type { CollectionSelection } from "./useEntrySelection";

/**
 * Two-line rows for narrow screens and phones, where columns don't fit. Arrows
 * move between rows and, left and right, into a row's buttons.
 */
export function EntryRows({
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
			className="grid"
			items={items}
			{...selection}
		>
			{(entry) => (
				<GridListItem
					className={cn(
						"grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-3 py-2 text-foreground outline-none data-focus-visible:outline-2 data-focus-visible:outline-solid data-focus-visible:-outline-offset-2 data-focus-visible:outline-ring",
						"hover:bg-accent data-selected:bg-selection data-selected:text-selection-foreground",
						// The inspected entry is marked apart from selection.
						entry.inspected && "shadow-[inset_3px_0_0_var(--color-primary)]",
					)}
					data-inspected={entry.inspected || undefined}
					href={entry.href}
					id={entry.entry.id}
					textValue={entry.entry.name}
				>
					{({ isSelected, selectionBehavior }) => (
						<>
							<SelectionMark
								selected={isSelected}
								toggling={selectionBehavior === "toggle"}
								fallback={
									<EntryIcon className="size-6" family={entry.family} />
								}
							/>
							<span className="grid min-w-0">
								<span className="font-medium wrap-anywhere">
									{entry.entry.name}
								</span>
								<span
									className="text-sm text-muted-foreground"
									title={`Modified ${entry.modifiedFull}`}
								>
									{entry.meta}
								</span>
								<DownloadStatus item={entry} />
							</span>
							<EntryActions item={entry} />
						</>
					)}
				</GridListItem>
			)}
		</GridList>
	);
}
