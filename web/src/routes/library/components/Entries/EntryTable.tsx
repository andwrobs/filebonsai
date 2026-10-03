import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import type { SortDescriptor } from "react-aria-components";
import type { ListingOrder, SortField } from "~/lib/catalog/catalog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/lib/ui/table";
import { cn } from "~/lib/ui/utils";
import { EntryIcon } from "../EntryIcon";
import { DownloadStatus, EntryActions } from "./EntryActions";
import type { EntryItem } from "./useEntries";
import type { CollectionSelection } from "./useEntrySelection";

const head = "h-9 px-3 text-xs font-semibold text-muted-foreground";
// Arrows can focus a cell as well as a row.
const focusable =
	"outline-none data-focus-visible:outline-2 data-focus-visible:outline-solid data-focus-visible:-outline-offset-2 data-focus-visible:outline-ring";
const cell = cn(focusable, "px-3 py-1 text-sm text-muted-foreground");
// Selection tints the row; the open Details button would otherwise pick up the
// row's expanded tint.
const selected =
	"hover:bg-accent has-aria-expanded:bg-transparent data-selected:bg-selection data-selected:text-selection-foreground data-selected:hover:bg-selection data-selected:has-aria-expanded:bg-selection";
// The inspected entry is marked apart from selection: a bar at its start.
const inspectedRow = "shadow-[inset_3px_0_0_var(--color-primary)]";

/**
 * A dense table sorted by the server. Rows are focusable; arrows move focus
 * between rows and into a row's buttons. Click selects, Cmd/Ctrl-click
 * toggles, Shift-click extends, and double-click or Enter opens a folder.
 */
export function EntryTable({
	items,
	labelledBy,
	onSort,
	order,
	selection,
	showKind,
}: {
	items: readonly EntryItem[];
	labelledBy: string;
	onSort(field: SortField): void;
	order: ListingOrder;
	selection: CollectionSelection;
	showKind: boolean;
}) {
	const sortDescriptor: SortDescriptor = {
		column: order.sort,
		direction: order.order === "asc" ? "ascending" : "descending",
	};
	return (
		<Table
			aria-labelledby={labelledBy}
			className="table-fixed border-collapse text-md"
			// The descriptor Aria proposes is ignored; sortBy picks the direction.
			onSortChange={({ column }) => onSort(column as SortField)}
			sortDescriptor={sortDescriptor}
			{...selection}
		>
			<TableHeader className="border-b">
				<TableHead
					allowsSorting
					className={cn(head, "w-auto")}
					id="name"
					isRowHeader
				>
					{sortable("Name")}
				</TableHead>
				{showKind ? (
					<TableHead className={cn(head, "w-28")} id="kind">
						Kind
					</TableHead>
				) : null}
				<TableHead
					allowsSorting
					className={cn(head, "w-24 text-right")}
					id="size"
				>
					{sortable("Size", "end")}
				</TableHead>
				<TableHead allowsSorting className={cn(head, "w-32")} id="updatedAt">
					{sortable("Modified")}
				</TableHead>
				<TableHead
					className={cn(head, "w-[calc(var(--control-height)*2+1.75rem)]")}
					id="actions"
				>
					<span className="sr-only">Actions</span>
				</TableHead>
			</TableHeader>
			<TableBody items={items}>
				{(item) => (
					<TableRow
						className={cn(
							focusable,
							selected,
							"border-b",
							item.inspected && inspectedRow,
						)}
						data-inspected={item.inspected || undefined}
						href={item.href}
						id={item.entry.id}
						textValue={item.entry.name}
					>
						<TableCell className={cn(focusable, "px-3 py-0 whitespace-normal")}>
							<span className="flex min-h-row items-center gap-3">
								<EntryIcon family={item.family} />
								<span className="grid min-w-0 py-1">
									<span className="font-medium wrap-anywhere text-foreground">
										{item.entry.name}
									</span>
									<DownloadStatus item={item} />
								</span>
							</span>
						</TableCell>
						{showKind ? (
							<TableCell className={cell}>{item.kindLabel}</TableCell>
						) : null}
						<TableCell className={cn(cell, "text-right")}>
							{item.size}
						</TableCell>
						<TableCell className={cell}>
							<time dateTime={item.entry.updatedAt} title={item.modifiedFull}>
								{item.modified}
							</time>
						</TableCell>
						<TableCell className={cn(focusable, "px-3 py-0")}>
							<EntryActions item={item} />
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);
}

// A header's label with an arrow for the active direction. Aria sets aria-sort.
function sortable(label: string, align: "start" | "end" = "start") {
	return ({
		allowsSorting,
		sortDirection,
	}: {
		allowsSorting: boolean;
		sortDirection?: "ascending" | "descending";
	}): ReactNode => {
		const Arrow = sortDirection === "descending" ? ArrowDown : ArrowUp;
		return (
			<span
				className={cn(
					"inline-flex items-center gap-1",
					align === "end" && "flex-row-reverse",
					allowsSorting && "cursor-pointer hover:text-foreground",
					sortDirection && "text-foreground",
				)}
			>
				{label}
				<Arrow
					aria-hidden="true"
					className={cn("size-3.5", !sortDirection && "invisible")}
				/>
			</span>
		);
	};
}
