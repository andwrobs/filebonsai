import { Download, Info } from "lucide-react";
import { Link } from "react-router";
import { catalogHref, type Entry, type FileEntry } from "~/lib/catalog/catalog";
import { formatBytes } from "~/lib/format/bytes";
import { buttonVariants } from "~/lib/ui/button";
import { cn } from "~/lib/ui/utils";
import { entryKind, entryMeta, formatModified } from "../entries";
import { useOriginalDownload } from "../useOriginalDownload";
import { EntryIcon } from "./EntryIcon";
import type { Inspector } from "./Inspector";

type RowProps = {
	inspector: Inspector;
	inspectorId: string;
};

// The list is its own container (`entries`, on the section around it), so its
// layout follows its width, beside the inspector too: below 44rem the Kind column
// drops, and below 30rem each row stacks into two lines.
// The last column fits the two row buttons.
const columns =
	"grid grid-cols-[1.25rem_minmax(0,1fr)_7rem_5.5rem_7.5rem_var(--entry-actions-width)] items-center gap-x-3 @max-[44rem]/entries:grid-cols-[1.25rem_minmax(0,1fr)_5.5rem_6.5rem_var(--entry-actions-width)] [--entry-actions-width:calc(var(--control-height)*2+--spacing(1))]";
const meta = "text-sm whitespace-nowrap text-muted-foreground";
const kindColumn = cn(meta, "@max-[44rem]/entries:hidden");
const sizeColumn = cn(meta, "text-right @max-[30rem]/entries:hidden");
const modifiedColumn = cn(meta, "@max-[30rem]/entries:hidden");

export function EntryList({
	entries,
	...row
}: RowProps & { entries: readonly Entry[] }) {
	const now = new Date();
	return (
		<>
			<div
				aria-hidden="true"
				className={cn(
					columns,
					"border-b px-3 pb-2 text-xs font-semibold text-muted-foreground @max-[30rem]/entries:hidden",
				)}
			>
				<span />
				<span>Name</span>
				<span className={kindColumn}>Kind</span>
				<span className={sizeColumn}>Size</span>
				<span className={modifiedColumn}>Modified</span>
				<span />
			</div>
			<ul>
				{entries.map((entry) => (
					<EntryRow entry={entry} key={entry.id} now={now} {...row} />
				))}
			</ul>
			<p className="mt-3 text-sm text-muted-foreground">
				{entries.length} {entries.length === 1 ? "item" : "items"}
			</p>
		</>
	);
}

const nameClassName =
	"py-1 font-medium wrap-anywhere @max-[30rem]/entries:py-0 @max-[30rem]/entries:[grid-area:name]";

function EntryRow({
	entry,
	inspector,
	inspectorId,
	now,
}: RowProps & { entry: Entry; now: Date }) {
	const kind = entryKind(entry);
	const inspected = inspector.open && inspector.entry.id === entry.id;
	const details = { entry, inspected, inspector, inspectorId };
	return (
		<li className="border-b" data-inspected={inspected || undefined}>
			<div
				className={cn(
					columns,
					"relative min-h-row px-3 py-1 text-md text-foreground",
					inspected ? "bg-selection" : "hover:bg-accent",
					// A folder's link covers the row; its focus ring goes on the row.
					"has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-ring",
					"@max-[30rem]/entries:grid-cols-[1.75rem_minmax(0,1fr)_auto] @max-[30rem]/entries:py-2 @max-[30rem]/entries:[grid-template-areas:'icon_name_action'_'icon_meta_action'_'status_status_status']",
				)}
			>
				<EntryIcon
					className="@max-[30rem]/entries:size-6 @max-[30rem]/entries:[grid-area:icon]"
					family={kind.family}
				/>
				{entry.kind === "folder" ? (
					<Link
						className={cn(
							nameClassName,
							"text-inherit no-underline after:absolute after:inset-0 focus-visible:outline-none",
						)}
						to={catalogHref(entry.id)}
					>
						{entry.name}
					</Link>
				) : (
					<span className={nameClassName}>{entry.name}</span>
				)}
				<span className={kindColumn}>{kind.label}</span>
				<span className={sizeColumn}>
					{entry.kind === "file"
						? formatBytes(entry.currentVersion.sizeBytes)
						: "—"}
				</span>
				<span className={modifiedColumn}>
					<time dateTime={entry.updatedAt}>
						{formatModified(entry.updatedAt, now)}
					</time>
				</span>
				<span className="hidden text-sm text-muted-foreground @max-[30rem]/entries:block @max-[30rem]/entries:[grid-area:meta]">
					{entryMeta(entry, now)}
				</span>
				{entry.kind === "file" ? (
					<FileRowActions {...details} entry={entry} />
				) : (
					<span className={actionsClassName}>
						<DetailsButton {...details} />
					</span>
				)}
			</div>
		</li>
	);
}

// Above the covering link, in the last column.
const actionsClassName =
	"relative z-1 col-6 flex justify-end gap-1 @max-[44rem]/entries:col-5 @max-[30rem]/entries:[grid-area:action]";
// Native buttons keep their `title` tooltips, which React Aria's Button drops.
const iconButton = cn(
	buttonVariants({ variant: "ghost", size: "icon" }),
	// An open Details button looks like the others; the row shows the selection.
	"aria-expanded:not-hover:bg-transparent aria-expanded:not-hover:text-muted-foreground",
);

function FileRowActions({
	entry,
	...details
}: RowProps & { entry: FileEntry; inspected: boolean }) {
	const { busy, download, status } = useOriginalDownload(entry.id, entry.name);
	return (
		<>
			<span className={actionsClassName}>
				<button
					aria-busy={busy}
					aria-label={`Download ${entry.name}`}
					className={iconButton}
					data-disabled={busy || undefined}
					disabled={busy}
					onClick={download}
					title="Download original"
					type="button"
				>
					<Download aria-hidden="true" />
				</button>
				<DetailsButton entry={entry} {...details} />
			</span>
			<span
				className="col-[2/-1] pb-1 text-sm text-muted-foreground empty:hidden @max-[30rem]/entries:[grid-area:status]"
				role="status"
			>
				{status}
			</span>
		</>
	);
}

function DetailsButton({
	entry,
	inspected,
	inspector,
	inspectorId,
}: RowProps & { entry: Entry; inspected: boolean }) {
	return (
		<button
			aria-controls={inspected ? inspectorId : undefined}
			aria-expanded={inspected}
			aria-label={`Details for ${entry.name}`}
			className={iconButton}
			onClick={(event) => inspector.toggleEntry(entry.id, event.currentTarget)}
			title="Details"
			type="button"
		>
			<Info aria-hidden="true" />
		</button>
	);
}
