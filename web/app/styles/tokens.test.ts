import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const stylesDir = fileURLToPath(new URL(".", import.meta.url));
const appDir = join(stylesDir, "..");
const tokens = readFileSync(join(stylesDir, "tokens.css"), "utf8");
const color = (name: string) => {
  const match = tokens.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, "i"));
  assert.ok(match, `--color-${name} is a six-digit hex token`);
  return match[1];
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string) {
  const [light, dark] = [luminance(color(foreground)), luminance(color(background))].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

test("text roles meet WCAG AA on every surface they appear on", () => {
  const surfaces = ["canvas", "surface", "surface-sunken", "surface-hover", "surface-accent"];
  for (const text of ["text", "text-muted", "text-subtle", "accent-text", "danger"]) {
    for (const surface of surfaces) {
      assert.ok(contrast(text, surface) >= 4.5, `${text} on ${surface}: ${contrast(text, surface).toFixed(2)}`);
    }
  }
  assert.ok(contrast("selection-text", "selection") >= 4.5);
  assert.ok(contrast("text-muted", "selection") >= 4.5);
  assert.ok(contrast("on-accent", "accent") >= 4.5);
  assert.ok(contrast("on-accent", "accent-hover") >= 4.5);
  assert.ok(contrast("danger", "danger-surface") >= 4.5);
});

test("focus and control boundaries meet the 3:1 non-text minimum", () => {
  for (const surface of ["canvas", "surface", "surface-sunken", "selection"]) {
    assert.ok(contrast("focus", surface) >= 3, `focus on ${surface}: ${contrast("focus", surface).toFixed(2)}`);
  }
  assert.ok(contrast("accent", "surface") >= 3);
});

test("raw colors live only in the token file", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(css|tsx?)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && path !== join(stylesDir, "tokens.css")) {
        const source = readFileSync(path, "utf8");
        if (/#[0-9a-f]{3,8}\b(?![-\w])|\b(?:rgba?|hsla?|oklch)\(/i.test(source)) offenders.push(path);
      }
    }
  };
  walk(appDir);
  assert.deepEqual(offenders, []);
});
