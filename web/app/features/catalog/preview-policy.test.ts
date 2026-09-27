import assert from "node:assert/strict";
import test from "node:test";

import { IMAGE_PREVIEW_LIMIT, previewPolicy, TEXT_PREVIEW_LIMIT } from "./preview-policy.js";

function file(name: string, sizeBytes: string) {
  return { name, currentVersion: { id: "version", sizeBytes } };
}

test("only allowed raster formats and plain text get explicit types", () => {
  for (const [extension, type] of Object.entries({
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", avif: "image/avif",
  })) {
    assert.deepEqual(previewPolicy(file(`photo.${extension.toUpperCase()}`, "0")),
      { kind: "image", mimeType: type, maxBytes: IMAGE_PREVIEW_LIMIT });
  }
  for (const extension of ["txt", "log"]) {
    assert.deepEqual(previewPolicy(file(`notes.${extension}`, "0")),
      { kind: "text", mimeType: "text/plain;charset=utf-8", maxBytes: TEXT_PREVIEW_LIMIT });
  }
});

test("markup, documents, deceptive extensions, and unknown formats never preview", () => {
  for (const name of ["page.html", "drawing.svg", "report.pdf", "README.md", "notes.markdown", "photo.png.html", ".png", "photo.heic", "no-extension"]) {
    assert.deepEqual(previewPolicy(file(name, "12")), { kind: "unsupported" });
  }
});

test("metadata size gates the request at and above each cap without number precision loss", () => {
  assert.equal(previewPolicy(file("a.png", String(IMAGE_PREVIEW_LIMIT))).kind, "image");
  assert.deepEqual(previewPolicy(file("a.png", String(IMAGE_PREVIEW_LIMIT + 1))),
    { kind: "too-large", maxBytes: IMAGE_PREVIEW_LIMIT });
  assert.equal(previewPolicy(file("a.txt", String(TEXT_PREVIEW_LIMIT))).kind, "text");
  assert.deepEqual(previewPolicy(file("a.txt", "9007199254740993")),
    { kind: "too-large", maxBytes: TEXT_PREVIEW_LIMIT });
});
