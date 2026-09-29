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

const families: Record<
	Exclude<KindFamily, "folder">,
	{ label: string; extensions: string[] }
> = {
	image: {
		label: "Image",
		extensions: [
			"jpg",
			"jpeg",
			"png",
			"gif",
			"webp",
			"heic",
			"heif",
			"avif",
			"bmp",
			"tif",
			"tiff",
			"svg",
			"raw",
			"dng",
			"cr2",
			"nef",
			"arw",
		],
	},
	pdf: { label: "PDF", extensions: ["pdf"] },
	document: {
		label: "Document",
		extensions: ["doc", "docx", "odt", "rtf", "pages"],
	},
	spreadsheet: {
		label: "Spreadsheet",
		extensions: ["xls", "xlsx", "ods", "csv", "tsv", "numbers"],
	},
	presentation: {
		label: "Presentation",
		extensions: ["ppt", "pptx", "odp", "key"],
	},
	archive: {
		label: "Archive",
		extensions: ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "zst"],
	},
	audio: {
		label: "Audio",
		extensions: ["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "aiff"],
	},
	video: {
		label: "Video",
		extensions: ["mp4", "m4v", "mov", "mkv", "webm", "avi"],
	},
	code: {
		label: "Code",
		extensions: [
			"js",
			"ts",
			"tsx",
			"jsx",
			"json",
			"java",
			"py",
			"rb",
			"go",
			"rs",
			"swift",
			"kt",
			"c",
			"h",
			"cpp",
			"sh",
			"yml",
			"yaml",
			"toml",
			"xml",
			"html",
			"css",
			"sql",
		],
	},
	text: { label: "Text", extensions: ["txt", "md", "markdown", "log"] },
	file: { label: "File", extensions: [] },
};

/** Display-only kind guessed from the name's extension; the name is metadata, never content. */
export function entryKind(entry: Pick<Entry, "kind" | "name">): {
	family: KindFamily;
	label: string;
} {
	if (entry.kind === "folder") return { family: "folder", label: "Folder" };
	const dot = entry.name.lastIndexOf(".");
	const extension = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : "";
	for (const [family, { label, extensions }] of Object.entries(families)) {
		if (extensions.includes(extension)) {
			return { family: family as KindFamily, label };
		}
	}
	return { family: "file", label: "File" };
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
