import { describe, expect, it } from "vitest";
import { paintWorldSceneDetails } from "../src/ui/world-scene-details.js";

const stage = { supplyTier: 0, progressTier: 0, activity: "observing" };
function sample(worldId, phase = "stable") {
  const rects = [];
  const ctx = {
    fillStyle: "",
    fillRect(x, y, width, height) {
      rects.push([this.fillStyle, x, y, width, height]);
    },
  };
  paintWorldSceneDetails(ctx, { worldId, scene: { ...stage, phase } }, 0);
  return rects;
}

describe("pixel art world landmarks", () => {
  it("uses different silhouettes for the three worlds", () => {
    const ling = sample("lingzai");
    const waste = sample("zombie");
    const beast = sample("beast");
    expect(ling).not.toEqual(waste);
    expect(waste).not.toEqual(beast);
    expect(beast).not.toEqual(ling);
    expect(ling.some(([color]) => color === "#88c4a8")).toBe(true);
    expect(waste.some(([color]) => color === "#9e9b7d")).toBe(true);
    expect(beast.some(([color]) => color === "#c5ad7a")).toBe(true);
  });

  it("adds a different visible signal for critical and restored phases", () => {
    const stable = sample("lingzai", "stable");
    const critical = sample("lingzai", "critical");
    const restored = sample("lingzai", "restored");
    expect(critical).not.toEqual(stable);
    expect(restored).not.toEqual(stable);
    expect(critical.some(([color]) => color === "#be7775")).toBe(true);
    expect(restored.some(([color]) => color === "#79b78b")).toBe(true);
  });

  it("does not require canvas paths, images or game mutations", () => {
    expect(() => sample("lingzai", "stable")).not.toThrow();
  });
});
