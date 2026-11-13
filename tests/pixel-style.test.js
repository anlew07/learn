import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = readFileSync(resolve(root, "src/style.css"), "utf8");
const art = readFileSync(resolve(root, "src/art-direction.css"), "utf8");
const css = (base + "\n" + art).replace(/\/\*[\s\S]*?\*\//g, "");

describe("pixel UI closure: incompatible visual effects stay out", () => {
  it("does not reintroduce gradients, backdrop blur, soft filters or color mixing", () => {
    expect(css).not.toMatch(/(?:linear|radial|conic)-gradient\s*\(/i);
    expect(css).not.toMatch(/color-mix\s*\(/i);
    expect(css).not.toMatch(/(?:backdrop-filter|filter)\s*:\s*(?:blur|drop-shadow)\s*\(/i);
    expect(css).not.toMatch(/\bmask-image\s*:\s*(?:linear|radial)-gradient/i);
  });

  it("keeps hard pixel corners and offset-only box shadows", () => {
    const radii = [...css.matchAll(/(?:border-radius|--radius)\s*:\s*([^;{}]+)/gi)]
      .map((match) => match[1].trim());
    expect(radii.length).toBeGreaterThan(30);
    for (const value of radii) {
      expect(["0", "0px", "var(--radius)"]).toContain(value);
    }
    const shadows = [...css.matchAll(/box-shadow\s*:\s*([^;{}]+)/gi)]
      .map((match) => match[1].trim());
    expect(shadows.length).toBeGreaterThan(5);
    for (const value of shadows) {
      if (value === "none") continue;
      // Allowed: hard offset shadows without a positive blur radius.
      for (const fragment of value.split(",")) {
        const lengths = fragment.match(/-?\d+(?:\.\d+)?px|(?<![\w-])0(?![\w-])/g) ?? [];
        expect(lengths.length).toBeGreaterThanOrEqual(3);
        expect(parseFloat(lengths[2])).toBe(0);
      }
    }
  });

  it("uses a bounded palette rather than dozens of ad-hoc glow colors", () => {
    const colors = new Set([...css.matchAll(/#[\da-f]{3,8}\b/gi)].map((match) => match[0].toLowerCase()));
    expect(colors.size).toBeLessThanOrEqual(34);
    expect(art).toContain("--pixel-surface");
    expect(art).toContain("--pixel-line");
    expect(art).toContain("--pixel-shadow");
  });

  it("references only existing local sprites in integer atlas scale", () => {
    for (const asset of [
      "soul-portal", "world-lingzai", "world-zombie", "world-beast",
      "avatar-lingzai", "avatar-zombie", "avatar-beast",
      "elite-horde", "elite-armored", "elite-swift", "attack-atlas",
    ]) {
      expect(art).toContain(`url("./assets/${asset}.svg")`);
    }
    expect(art).not.toMatch(/url\(\s*["']?https?:|url\(\s*["']?\//);
    expect(art).toContain("image-rendering:pixelated");
    expect(art).toContain("background-size:288px 32px");
    const styles = ["basic","chain","pierce","fan","flurry","shockwave","storm","barrage","hunt"];
    styles.forEach((style, index) => {
      expect(art).toContain(
        `.replay-wave.attack-${style} .replay-hit { background-position: ${index === 0 ? "0" : `${-32 * index}px`} 0;`,
      );
    });
    expect(art).not.toContain("status-atlas.svg");
  });

  it("keeps 44px targets, narrow-screen rules, safe-area and reduced motion", () => {
    expect(art).toMatch(/button\s*\{\s*min-height:\s*44px/);
    expect(art).toMatch(/summary\s*\{\s*min-height:\s*44px/);
    expect(art).toContain("@media (max-width: 400px)");
    expect(art).toContain("@media (max-width: 350px)");
    expect(base).toContain("safe-area-inset-bottom");
    expect(css).toContain("focus-visible");
    expect(css).toContain("prefers-reduced-motion");
  });

  it("keeps text contrast readable on pixel primary actions and labels", () => {
    const luminance = (hex) => {
      const values = [1, 3, 5].map((index) => {
        const value = parseInt(hex.slice(index, index + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const contrast = (a, b) => {
      const values = [luminance(a), luminance(b)];
      return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
    };
    expect(contrast("#162638", "#69c6ae")).toBeGreaterThanOrEqual(4.5);
    for (const color of ["#a5baca", "#9be7cf", "#ffd0b0", "#ffe0a0", "#df8986"]) {
      expect(contrast(color, "#0b1726")).toBeGreaterThanOrEqual(4.5);
    }
    expect(art).toContain(
      ".footer-nav button.active { background: #69c6ae; border-color: #69c6ae; color: #162638;",
    );
    expect(art).toContain(".footer-nav button.active .nav-glyph { color: #162638; }");
    expect(art).toContain(".pill { background: var(--pixel-base); }");
    expect(art).toContain(
      ".btn { background: #69c6ae; border-color: #9be7cf; color: #162638; }",
    );
  });

  it("preserves legible 320px two-column HUD counters", () => {
    expect(base).toContain("font-size: 15px");
    expect(art).toContain(".run-dashboard .metrics { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }");
    expect(art).toContain(".run-dashboard .metric span { font-size:.75rem; line-height:1.3; }");
    expect(15 * 0.75).toBeGreaterThanOrEqual(11);
  });
});
