import type { ApiError, Entry } from "../../../src/lib/api/api-types.js";

export function catalogHref(entryId: string) {
  return `/library/${encodeURIComponent(entryId)}`;
}

export function uniqueEntries(entries: readonly Entry[]) {
  return entries.filter((entry, index) => entries.findIndex((candidate) => candidate.id === entry.id) === index);
}

export function entryMeta(entry: Entry) {
  if (entry.kind === "folder") {
    return "Folder";
  }
  return `${formatBytes(entry.currentVersion.sizeBytes)} · File`;
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
