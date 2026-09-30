import { vi } from "vitest";

/**
 * jsdom has no layout, but a virtualized list mounts only the rows its scroll
 * container is tall enough to show. React Aria decides that from
 * `HTMLElement.prototype.clientHeight` when it is defined, so this defines it,
 * and gives a `h-control` or `h-touch` element its row height. Call the
 * returned function to undo it (and vi.restoreAllMocks() for the spy).
 */
export function stubVirtualLayout({
	height = 600,
	width = 300,
	scrollHeight = 0,
}: {
	height?: number;
	width?: number;
	scrollHeight?: number;
} = {}) {
	const sizes = { clientHeight: height, clientWidth: width, scrollHeight };
	for (const [name, value] of Object.entries(sizes)) {
		Object.defineProperty(HTMLElement.prototype, name, {
			configurable: true,
			get: () => value,
		});
	}
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		function (this: Element) {
			const rowHeight = this.classList.contains("h-touch")
				? 44
				: this.classList.contains("h-control")
					? 36
					: 0;
			return new DOMRect(0, 0, 0, rowHeight);
		},
	);
	return () => {
		for (const name of Object.keys(sizes)) {
			Reflect.deleteProperty(HTMLElement.prototype, name);
		}
		vi.restoreAllMocks();
	};
}
