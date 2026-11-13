import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "src/art-direction.css"), "utf8");
const ui = readFileSync(resolve(root, "src/ui.js"), "utf8");
const mainCss = readFileSync(resolve(root, "src/style.css"), "utf8");

describe("mobile pixel UI presentation contract", () => {
  it("loads the art layer exactly once after the base stylesheet", () => {
    const firstLine = ui.split("\n", 1)[0];
    expect(firstLine).toBe('import "./style.css"; import "./art-direction.css";');
    expect(ui.match(/art-direction\.css/g)).toHaveLength(1);
  });

  it("keeps real major-event, aid and crisis commands owned by the main UI", () => {
    for (const hook of [
      'class="event-choice"',
      'class="crisis-action"',
      'class="aid-option"',
      'class="replay-head"',
      'data-action="aid"',
      'data-action="fusion"',
      'data-action="replay-wave"',
    ]) {
      expect(ui).toContain(hook);
    }
    for (const panel of [".event-choice", ".crisis-panel", ".aid-option", ".replay-head"]) {
      expect(css).toContain(panel);
    }
  });

  it("improves touch targets and keyboard navigation without changing click handlers", () => {
    expect(css).toContain("touch-action: manipulation");
    expect(css).toMatch(/\.event-choice button,[\s\S]*?\.build-choice button,[\s\S]*?min-height: 44px/);
    expect(css).toMatch(/\.world-intel summary,[\s\S]*?min-height: 44px/);
    expect(css + mainCss).toContain("focus-visible");
    expect(css).not.toContain("data-action=");
  });

  it("keeps the 320px layout readable with pixel-scale sprites and accessible motion", () => {
    expect(css).toContain("@media (max-width: 400px)");
    expect(css).toContain("@media (max-width: 350px)");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("image-rendering: pixelated");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/\.replay-arena\.is-playing \.replay-hit\s*\{\s*animation: none !important/);
  });

  it("retains a Vite-relative, optional art pipeline without new runtime assets", () => {
    expect(css).toContain('url("./assets/attack-atlas.svg")');
    expect(css).not.toContain('status-atlas.svg');
    expect(css).not.toMatch(/url\(\s*["']?\//);
    expect(css).not.toMatch(/url\(\s*["']?https?:/);
  });
});
