import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import type { Key } from "react-aria-components";
import { workspaceRootQuery } from "~/lib/catalog/catalog.query";
import { Button } from "~/lib/ui/button";
import { Tree, type TreeDensity, useTreeRowSize } from "~/lib/ui/tree";
import { cn } from "~/lib/ui/utils";
import { useExpandedFolders } from "./expanded-folders.store";
import {
	LoadMoreGateContext,
	OpenFolderContext,
	SubfolderRows,
} from "./FolderNode";
import { FolderTrailContext, useRevealFolder } from "./useRevealFolder";
import { useScrollToCurrentFolder } from "./useScrollToCurrentFolder";
import { useSubfolders } from "./useSubfolders";

/**
 * The workspace's folders, loaded as they are opened. The root isn't a row:
 * the Library item stands for it. Rows are links, so the tree never selects.
 */
export function FolderTree({
	className,
	currentId,
	density = "control",
	labelledBy,
	onOpenFolder,
}: {
	className?: string;
	/** Row height: `control` in the sidebar, `touch` in the sheet. */
	density?: TreeDensity;
	/** The folder the Library is showing; the tree opens down to it. */
	currentId?: string;
	/** A visible heading's ID; without it the tree is labelled "Folders". */
	labelledBy?: string;
	/** Called when a folder row is opened, even if it is the current folder. */
	onOpenFolder?: () => void;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const rowSize = useTreeRowSize(density);
	const trail = useRevealFolder(currentId);
	const expanded = useExpandedFolders((state) => state.expanded);
	const setExpanded = useExpandedFolders((state) => state.setExpanded);
	const expandedKeys = useMemo(() => new Set<Key>(expanded), [expanded]);
	const root = useQuery(workspaceRootQuery());
	const rootId = root.data?.id;
	const topLevel = useSubfolders(rootId, {
		enabled: true,
		revealId: trail.trail[0],
	});

	// Paging on scroll starts once the user has scrolled or typed.
	const userHasScrolled = useRef(false);
	const hasTree = !root.isError;
	useEffect(() => {
		const element = scrollRef.current;
		if (!element || !hasTree) return;
		const open = () => {
			userHasScrolled.current = true;
		};
		const events = ["wheel", "pointerdown", "keydown", "touchmove"];
		for (const type of events) {
			element.addEventListener(type, open, { passive: true });
		}
		return () => {
			for (const type of events) element.removeEventListener(type, open);
		};
	}, [hasTree]);
	useScrollToCurrentFolder({ currentId, rootId, rowSize, scrollRef });

	if (root.isError) {
		return (
			<div className={cn("flex flex-col items-start gap-2 p-2", className)}>
				<p className="text-sm text-muted-foreground">
					Couldn’t load your folders.
				</p>
				<Button onPress={() => void root.refetch()} size="sm" variant="outline">
					Retry
				</Button>
			</div>
		);
	}
	return (
		<LoadMoreGateContext value={userHasScrolled}>
			<OpenFolderContext value={onOpenFolder}>
				<FolderTrailContext value={trail}>
					<Tree
						aria-label={labelledBy ? undefined : "Folders"}
						aria-labelledby={labelledBy}
						className={cn("min-h-0 overflow-auto", className)}
						density={density}
						expandedKeys={expandedKeys}
						onExpandedChange={setExpanded}
						ref={scrollRef}
						rowSize={rowSize}
						renderEmptyState={() =>
							topLevel.loaded ? (
								<p className="p-2 text-sm text-muted-foreground">
									No folders yet
								</p>
							) : null
						}
					>
						<SubfolderRows
							isOpen
							parentId={rootId ?? "root"}
							subfolders={topLevel}
						/>
					</Tree>
				</FolderTrailContext>
			</OpenFolderContext>
		</LoadMoreGateContext>
	);
}
