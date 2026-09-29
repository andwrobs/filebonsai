// @vitest-environment node
// Reads source files from disk, so it runs in Node rather than jsdom.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

const stylesDir = import.meta.dirname;
const srcDir = join(stylesDir, "..");
const tokens = readFileSync(join(stylesDir, "tokens.css"), "utf8");
const color = (name: string) => {
	const match = tokens.match(
		new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, "i"),
	);
	expect(match, `--color-${name} is a six-digit hex token`).toBeTruthy();
	return match?.[1] as string;
};

function luminance(hex: string) {
	const [r, g, b] = [1, 3, 5].map((index) => {
		const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
		return channel <= 0.04045
			? channel / 12.92
			: ((channel + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string) {
	const [light, dark] = [
		luminance(color(foreground)),
		luminance(color(background)),
	].sort((a, b) => b - a) as [number, number];
	return (light + 0.05) / (dark + 0.05);
}

const atLeast = (foreground: string, background: string, minimum: number) =>
	expect(
		contrast(foreground, background),
		`${foreground} on ${background}`,
	).toBeGreaterThanOrEqual(minimum);

it("text roles meet WCAG AA on every surface they appear on", () => {
	const surfaces = [
		"canvas",
		"surface",
		"surface-sunken",
		"surface-hover",
		"surface-accent",
	];
	for (const text of [
		"text",
		"text-muted",
		"text-subtle",
		"accent-text",
		"danger",
	]) {
		for (const surface of surfaces) atLeast(text, surface, 4.5);
	}
	atLeast("selection-text", "selection", 4.5);
	atLeast("text-muted", "selection", 4.5);
	atLeast("on-accent", "accent", 4.5);
	atLeast("on-accent", "accent-hover", 4.5);
	atLeast("danger", "danger-surface", 4.5);
});

it("focus and control boundaries meet the 3:1 non-text minimum", () => {
	for (const surface of ["canvas", "surface", "surface-sunken", "selection"]) {
		atLeast("focus", surface, 3);
	}
	atLeast("accent", "surface", 3);
	for (const surface of ["canvas", "surface", "surface-accent"]) {
		atLeast("control-border", surface, 3);
	}
});

// Screens use roles, never literal colors. The token files hold them; lib/ui
// is registry source, whose selectors match upstream literals such as #ccc.
const tokenFiles = ["styles/index.css", "styles/tokens.css"];
const exempt = ["lib/ui/", "lib/api/generated/"];

it("raw colors live only in the token files", () => {
	const offenders: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			const name = relative(srcDir, path);
			if (entry.isDirectory()) {
				if (!exempt.includes(`${name}/`)) walk(path);
			} else if (
				/\.(css|tsx?)$/.test(entry.name) &&
				!/\.test\.tsx?$/.test(entry.name) &&
				!tokenFiles.includes(name)
			) {
				const source = readFileSync(path, "utf8");
				if (
					/#[0-9a-f]{3,8}\b(?![-\w])|\b(?:rgba?|hsla?|oklch)\(/i.test(source)
				) {
					offenders.push(name);
				}
			}
		}
	};
	walk(srcDir);
	expect(offenders).toEqual([]);
});
