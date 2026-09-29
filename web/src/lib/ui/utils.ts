import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the theme names src/styles/index.css adds, so `text-md` merges
// as a font size and `min-h-control` as a size instead of surviving beside a conflict.
const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			text: ["md"],
			spacing: [
				"control",
				"touch",
				"row",
				"icon",
				"sidebar",
				"rail",
				"mobile-bar",
				"bottom-nav",
				"tray-header",
				"inspector",
				"gutter",
			],
			radius: ["pill"],
			shadow: ["raised", "floating"],
			breakpoint: ["wide"],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
