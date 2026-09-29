export const appName = "Filebonsai";

// "Storage · Filebonsai" for a page, or the app name alone.
export function pageTitle(page?: string) {
	return page ? `${page} · ${appName}` : appName;
}
