import { expect, it } from "vitest";

import {
	IMAGE_PREVIEW_LIMIT,
	previewPolicy,
	TEXT_PREVIEW_LIMIT,
} from "./preview-policy";

function file(name: string, sizeBytes: string) {
	return {
		name,
		currentVersion: {
			id: "version",
			sha256: null,
			sizeBytes,
			storageConnectionName: "Local disk",
		},
	};
}

it("only allowed raster formats and plain text get explicit types", () => {
	for (const [extension, type] of Object.entries({
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		webp: "image/webp",
		avif: "image/avif",
	})) {
		expect(
			previewPolicy(file(`photo.${extension.toUpperCase()}`, "0")),
		).toEqual({ kind: "image", mimeType: type, maxBytes: IMAGE_PREVIEW_LIMIT });
	}
	for (const extension of ["txt", "log"]) {
		expect(previewPolicy(file(`notes.${extension}`, "0"))).toEqual({
			kind: "text",
			mimeType: "text/plain;charset=utf-8",
			maxBytes: TEXT_PREVIEW_LIMIT,
		});
	}
});

it("markup, documents, deceptive extensions, and unknown formats never preview", () => {
	for (const name of [
		"page.html",
		"drawing.svg",
		"report.pdf",
		"README.md",
		"notes.markdown",
		"photo.png.html",
		".png",
		"photo.heic",
		"no-extension",
	]) {
		expect(previewPolicy(file(name, "12"))).toEqual({ kind: "unsupported" });
	}
});

it("metadata size gates the request at and above each cap without number precision loss", () => {
	expect(previewPolicy(file("a.png", String(IMAGE_PREVIEW_LIMIT))).kind).toBe(
		"image",
	);
	expect(previewPolicy(file("a.png", String(IMAGE_PREVIEW_LIMIT + 1)))).toEqual(
		{ kind: "too-large", maxBytes: IMAGE_PREVIEW_LIMIT },
	);
	expect(previewPolicy(file("a.txt", String(TEXT_PREVIEW_LIMIT))).kind).toBe(
		"text",
	);
	expect(previewPolicy(file("a.txt", "9007199254740993"))).toEqual({
		kind: "too-large",
		maxBytes: TEXT_PREVIEW_LIMIT,
	});
});
