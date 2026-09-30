import { ChevronRightIcon } from "lucide-react";
import { type Ref, useLayoutEffect, useMemo, useState } from "react";
import {
	Button,
	ListLayout,
	TreeItemContent as TreeItemContentPrimitive,
	type TreeItemContentProps,
	TreeItem as TreeItemPrimitive,
	type TreeItemProps as TreeItemPrimitiveProps,
	TreeLoadMoreItem as TreeLoadMoreItemPrimitive,
	type TreeLoadMoreItemProps as TreeLoadMorePrimitiveProps,
	Tree as TreePrimitive,
	type TreeProps as TreePrimitiveProps,
	Virtualizer,
} from "react-aria-components";

import { cn } from "~/lib/ui/utils";

// Indent per level without pushing deep folder names outside the tree.
// React Aria still exposes the full level to assistive technology.
const indent =
	"[padding-inline-start:min(6rem,calc(0.25rem+(var(--tree-item-level)-1)*0.875rem))]";

// Rows have a fixed height, because the tree only mounts the rows in view and
// positions them from it. `control` follows the `--control-height` token and
// `touch` the `--touch-target` token; both grow on coarse pointers. The classes
// are the single source: `useTreeRowSize` measures an element that has them, so
// the layout and the CSS can't disagree.
export type TreeDensity = "control" | "touch";
const rowHeight: Record<TreeDensity, string> = {
	control: "h-control",
	touch: "h-touch",
};

function measureRowSize(density: TreeDensity) {
	const probe = document.createElement("div");
	probe.className = rowHeight[density];
	probe.style.cssText =
		"position:absolute;visibility:hidden;pointer-events:none";
	document.body.append(probe);
	const size = probe.getBoundingClientRect().height;
	probe.remove();
	return size;
}

/** A row's height in pixels for a density, re-measured when the pointer type changes. */
export function useTreeRowSize(density: TreeDensity) {
	const [size, setSize] = useState(0);
	useLayoutEffect(() => {
		const measure = () => setSize(measureRowSize(density));
		measure();
		const coarse = window.matchMedia?.("(pointer: coarse)");
		coarse?.addEventListener("change", measure);
		return () => coarse?.removeEventListener("change", measure);
	}, [density]);
	return size;
}

// Mounts only the rows near the viewport. `rowSize` is in pixels; the tree
// itself stays the scroll container, so give it a bounded height.
function Tree<T extends object>({
	className,
	density = "control",
	ref,
	rowSize,
	...props
}: Omit<TreePrimitiveProps<T>, "className"> & {
	className?: string;
	density?: TreeDensity;
	ref?: Ref<HTMLDivElement>;
	rowSize: number;
}) {
	const layoutOptions = useMemo(
		() => ({ rowSize, loaderSize: rowSize }),
		[rowSize],
	);
	return (
		<Virtualizer layout={ListLayout} layoutOptions={layoutOptions}>
			<TreePrimitive
				data-density={density}
				data-slot="tree"
				className={cn("outline-none", className)}
				ref={ref}
				{...props}
			/>
		</Virtualizer>
	);
}

// `isCurrent` marks the row that stands for where the user is, without
// selecting it: selection belongs to whatever screen lists the entries.
function TreeItem<T extends object>({
	className,
	isCurrent,
	...props
}: Omit<TreeItemPrimitiveProps<T>, "className"> & {
	className?: string;
	isCurrent?: boolean;
}) {
	return (
		<TreeItemPrimitive
			data-slot="tree-item"
			data-current={isCurrent || undefined}
			className={cn(
				"group/tree-item relative flex h-control in-data-[density=touch]:h-touch cursor-pointer items-center rounded-md pe-2 text-md text-foreground no-underline outline-none hover:bg-accent data-current:bg-selection data-current:font-semibold data-current:text-selection-foreground data-focus-visible:ring-2 data-focus-visible:ring-ring data-focus-visible:ring-inset",
				indent,
				className,
			)}
			{...props}
		/>
	);
}

// Lays out a row's chevron, icon, and label. The chevron is a real button so
// touch and screen reader users can expand a row without the keyboard.
function TreeItemContent({ children, ...props }: TreeItemContentProps) {
	return (
		<TreeItemContentPrimitive {...props}>
			{(values) => (
				<div
					data-slot="tree-item-content"
					className="flex min-w-0 flex-1 items-center gap-1.5"
				>
					{typeof children === "function" ? children(values) : children}
				</div>
			)}
		</TreeItemContentPrimitive>
	);
}

// Only rows with child items show it, so leaves keep their alignment.
function TreeChevron({ className }: { className?: string }) {
	return (
		<Button
			slot="chevron"
			data-slot="tree-chevron"
			className={cn(
				"invisible flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground group-data-has-child-items/tree-item:visible pointer-coarse:size-control",
				className,
			)}
		>
			<ChevronRightIcon
				aria-hidden="true"
				className="size-4 transition-transform duration-(--duration-fast) group-data-expanded/tree-item:rotate-90"
			/>
		</Button>
	);
}

// A row-height marker that asks for the next page when it scrolls into view
// and shows its children while loading.
function TreeLoadMoreItem({
	className,
	...props
}: Omit<TreeLoadMorePrimitiveProps, "className"> & { className?: string }) {
	return (
		<TreeLoadMoreItemPrimitive
			data-slot="tree-load-more"
			className={cn(
				"flex h-control in-data-[density=touch]:h-touch items-center gap-2 text-sm text-muted-foreground",
				indent,
				className,
			)}
			{...props}
		/>
	);
}

export {
	Tree,
	TreeChevron,
	TreeItem,
	TreeItemContent,
	type TreeItemPrimitiveProps as TreeItemProps,
	TreeLoadMoreItem,
};
