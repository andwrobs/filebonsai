import type { Entry } from "~/lib/catalog/catalog";
import { formatBytes } from "~/lib/format/bytes";

export type KindFamily =
	| "folder"
	| "image"
	| "pdf"
	| "document"
	| "spreadsheet"
	| "presentation"
	| "archive"
	| "audio"
	| "video"
	| "code"
	| "text"
	| "file";

const labels: Record<KindFamily, string> = {
	folder: "Folder",
	image: "Image",
	pdf: "PDF",
	document: "Document",
	spreadsheet: "Spreadsheet",
	presentation: "Presentation",
	archive: "Archive",
	audio: "Audio",
	video: "Video",
	code: "Code",
	text: "Text",
	file: "File",
};

const isFamily = (value: string): value is Exclude<KindFamily, "folder"> =>
	value !== "folder" && Object.hasOwn(labels, value);

/**
 * The server guesses a file's family from its extension and sorts by it, so the
 * Kind column and the kind sort agree. The vocabulary is open: a family this
 * client does not know yet shows by name with the plain file icon.
 */
export function entryKind(entry: Entry): {
	family: KindFamily;
	label: string;
} {
	if (entry.kind === "folder")
		return { family: "folder", label: labels.folder };
	if (isFamily(entry.family)) {
		return { family: entry.family, label: labels[entry.family] };
	}
	const unknown = entry.family.trim();
	return {
		family: "file",
		label: unknown
			? unknown.charAt(0).toUpperCase() + unknown.slice(1)
			: labels.file,
	};
}

/** Short modified label: time today, "Yesterday", month and day this year, full date otherwise. */
export function formatModified(
	iso: string,
	now = new Date(),
	locale?: string,
	timeZone?: string,
) {
	const date = new Date(iso);
	const day = (value: Date) =>
		new Intl.DateTimeFormat("en-CA", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(value);
	const today = day(now);
	if (day(date) === today) {
		return new Intl.DateTimeFormat(locale, {
			timeZone,
			hour: "numeric",
			minute: "2-digit",
		}).format(date);
	}
	const [year, month, date_] = today.split("-").map(Number) as [
		number,
		number,
		number,
	];
	const yesterday = new Date(Date.UTC(year, month - 1, date_ - 1))
		.toISOString()
		.slice(0, 10);
	if (day(date) === yesterday) return "Yesterday";
	const sameYear = day(date).slice(0, 4) === today.slice(0, 4);
	return new Intl.DateTimeFormat(locale, {
		timeZone,
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	}).format(date);
}

/** Full date and time for details, where the short list label would be ambiguous. */
export function formatFullDate(
	iso: string,
	locale?: string,
	timeZone?: string,
) {
	return new Intl.DateTimeFormat(locale, {
		timeZone,
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(iso));
}

/** Size or kind plus modified date, for layouts too narrow for separate columns. */
export function entryMeta(
	entry: Entry,
	now = new Date(),
	locale?: string,
	timeZone?: string,
) {
	const lead =
		entry.kind === "folder"
			? "Folder"
			: formatBytes(entry.currentVersion.sizeBytes);
	return `${lead} · ${formatModified(entry.updatedAt, now, locale, timeZone)}`;
}
