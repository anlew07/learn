import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "src/art-direction.css"), "utf8");
const ui = readFileSync(resolve(root, "src/ui.js"), "utf8");
const artworkSizes = {
  "soul-portal.svg": [64, 64],
  "world-lingzai.svg": [128, 72],
  "world-zombie.svg": [128, 72],
  "world-beast.svg": [128, 72],
  "avatar-lingzai.svg": [32, 32],
  "avatar-zombie.svg": [32, 32],
  "avatar-beast.svg": [32, 32],
  "elite-horde.svg": [16, 16],
  "elite-armored.svg": [16, 16],
  "elite-swift.svg": [16, 16],
  "attack-atlas.svg": [144, 16],
};
const artwork = Object.keys(artworkSizes);

describe("small, self-contained pixel-art kit", () => {
  it("loads the pixel presentation after the existing game stylesheet", () => {
    expect(ui).toContain('import "./style.css";\nimport "./art-direction.css";');
  });

  it.each(artwork)("keeps %s on a tiny, fixed integer pixel grid", (name) => {
    const path = resolve(root, "src/assets", name);
    const svg = readFileSync(path, "utf8");
    const [width, height] = artworkSizes[name];
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain("<title>");
    expect(svg).toContain("</svg>");
    expect(svg).not.toMatch(/<(?:script|foreignObject|linearGradient|radialGradient|image|filter)\b|\bonload\s*=|\bhref\s*=/i);
    expect(new Set([...svg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1])).size).toBeLessThanOrEqual(9);
    expect(statSync(path).size).toBeLessThan(4_000);
  });

  it("lets Vite rewrite all local art paths for the Pages base path", () => {
    for (const name of artwork) {
      expect(css).toContain(`url("./assets/${name}")`);
    }
    expect(css).not.toMatch(/url\(\s*["']?\//);
    expect(css).not.toMatch(/url\(\s*["']?https?:/);
  });

  it("renders sprites using nearest-neighbor scaling and recognizes every replay attack", () => {
    expect(css).toContain("image-rendering: pixelated");
    expect(css).toContain('background-size: 252px 28px');
    for (const attack of ["basic", "chain", "pierce", "fan", "flurry", "shockwave", "storm", "barrage", "hunt"]) {
      expect(css).toContain(`.replay-wave.attack-${attack} .replay-hit`);
    }
    for (const kind of ["horde", "armored", "swift"]) {
      expect(css).toContain(`.replay-trait[data-wave-trait="${kind}"]::before`);
    }
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(ui).toContain('data-world-card="');
    expect(ui).toContain("aria-label");
  });

  it("uses less than 17 KiB of raw SVG sources in total", () => {
    const bytes = artwork.reduce((total, name) => total + statSync(resolve(root, "src/assets", name)).size, 0);
    expect(bytes).toBeLessThan(17 * 1024);
  });
});
