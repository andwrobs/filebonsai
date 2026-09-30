import { useSyncExternalStore } from "react";

// The sidebar (and so the inline tree) shows from the `wide` breakpoint; CSS
// decides how it looks, and this only decides whether to mount the tree at all,
// so a hidden one doesn't fetch. It reads the same `--breakpoint-wide` token.
function wideQuery() {
	const width = getComputedStyle(document.documentElement)
		.getPropertyValue("--breakpoint-wide")
		.trim();
	return width ? window.matchMedia?.(`(min-width: ${width})`) : undefined;
}

function subscribe(onChange: () => void) {
	const query = wideQuery();
	query?.addEventListener("change", onChange);
	return () => query?.removeEventListener("change", onChange);
}

const getSnapshot = () => wideQuery()?.matches ?? false;

export function useIsWideShell() {
	return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
