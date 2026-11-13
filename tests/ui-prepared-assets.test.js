import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetPath = resolve(root, "src/assets/status-atlas.svg");

describe("prepared status icons remain optional", () => {
  it("stores a tiny, script-free eight-tile pixel atlas", () => {
    const source = readFileSync(assetPath, "utf8");
    expect(source).toMatch(/^<svg\b/);
    expect(source).toContain('viewBox="0 0 128 16"');
    expect(source).toContain('shape-rendering="crispEdges"');
    expect(source).toContain("<title>");
    expect(source).toContain("</svg>");
    expect(source).not.toMatch(/<script\b|<foreignObject\b|<image\b|<filter\b|\bonload\s*=|\bhref\s*=/i);
    expect(new Set([...source.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1])).size).toBeLessThanOrEqual(8);
    expect(statSync(assetPath).size).toBeLessThan(3_000);
  });

  it("does not change the current H5 interface or add download cost", () => {
    const ui = readFileSync(resolve(root, "src/ui.js"), "utf8");
    const css = readFileSync(resolve(root, "src/art-direction.css"), "utf8");
    expect(ui).not.toContain("status-atlas.svg");
    expect(css).not.toContain("status-atlas.svg");
  });
});
