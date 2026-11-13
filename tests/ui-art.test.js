import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "src/art-direction.css"), "utf8");
const ui = readFileSync(resolve(root, "src/ui.js"), "utf8");
const artwork = [
  "soul-portal.svg",
  "world-lingzai.svg",
  "world-zombie.svg",
  "world-beast.svg",
  "avatar-lingzai.svg",
  "avatar-zombie.svg",
  "avatar-beast.svg",
  "elite-horde.svg",
  "elite-armored.svg",
  "elite-swift.svg",
];

describe("UI art preparation is isolated and deployable", () => {
  it("uses the existing stylesheet and follows it with the visual-only layer", () => {
    expect(ui).toContain('import "./style.css";\nimport "./art-direction.css";');
  });

  it.each(artwork)("%s is a self-contained, small SVG asset", (name) => {
    const path = resolve(root, "src/assets", name);
    const svg = readFileSync(path, "utf8");
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain("</svg>");
    expect(svg).toContain("<title>");
    expect(svg).not.toMatch(/<script\b|<foreignObject\b|\bonload\s*=|\bhref\s*=/i);
    expect(statSync(path).size).toBeLessThan(12_000);
  });

  it("lets Vite rewrite every relative asset reference for the Pages base path", () => {
    for (const name of artwork) {
      expect(css).toContain(`url("./assets/${name}")`);
    }
    expect(css).not.toMatch(/url\(\s*["']?\//);
    expect(css).not.toMatch(/url\(\s*["']?https?:/);
  });

  it("keeps readable gameplay labels and respects reduced-motion preferences", () => {
    expect(ui).toContain('data-world-card="');
    expect(ui).toContain("aria-label");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".replay-trait");
    expect(css).toContain("data-wave-trait");
  });

  it("stays in a modest raw asset budget without any sprite dependency", () => {
    const bytes = artwork.reduce(
      (total, name) => total + statSync(resolve(root, "src/assets", name)).size,
      0,
    );
    expect(bytes).toBeLessThan(40_000);
  });
});
