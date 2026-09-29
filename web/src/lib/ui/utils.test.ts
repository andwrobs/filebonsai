import { expect, it } from "vitest";
import { buttonVariants } from "~/lib/ui/button";
import { cn } from "~/lib/ui/utils";

// cn's tailwind-merge knows the theme names index.css adds, so a later class
// replaces an earlier one in the same group instead of both surviving.
it("merges Filebonsai's theme sizes, radii and type", () => {
	expect(cn("min-h-control", "min-h-touch")).toBe("min-h-touch");
	expect(cn("rounded-md rounded-pill")).toBe("rounded-pill");
	expect(cn("text-sm", "text-md")).toBe("text-md");
});

it("lets the icon button's sizes win over the base button's", () => {
	const svg = "[&_svg:not([class*='size-'])]";
	const icon = cn(buttonVariants({ size: "icon" })).split(" ");
	expect(icon).toContain(`${svg}:size-icon`);
	expect(icon).not.toContain(`${svg}:size-4`);
	// The floating upload button resizes the icon button.
	const fab = cn(buttonVariants({ size: "icon", className: "size-14" }));
	expect(fab.split(" ")).toContain("size-14");
	expect(fab.split(" ")).not.toContain("size-control");
});
