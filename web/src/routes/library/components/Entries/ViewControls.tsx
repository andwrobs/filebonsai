import { ArrowDownUp, LayoutGrid, List } from "lucide-react";
import type { Selection } from "react-aria-components";
import type { SortField, SortOrder } from "~/lib/catalog/catalog";
import { Button } from "~/lib/ui/button";
import {
	DropdownMenu,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/lib/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "~/lib/ui/toggle-group";
import type { EntryView } from "../../entry-view.store";
import { directionLabel, fieldLabels } from "../../listing-order";
import type { LibraryView } from "../../useLibraryView";

const compactLabel = "@max-[30rem]/page:sr-only";
const compactButton = "@max-[30rem]/page:size-control @max-[30rem]/page:px-0";

const only = (keys: Selection) =>
	keys === "all" ? undefined : [...keys][0]?.toString();

/** Sort for every layout (grid and rows have no headers), and table or grid. */
export function ViewControls({ library }: { library: LibraryView }) {
	const order = library.requestedOrder;
	return (
		<>
			<DropdownMenuTrigger>
				<Button className={compactButton} variant="outline">
					<ArrowDownUp aria-hidden="true" />
					<span className={compactLabel}>Sort</span>
				</Button>
				<DropdownMenu aria-label="Sort" placement="bottom end">
					<DropdownMenuGroup
						aria-label="Sort by"
						disallowEmptySelection
						onSelectionChange={(keys) => {
							const field = only(keys) as SortField | undefined;
							if (field && field !== order.sort) library.sortBy(field);
						}}
						selectedKeys={[order.sort]}
						selectionMode="single"
					>
						<DropdownMenuLabel>Sort by</DropdownMenuLabel>
						{(Object.keys(fieldLabels) as SortField[]).map((field) => (
							<DropdownMenuItem id={field} key={field}>
								{fieldLabels[field]}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup
						aria-label="Direction"
						disallowEmptySelection
						onSelectionChange={(keys) => {
							const direction = only(keys) as SortOrder | undefined;
							if (direction)
								library.setOrder((current) => ({
									...current,
									order: direction,
								}));
						}}
						selectedKeys={[order.order]}
						selectionMode="single"
					>
						{(["asc", "desc"] as const).map((direction) => (
							<DropdownMenuItem id={direction} key={direction}>
								{directionLabel(order.sort, direction)}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup
						aria-label="Grouping"
						onSelectionChange={(keys) =>
							library.setOrder((current) => ({
								...current,
								foldersFirst: keys === "all" || keys.has("folders-first"),
							}))
						}
						selectedKeys={order.foldersFirst ? ["folders-first"] : []}
						selectionMode="multiple"
					>
						<DropdownMenuItem id="folders-first">
							Folders first
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenu>
			</DropdownMenuTrigger>
			{library.phone ? null : (
				<ToggleGroup
					aria-label="View"
					disallowEmptySelection
					onSelectionChange={(keys) => {
						const view = only(keys) as EntryView | undefined;
						if (view) library.setView(view);
					}}
					selectedKeys={[library.view]}
					selectionMode="single"
					spacing={0}
					variant="outline"
				>
					<ToggleGroupItem
						aria-label="Table"
						className="size-control"
						id="table"
					>
						<List aria-hidden="true" />
					</ToggleGroupItem>
					<ToggleGroupItem aria-label="Grid" className="size-control" id="grid">
						<LayoutGrid aria-hidden="true" />
					</ToggleGroupItem>
				</ToggleGroup>
			)}
		</>
	);
}
