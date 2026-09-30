import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(cleanup);

// Testing Library advances fake timers after each user-event call only when it
// sees Jest. Point it at Vitest so tests with vi.useFakeTimers() don't hang.
Object.assign(globalThis, {
	jest: { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) },
});

// jsdom has no IntersectionObserver; React Aria's load-more sentinel needs one.
// Tests that page a tree replace it with a stub that reports intersections.
if (!("IntersectionObserver" in globalThis)) {
	class NoIntersectionObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
		takeRecords() {
			return [];
		}
	}
	Object.assign(globalThis, { IntersectionObserver: NoIntersectionObserver });
}
