import { Button } from "~/lib/ui/button";
import { cn } from "~/lib/ui/utils";
import type { EntrySelection } from "./useEntrySelection";

/**
 * The item count, or the selection count and what to do with it, announced as
 * it changes. It always takes the same space, so selecting never shifts the
 * entries under the pointer. Touch offers Select.
 */
export function SelectionBar({
	loaded,
	selection,
	touch,
}: {
	loaded: number;
	selection: EntrySelection;
	touch: boolean;
}) {
	const count = selection.selected.length;
	return (
		<div
			aria-label="Selection"
			className="flex min-h-control items-center justify-between gap-3 pb-2"
			role="toolbar"
		>
			<p
				className={cn(
					"text-sm",
					count > 0 ? "font-medium text-foreground" : "text-muted-foreground",
				)}
				role="status"
			>
				{count > 0
					? `${count} selected`
					: selection.selecting
						? "Tap items to select"
						: `${loaded} ${loaded === 1 ? "item" : "items"}`}
			</p>
			{touch || count > 0 ? (
				<span className="flex items-center gap-2">
					{count > 0 || selection.selecting ? (
						<>
							<Button
								isDisabled={count === loaded}
								onPress={selection.selectAll}
								variant="ghost"
							>
								Select all
							</Button>
							<Button onPress={selection.clear} variant="outline">
								{touch ? "Done" : "Clear"}
							</Button>
						</>
					) : (
						<Button onPress={selection.startSelecting} variant="outline">
							Select
						</Button>
					)}
				</span>
			) : null}
		</div>
	);
}
