import { FolderTree as FolderTreeIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Button } from "~/lib/ui/button";
import { Sheet, SheetHeader, SheetTitle } from "~/lib/ui/sheet";
import { cn } from "~/lib/ui/utils";
import { FolderTree } from "./FolderTree";

/**
 * A "Folders" button that opens the tree in a left sheet, for the icon rail
 * and phones. The sheet closes when the user navigates; it never opens itself.
 */
export function FolderTreeSheet({
	buttonClassName,
	currentId,
}: {
	buttonClassName?: string;
	currentId?: string;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const { pathname } = useLocation();
	// biome-ignore lint/correctness/useExhaustiveDependencies: closing on every path change is the point.
	useEffect(() => setIsOpen(false), [pathname]);
	return (
		<>
			<Button
				aria-label="Folders"
				className={cn("size-touch text-foreground", buttonClassName)}
				onPress={() => setIsOpen(true)}
				variant="ghost"
			>
				<FolderTreeIcon
					aria-hidden="true"
					className="size-icon"
					strokeWidth={1.75}
				/>
			</Button>
			<Sheet
				className="pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
				isOpen={isOpen}
				onOpenChange={setIsOpen}
				side="left"
			>
				<SheetHeader>
					<SheetTitle>Folders</SheetTitle>
				</SheetHeader>
				<FolderTree className="flex-1 px-2 pb-2" currentId={currentId} />
			</Sheet>
		</>
	);
}
