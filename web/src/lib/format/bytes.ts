// Byte counts arrive as exact decimal strings; BigInt keeps values past 2^53.

const units = [
	{ label: "PB", size: 1125899906842624n },
	{ label: "TB", size: 1099511627776n },
	{ label: "GB", size: 1073741824n },
	{ label: "MB", size: 1048576n },
	{ label: "KB", size: 1024n },
];

/** Rounded size for lists and summaries, such as "1.5 KB". */
export function formatBytes(value: string) {
	const bytes = BigInt(value);
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

/** Exact count for details; list rows keep the rounded size. */
export function formatExactBytes(value: string, locale?: string) {
	const bytes = BigInt(value);
	return `${bytes.toLocaleString(locale)} ${bytes === 1n ? "byte" : "bytes"}`;
}
