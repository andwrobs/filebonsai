import { useState } from "react";
import { useLocation, useNavigationType } from "react-router";

export const typingState = { source: "search-input" };

/**
 * The search box shows what was typed at once; the URL catches up later, after
 * the navigation commits or a debounce fires. Take the URL's value only when
 * something else changed it: Back, Forward, a link, or another control. Write
 * typed values with `{ replace: true, state: typingState }`.
 */
export function useSearchDraft(urlValue: string) {
	const location = useLocation();
	const navigationType = useNavigationType();
	const [draft, setDraft] = useState(urlValue);
	const [seenKey, setSeenKey] = useState(location.key);
	if (location.key !== seenKey) {
		setSeenKey(location.key);
		const typed =
			navigationType !== "POP" && location.state?.source === typingState.source;
		if (!typed) setDraft(urlValue);
	}
	return [draft, setDraft] as const;
}
