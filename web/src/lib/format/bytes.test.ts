import { expect, it } from "vitest";
import { formatBytes, formatExactBytes } from "./bytes";

it("formats exact byte strings without coercing the stored value", () => {
	expect(formatBytes("0")).toBe("0 B");
	expect(formatBytes("1536")).toBe("1.5 KB");
	expect(formatBytes("9007199254740993")).toBe("8 PB");
});

it("spells out the exact byte count", () => {
	expect(formatExactBytes("0", "en-US")).toBe("0 bytes");
	expect(formatExactBytes("1", "en-US")).toBe("1 byte");
	expect(formatExactBytes("5505024", "en-US")).toBe("5,505,024 bytes");
	expect(formatExactBytes("9007199254740993", "en-US")).toBe(
		"9,007,199,254,740,993 bytes",
	);
});
