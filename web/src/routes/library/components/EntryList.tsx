import { Download, Info } from "lucide-react";
import { Link } from "react-router";
import { catalogHref, type Entry, type FileEntry } from "~/lib/catalog/catalog";
import { formatBytes } from "~/lib/format/bytes";
import { Button } from "~/lib/ui/button";
import { entryKind, entryMeta, formatModified } from "../entries";
import { useOriginalDownload } from "../useOriginalDownload";
import { EntryIcon } from "./EntryIcon";
import type { Inspector } from "./Inspector";

type RowProps = { inspector: Inspector; inspectorId: string };

const columns =
	"grid grid-cols-[1.25rem_minmax(0,1fr)_7rem_5.5rem_7.5rem_calc(var(--control-height)*2+0.25rem)] items-center gap-x-3 @max-[44rem]/entries:grid-cols-[1.25rem_minmax(0,1fr)_5.5rem_6.5rem_calc(var(--control-height)*2+0.25rem)]";
const compact = "@max-[30rem]/entries:hidden";
const actions =
	"relative z-1 col-start-6 flex justify-end gap-1 @max-[44rem]/entries:col-start-5 @max-[30rem]/entries:[grid-area:action]";

export function EntryList({
	entries,
	...row
}: RowProps & { entries: readonly Entry[] }) {
	const now = new Date();
	return (
		<>
			<div
				aria-hidden="true"
				className={`${columns} border-b px-3 pb-2 text-xs font-semibold text-muted-foreground ${compact}`}
			>
				<span />
				<span>Name</span>
				<span className="@max-[44rem]/entries:hidden">Kind</span>
				<span>Size</span>
				<span>Modified</span>
				<span />
			</div>
			<ul className="m-0 list-none p-0">
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
				className={`${columns} entry-row relative min-h-row px-3 py-1 text-md text-foreground ${inspected ? "bg-selection hover:bg-selection" : "hover:bg-accent"} has-[.entry-link:focus-visible]:outline-2 has-[.entry-link:focus-visible]:-outline-offset-2 has-[.entry-link:focus-visible]:outline-ring @max-[30rem]/entries:grid-cols-[1.75rem_minmax(0,1fr)_auto] @max-[30rem]/entries:[grid-template-areas:'icon_name_action'_'icon_meta_action'_'status_status_status'] @max-[30rem]/entries:gap-y-0 @max-[30rem]/entries:py-2`}
			>
				<EntryIcon family={kind.family} />
				{entry.kind === "folder" ? (
					<Link
						className="entry-link py-1 font-medium text-inherit wrap-anywhere no-underline after:absolute after:inset-0 after:content-[''] focus-visible:outline-none @max-[30rem]/entries:[grid-area:name] @max-[30rem]/entries:py-0"
						to={catalogHref(entry.id)}
					>
						{entry.name}
					</Link>
				) : (
					<span className="py-1 font-medium wrap-anywhere @max-[30rem]/entries:[grid-area:name] @max-[30rem]/entries:py-0">
						{entry.name}
					</span>
				)}
				<span className="text-sm whitespace-nowrap text-muted-foreground @max-[44rem]/entries:hidden">
					{kind.label}
				</span>
				<span
					className={`text-right text-sm whitespace-nowrap text-muted-foreground ${compact}`}
				>
					{entry.kind === "file"
						? formatBytes(entry.currentVersion.sizeBytes)
						: "—"}
				</span>
				<span
					className={`text-sm whitespace-nowrap text-muted-foreground ${compact}`}
				>
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
					<span className={actions}>
						<DetailsButton {...details} />
					</span>
				)}
			</div>
		</li>
	);
}

function FileRowActions({
	entry,
	...details
}: RowProps & { entry: FileEntry; inspected: boolean }) {
	const { busy, download, status } = useOriginalDownload(entry.id, entry.name);
	return (
		<>
			<span className={actions}>
				<Button
					aria-busy={busy}
					aria-label={`Download ${entry.name}`}
					isDisabled={busy}
					onPress={download}
					size="icon"
					variant="ghost"
				>
					<Download aria-hidden="true" />
				</Button>
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
		<Button
			aria-controls={inspected ? inspectorId : undefined}
			aria-expanded={inspected}
			aria-label={`Details for ${entry.name}`}
			onPress={(event) =>
				inspector.toggleEntry(entry.id, event.target as HTMLButtonElement)
			}
			size="icon"
			variant="ghost"
		>
			<Info aria-hidden="true" />
		</Button>
	);
}
