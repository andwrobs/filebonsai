import { Check, Copy, Download, X } from "lucide-react";
import {
	type ReactNode,
	type RefObject,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { Link } from "react-router";
import { catalogHref, type Entry, type FileEntry } from "~/lib/catalog/catalog";
import { formatBytes, formatExactBytes } from "~/lib/format/bytes";
import { entryKind, formatFullDate } from "../../entries";
import { useOriginalDownload } from "../../useOriginalDownload";
import { EntryIcon } from "../EntryIcon";
import { FilePreview } from "../FilePreview";
import type { Inspector } from "./useInspector";

/** A third column on wide screens; a modal drawer or bottom sheet below that. */
export function InspectorPanel({
	id,
	inspector,
}: {
	id: string;
	inspector: Inspector;
}) {
	if (!inspector.open) return null;
	// Keyed by entry so status text and copy feedback never carry over to another entry.
	const details = (
		<InspectorDetails
			entry={inspector.entry}
			focusRequest={inspector.focusRequest}
			isFolder={inspector.isFolder}
			key={inspector.entry.id}
			onClose={inspector.close}
		/>
	);
	if (!inspector.docked) {
		return (
			<InspectorDialog id={id} onClose={inspector.close}>
				{details}
			</InspectorDialog>
		);
	}
	return (
		<aside
			aria-label="Details"
			className="inspector inspector-docked"
			id={id}
			onKeyDown={(event) => {
				if (event.key === "Escape") inspector.close();
			}}
		>
			{details}
		</aside>
	);
}

function InspectorDialog({
	children,
	id,
	onClose,
}: {
	children: ReactNode;
	id: string;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	// Layout effect: the dialog must be modal before the details move focus into it.
	useLayoutEffect(() => {
		if (dialog.current && !dialog.current.open) dialog.current.showModal();
	}, []);
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: Esc closes the modal dialog natively; the click is the backdrop.
		<dialog
			aria-label="Details"
			className="inspector inspector-dialog"
			id={id}
			onClick={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
			onClose={onClose}
			ref={dialog}
		>
			{children}
		</dialog>
	);
}

function InspectorDetails({
	entry,
	focusRequest,
	isFolder,
	onClose,
}: {
	entry: Entry;
	focusRequest: RefObject<boolean>;
	isFolder: boolean;
	onClose: () => void;
}) {
	const heading = useRef<HTMLHeadingElement>(null);
	const sectionId = useId();
	// Move focus only when someone asked to see details, never when a folder loads with it open.
	useEffect(() => {
		if (!focusRequest.current) return;
		focusRequest.current = false;
		heading.current?.focus();
	});
	const kind = entryKind(entry);
	const size = entry.kind === "file" ? entry.currentVersion.sizeBytes : null;
	return (
		<div className="inspector-content">
			<header className="inspector-header">
				<span className="inspector-icon">
					<EntryIcon family={kind.family} />
				</span>
				<div className="inspector-title">
					{isFolder ? <p className="eyebrow">This folder</p> : null}
					<h2 ref={heading} tabIndex={-1}>
						{entry.name}
					</h2>
					<p className="inspector-summary">
						{size ? `${kind.label} · ${formatBytes(size)}` : kind.label}
					</p>
				</div>
				<button
					aria-label="Close details"
					className="icon-button"
					onClick={onClose}
					title="Close details"
					type="button"
				>
					<X aria-hidden="true" />
				</button>
			</header>
			{entry.kind === "file" ? (
				<FilePreview entry={entry} key={entry.currentVersion.id} />
			) : null}
			<section aria-labelledby={sectionId} className="inspector-section">
				<h3 className="inspector-section-title" id={sectionId}>
					Details
				</h3>
				<dl className="inspector-fields">
					{size ? (
						<div>
							<dt>Size</dt>
							<dd>{formatExactBytes(size)}</dd>
						</div>
					) : null}
					<div>
						<dt>Modified</dt>
						<dd>
							<time dateTime={entry.updatedAt}>
								{formatFullDate(entry.updatedAt)}
							</time>
						</dd>
					</div>
					<div>
						<dt>Created</dt>
						<dd>
							<time dateTime={entry.createdAt}>
								{formatFullDate(entry.createdAt)}
							</time>
						</dd>
					</div>
					{entry.kind === "file" ? <IntegrityFields entry={entry} /> : null}
					<div>
						<dt>ID</dt>
						<dd className="inspector-id-row">
							<code className="inspector-id">{entry.id}</code>
							<CopyButton label="ID" value={entry.id} />
						</dd>
					</div>
				</dl>
			</section>
			{entry.kind === "file" ? <FileActions entry={entry} /> : null}
			{entry.kind === "folder" && !isFolder ? (
				<div className="inspector-actions">
					<Link className="button secondary" to={catalogHref(entry.id)}>
						Open folder
					</Link>
				</div>
			) : null}
		</div>
	);
}

/** What makes a file's details trustworthy: its history, where it lives and its verified digest. */
function IntegrityFields({ entry }: { entry: FileEntry }) {
	const { sha256, storageConnectionName } = entry.currentVersion;
	return (
		<>
			<div>
				<dt>Versions</dt>
				<dd>{entry.versionCount}</dd>
			</div>
			<div>
				<dt>Stored on</dt>
				<dd>{storageConnectionName}</dd>
			</div>
			<div>
				<dt>SHA-256</dt>
				{sha256 ? (
					<dd className="inspector-id-row">
						<code className="inspector-id">{sha256}</code>
						<CopyButton label="SHA-256" value={sha256} />
					</dd>
				) : (
					<dd>Not recorded</dd>
				)}
			</div>
		</>
	);
}

function CopyButton({ label, value }: { label: string; value: string }) {
	const [result, setResult] = useState<"copied" | "failed">();
	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
			setResult("copied");
		} catch {
			setResult("failed");
		}
	}
	return (
		<>
			<button
				aria-label={`Copy ${label}`}
				className="icon-button"
				onClick={() => void copy()}
				title={`Copy ${label}`}
				type="button"
			>
				{result === "copied" ? (
					<Check aria-hidden="true" />
				) : (
					<Copy aria-hidden="true" />
				)}
			</button>
			<span className="inspector-note" role="status">
				{result === "copied"
					? "Copied"
					: result === "failed"
						? `Couldn't copy. Select the ${label} to copy it.`
						: ""}
			</span>
		</>
	);
}

function FileActions({ entry }: { entry: FileEntry }) {
	const { busy, download, status } = useOriginalDownload(entry.id, entry.name);
	return (
		<div className="inspector-actions">
			<button
				aria-busy={busy}
				className="button primary"
				disabled={busy}
				onClick={download}
				type="button"
			>
				<Download aria-hidden="true" className="button-icon" />
				Download
			</button>
			<p className="inspector-note" role="status">
				{status}
			</p>
		</div>
	);
}
