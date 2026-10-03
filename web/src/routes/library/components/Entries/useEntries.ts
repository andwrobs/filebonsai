import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { catalogHref, type Entry } from "~/lib/catalog/catalog";
import { formatBytes } from "~/lib/format/bytes";
import {
	entryKind,
	entryMeta,
	formatFullDate,
	formatModified,
	type KindFamily,
} from "../../entries";
import type { EntryView } from "../../entry-view.store";
import { useOriginalDownloads } from "../../useOriginalDownload";
import type { Inspector } from "../Inspector";
import type { EntrySelection } from "./useEntrySelection";

/** What one entry shows in any view, and what it can do. */
export interface EntryItem {
	entry: Entry;
	family: KindFamily;
	kindLabel: string;
	/**
	 * Folders open as links (double-click or Enter on desktop, a tap on touch);
	 * files have no page of their own. Touch selection mode opens nothing.
	 */
	href: string | undefined;
	size: string;
	modified: string;
	modifiedFull: string;
	/** Size or kind with the date, for layouts without columns. */
	meta: string;
	/** Showing alone in the open inspector. */
	inspected: boolean;
	inspectorId: string;
	downloading: boolean;
	downloadStatus: string;
	download(): void;
	toggleDetails(button: HTMLButtonElement): void;
}

/** The table stacks into rows when narrow; a phone always gets rows. */
export type EntriesLayout = "table" | "grid" | "rows";

// Container widths, in rem, where columns stop fitting.
const rowsBelow = 30;
const kindBelow = 44;

export function useEntries({
	entries,
	inspector,
	inspectorId,
	phone,
	selection,
	view,
}: {
	entries: readonly Entry[];
	inspector: Inspector;
	inspectorId: string;
	phone: boolean;
	selection: EntrySelection;
	view: EntryView;
}) {
	const container = useRef<HTMLDivElement>(null);
	const width = useInlineSizeInRem(container);
	const downloads = useOriginalDownloads();
	const now = new Date();

	const layout: EntriesLayout =
		phone || (view === "table" && width < rowsBelow) ? "rows" : view;
	const items = entries.map((entry): EntryItem => {
		const kind = entryKind(entry);
		return {
			entry,
			family: kind.family,
			kindLabel: kind.label,
			href:
				entry.kind === "folder" && !selection.selecting
					? catalogHref(entry.id)
					: undefined,
			size:
				entry.kind === "file"
					? formatBytes(entry.currentVersion.sizeBytes)
					: "—",
			modified: formatModified(entry.updatedAt, now),
			modifiedFull: formatFullDate(entry.updatedAt),
			meta: entryMeta(entry, now),
			inspected: inspector.open && inspector.entry.id === entry.id,
			inspectorId,
			downloading: downloads.busy(entry.id),
			downloadStatus: downloads.status(entry.id),
			download: () => downloads.download(entry.id, entry.name),
			toggleDetails: (button) => inspector.toggleEntry(entry.id, button),
		};
	});
	return {
		container,
		items,
		layout,
		showKind: width >= kindBelow,
	};
}

// Unknown until measured (and in layout-free tests): wide enough for everything.
function useInlineSizeInRem(ref: RefObject<HTMLElement | null>) {
	const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
	useLayoutEffect(() => {
		const node = ref.current;
		if (!node || typeof ResizeObserver === "undefined") return;
		const measure = () => {
			const px = node.getBoundingClientRect().width;
			const rem =
				Number.parseFloat(
					getComputedStyle(document.documentElement).fontSize,
				) || 16;
			setWidth(px > 0 ? px / rem : Number.POSITIVE_INFINITY);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, [ref]);
	return width;
}
