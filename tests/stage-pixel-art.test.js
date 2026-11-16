import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const scene = readFileSync(resolve(root, "src/ui/pixel-stage.js"), "utf8");
const sprites = [
  "clone-cultivator.svg",
  "rescue-scout.svg",
  "rift-beast.svg",
  "supply-chest.svg",
];

describe("recognizable project-owned pixel scene art", () => {
  it("does not ship or import the rejected tiny-dungeon pack", () => {
    expect(existsSync(resolve(root, "src/assets/tiny-dungeon"))).toBe(false);
    expect(scene).not.toMatch(/tiny-dungeon|sgravoquest-assets|kenney/i);
    expect(scene).toContain("stoneBrick(ctx,");
    for (const file of sprites) expect(scene).toContain(file);
  });

  it("ships standalone recognizable sprites with crisp pixel edges", () => {
    for (const file of sprites) {
      const svg = readFileSync(resolve(root, "src/assets/original", file), "utf8");
      expect(svg).toContain('shape-rendering="crispEdges"');
      expect(svg).toMatch(/<svg[^>]+viewBox="0 0 (?:38 34|44 60|48 64|56 60)"/);
      expect(svg.match(/<path\s/g)?.length || 0).toBeGreaterThan(9);
      expect(svg).not.toMatch(/<image\b|<script\b|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    }
  });

  it("renders three distinct functional silhouettes at legible scales", () => {
    expect(scene).toContain('sprite(ctx, "hero", heroX, heroY - bob, 46, 62, repaint)');
    expect(scene).toContain('sprite(ctx, "ally", allyX, 127 + bob, 32, 45, repaint)');
    expect(scene).toContain('sprite(ctx, "foe", 268, 125 +');
    expect(scene).not.toContain("function atlas(");
  });
});
