import type { ApiError, Entry } from "../../../src/lib/api/api-types.js";

export function catalogHref(entryId: string) {
  return `/library/${encodeURIComponent(entryId)}`;
}

export function uniqueEntries(entries: readonly Entry[]) {
  return entries.filter((entry, index) => entries.findIndex((candidate) => candidate.id === entry.id) === index);
}

export type KindFamily =
  | "folder" | "image" | "pdf" | "document" | "spreadsheet" | "presentation"
  | "archive" | "audio" | "video" | "code" | "text" | "file";

const families: Record<Exclude<KindFamily, "folder">, { label: string; extensions: string[] }> = {
  image: { label: "Image", extensions: ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "avif", "bmp", "tif", "tiff", "svg", "raw", "dng", "cr2", "nef", "arw"] },
  pdf: { label: "PDF", extensions: ["pdf"] },
  document: { label: "Document", extensions: ["doc", "docx", "odt", "rtf", "pages"] },
  spreadsheet: { label: "Spreadsheet", extensions: ["xls", "xlsx", "ods", "csv", "tsv", "numbers"] },
  presentation: { label: "Presentation", extensions: ["ppt", "pptx", "odp", "key"] },
  archive: { label: "Archive", extensions: ["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar", "zst"] },
  audio: { label: "Audio", extensions: ["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus", "aiff"] },
  video: { label: "Video", extensions: ["mp4", "m4v", "mov", "mkv", "webm", "avi"] },
  code: { label: "Code", extensions: ["js", "ts", "tsx", "jsx", "json", "java", "py", "rb", "go", "rs", "swift", "kt", "c", "h", "cpp", "sh", "yml", "yaml", "toml", "xml", "html", "css", "sql"] },
  text: { label: "Text", extensions: ["txt", "md", "markdown", "log"] },
  file: { label: "File", extensions: [] },
};

/** Display-only kind guessed from the name's extension; the name is metadata, never content. */
export function entryKind(entry: Pick<Entry, "kind" | "name">): { family: KindFamily; label: string } {
  if (entry.kind === "folder") return { family: "folder", label: "Folder" };
  const dot = entry.name.lastIndexOf(".");
  const extension = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : "";
  for (const [family, { label, extensions }] of Object.entries(families)) {
    if (extensions.includes(extension)) return { family: family as KindFamily, label };
  }
  return { family: "file", label: "File" };
}

/** Short modified label: time today, "Yesterday", month and day this year, full date otherwise. */
export function formatModified(iso: string, now = new Date(), locale?: string, timeZone?: string) {
  const date = new Date(iso);
  const day = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const today = day(now);
  if (day(date) === today) return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(date);
  const [year, month, date_] = today.split("-").map(Number);
  if (day(date) === new Date(Date.UTC(year, month - 1, date_ - 1)).toISOString().slice(0, 10)) return "Yesterday";
  const sameYear = day(date).slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat(locale, { timeZone, month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
}

/** Size or kind plus modified date, for layouts too narrow for separate columns. */
export function entryMeta(entry: Entry, now = new Date(), locale?: string, timeZone?: string) {
  const lead = entry.kind === "folder" ? "Folder" : formatBytes(entry.currentVersion.sizeBytes);
  return `${lead} · ${formatModified(entry.updatedAt, now, locale, timeZone)}`;
}

export function formatBytes(value: string) {
  const bytes = BigInt(value);
  const units = [
    { label: "PB", size: 1125899906842624n },
    { label: "TB", size: 1099511627776n },
    { label: "GB", size: 1073741824n },
    { label: "MB", size: 1048576n },
    { label: "KB", size: 1024n },
  ];
  const unit = units.find(({ size }) => bytes >= size);
  if (!unit) {
    return `${bytes.toLocaleString()} B`;
  }
  const whole = bytes / unit.size;
  const tenths = ((bytes % unit.size) * 10n) / unit.size;
  if (tenths === 0n) {
    return `${whole.toLocaleString()} ${unit.label}`;
  }
  return `${whole.toLocaleString()}.${tenths} ${unit.label}`;
}

export function errorMessage(error: ApiError | undefined, fallback: string) {
  if (error?.code === "NAME_CONFLICT") {
    return "An entry with that name already exists in this folder.";
  }
  if (error?.code === "ENTRY_NOT_FOUND") {
    return "This folder is not available.";
  }
  return error?.message || fallback;
}
