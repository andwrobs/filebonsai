import { useEffect, useRef } from "react";
import { useLocation } from "react-router";

// Moves focus to the page's heading, so screen readers announce the page and
// keyboard users continue from its top. Falls back to <main>.
export function focusMainHeading() {
	const target =
		document.querySelector<HTMLElement>("main h1") ??
		document.querySelector<HTMLElement>("main");
	if (!target) return;
	if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
	target.focus({ preventScroll: true });
}

// A single-page app doesn't announce navigation, so focus the new page's
// heading when the path changes. Search and hash changes, like typing in a
// URL-backed filter, and the first load leave focus alone.
export function RouteFocus() {
	const { pathname } = useLocation();
	const previous = useRef(pathname);
	useEffect(() => {
		if (previous.current === pathname) return;
		previous.current = pathname;
		focusMainHeading();
	}, [pathname]);
	return null;
}
