import { Folder, FolderOpen } from "lucide-react";
import { createContext, type RefObject, useContext } from "react";
import { Collection } from "react-aria-components";
import { catalogHref, type FolderEntry } from "~/lib/catalog/catalog";
import { Spinner } from "~/lib/ui/spinner";
import {
	TreeChevron,
	TreeItem,
	TreeItemContent,
	TreeLoadMoreItem,
} from "~/lib/ui/tree";
import { useExpandedFolders } from "./expanded-folders.store";
import { FolderTrailContext, useNextOnTrail } from "./useRevealFolder";
import { type Subfolders, useSubfolders } from "./useSubfolders";

/** Called when a folder row is opened, by pointer or keyboard. */
export const OpenFolderContext = createContext<(() => void) | undefined>(
	undefined,
);

/**
 * Whether more pages may load as a "load more" row comes into view. It opens
 * when the user first scrolls or types. Until then, revealing the current folder
 * can put the end of an earlier listing in view, and loading it would push the
 * current folder back out. Paging toward the current folder doesn't wait.
 */
export const LoadMoreGateContext = createContext<RefObject<boolean>>({
	current: true,
});

// Rows for one parent's subfolders, then whatever comes after them. React Aria
// renders these wrappers into a hidden collection, so they can use hooks. A
// folder whose subfolders haven't loaded carries a load marker even while it is
// collapsed: it's what makes its row expandable, because the tree only counts
// child rows, not the `hasChildItems` prop.
export function SubfolderRows({
	parentId,
	subfolders,
	isOpen,
}: {
	parentId: string;
	subfolders: Subfolders;
	isOpen: boolean;
}) {
	const { folders, hasNextPage, isError, isLoading, loaded, loadMore, retry } =
		subfolders;
	const gate = useContext(LoadMoreGateContext);
	return (
		<>
			<Collection items={folders}>
				{(folder) => <FolderNode folder={folder} />}
			</Collection>
			{!isError && (!loaded || hasNextPage) ? (
				<TreeLoadMoreItem
					isLoading={isOpen && isLoading}
					onLoadMore={() => {
						if (gate.current) loadMore();
					}}
				>
					<Spinner aria-hidden="true" role="presentation" />
					<span>Loading folders…</span>
				</TreeLoadMoreItem>
			) : null}
			{isError ? (
				<TreeItem
					id={`${parentId}:retry`}
					onAction={retry}
					textValue="Retry loading folders"
				>
					<TreeItemContent>
						<span className="min-w-0 flex-1 truncate ps-8.5 text-sm text-muted-foreground underline">
							Couldn’t load folders. Retry
						</span>
					</TreeItemContent>
				</TreeItem>
			) : null}
		</>
	);
}

export function FolderNode({ folder }: { folder: FolderEntry }) {
	const { currentId } = useContext(FolderTrailContext);
	const onOpen = useContext(OpenFolderContext);
	const isCurrent = currentId === folder.id;
	const expanded = useExpandedFolders((state) =>
		state.expanded.includes(folder.id),
	);
	const subfolders = useSubfolders(folder.id, {
		enabled: expanded,
		revealId: useNextOnTrail(folder.id),
	});
	// Once loaded, a folder with no subfolders stops being expandable.
	const hasChildItems =
		!subfolders.loaded ||
		subfolders.folders.length > 0 ||
		subfolders.hasNextPage;
	return (
		<TreeItem
			aria-label={isCurrent ? `${folder.name}, current folder` : undefined}
			hasChildItems={hasChildItems}
			href={catalogHref(folder.id)}
			id={folder.id}
			isCurrent={isCurrent}
			onAction={onOpen}
			textValue={folder.name}
		>
			<TreeItemContent>
				{({ isExpanded }) => (
					<>
						<TreeChevron />
						<FolderLabel isExpanded={isExpanded} name={folder.name} />
					</>
				)}
			</TreeItemContent>
			<SubfolderRows
				isOpen={expanded}
				parentId={folder.id}
				subfolders={subfolders}
			/>
		</TreeItem>
	);
}

function FolderLabel({
	isExpanded,
	name,
}: {
	isExpanded: boolean;
	name: string;
}) {
	const Icon = isExpanded ? FolderOpen : Folder;
	return (
		<>
			<Icon
				aria-hidden="true"
				className="size-icon shrink-0"
				strokeWidth={1.75}
			/>
			<span className="min-w-0 flex-1 truncate" title={name}>
				{name}
			</span>
		</>
	);
}
