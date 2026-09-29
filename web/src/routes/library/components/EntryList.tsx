import { Download, Info } from "lucide-react";
import { Link } from "react-router";
import { catalogHref, type Entry, type FileEntry } from "~/lib/catalog/catalog";
import { formatBytes } from "~/lib/format/bytes";
import { entryKind, entryMeta, formatModified } from "../entries";
import { useOriginalDownload } from "../useOriginalDownload";
import { EntryIcon } from "./EntryIcon";
import type { Inspector } from "./Inspector";

type RowProps = {
	inspector: Inspector;
	inspectorId: string;
};

export function EntryList({
	entries,
	...row
}: RowProps & { entries: readonly Entry[] }) {
	const now = new Date();
	return (
		<>
			<div aria-hidden="true" className="entry-columns">
				<span />
				<span>Name</span>
				<span className="entry-kind">Kind</span>
				<span className="entry-size">Size</span>
				<span className="entry-modified">Modified</span>
				<span />
			</div>
			<ul className="entry-list">
				{entries.map((entry) => (
					<EntryRow entry={entry} key={entry.id} now={now} {...row} />
				))}
			</ul>
			<p className="entries-count">
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
		<li data-inspected={inspected || undefined}>
			<div className="entry-row">
				<EntryIcon family={kind.family} />
				{entry.kind === "folder" ? (
					<Link className="entry-name entry-link" to={catalogHref(entry.id)}>
						{entry.name}
					</Link>
				) : (
					<span className="entry-name">{entry.name}</span>
				)}
				<span className="entry-kind">{kind.label}</span>
				<span className="entry-size">
					{entry.kind === "file"
						? formatBytes(entry.currentVersion.sizeBytes)
						: "—"}
				</span>
				<span className="entry-modified">
					<time dateTime={entry.updatedAt}>
						{formatModified(entry.updatedAt, now)}
					</time>
				</span>
				<span className="entry-compact">{entryMeta(entry, now)}</span>
				{entry.kind === "file" ? (
					<FileRowActions {...details} entry={entry} />
				) : (
					<span className="entry-actions">
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
			<span className="entry-actions">
				<button
					aria-busy={busy}
					aria-label={`Download ${entry.name}`}
					className="icon-button"
					disabled={busy}
					onClick={download}
					title="Download original"
					type="button"
				>
					<Download aria-hidden="true" />
				</button>
				<DetailsButton entry={entry} {...details} />
			</span>
			<span className="entry-status" role="status">
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
			className="icon-button"
			onClick={(event) => inspector.toggleEntry(entry.id, event.currentTarget)}
			title="Details"
			type="button"
		>
			<Info aria-hidden="true" />
		</button>
	);
}
