import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  paintWorldArchitecture,
  paintWorldForeground,
  paintWorldSkyDetails,
} from "../src/ui/pixel-biomes.js";

const root = resolve(import.meta.dirname, "..");

function draw(view) {
  const marks = [];
  const ctx = {
    fillStyle: "",
    fillRect(x, y, width, height) {
      marks.push([this.fillStyle, x, y, width, height]);
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {
      marks.push(["polygon", this.fillStyle]);
    },
  };
  paintWorldSkyDetails(ctx, view, 170);
  paintWorldArchitecture(ctx, view);
  paintWorldForeground(ctx, view, 0);
  return marks;
}

describe("original scene biomes are read-only and visually distinct", () => {
  it("draws different landmark silhouettes for all three worlds", () => {
    const worldIds = ["lingzai", "zombie", "beast"];
    const marks = worldIds.map((worldId) =>
      draw(Object.freeze({ worldId, scene: Object.freeze({ phase: "stable" }) })),
    );
    expect(marks.every((mark) => mark.length > 2)).toBe(true);
    expect(new Set(marks.map((mark) => JSON.stringify(mark))).size).toBe(3);
  });

  it("draws crisis markers only when pressure actually reaches critical", () => {
    const stable = draw({ worldId: "zombie", scene: { phase: "stable" } });
    const critical = draw({ worldId: "zombie", scene: { phase: "critical" } });
    expect(JSON.stringify(stable)).not.toEqual(JSON.stringify(critical));
  });

  it("keeps canvas and CSS purely local and pixel crisp", () => {
    const biome = readFileSync(resolve(root, "src/ui/pixel-biomes.js"), "utf8");
    const stage = readFileSync(resolve(root, "src/ui/pixel-stage.js"), "utf8");
    const css = readFileSync(resolve(root, "src/pixel-visual-language.css"), "utf8");
    const hud = readFileSync(resolve(root, "src/assets/original/hud-symbols.svg"), "utf8");

    expect(biome).not.toMatch(/Math\.random|localStorage|saveRepository|Engine\.step/);
    expect(stage).toContain("else paintWorldArchitecture(ctx, view);");
    expect(stage).toContain("paintWorldForeground(ctx, view, frame);");
    expect(stage).toContain("paintWorldSkyDetails(ctx, view, topHeight);");
    for (const sprite of ["wasteland-runner", "dust-crawler", "beast-warden", "horned-hunter"]) {
      expect(stage).toContain(sprite + ".svg");
    }
    expect(css).toContain(".stage-actions > button[data-panel]");
    expect(css).toContain(".stage-sheet-body");
    expect(css).toContain(".app-shell:not(.stage-mode)");
    expect(css).toContain("hud-symbols.svg");
    expect(css).not.toMatch(/(?:linear|radial|conic)-gradient\s*\(|blur\s*\(|https?:\/\//);
    expect(hud).toContain('viewBox="0 0 96 16"');
    expect(hud).toContain('shape-rendering="crispEdges"');
  });
});
