import { describe, expect, it } from "vitest";
import {
  EXPERIMENT_MOVEMENTS,
  experimentInput,
} from "../scripts/sortie-experiment.mjs";

describe("2E deterministic player-policy scripts", () => {
  it("keeps all three fixed scripts within the normalized input contract", () => {
    const battle = {
      tick: 900,
      hero: { x: 160, y: 224 },
      enemies: [{ x: 35, y: 80 }, { x: 280, y: 380 }],
      drops: [{ x: 40, y: 70 }],
    };
    for (const movement of EXPERIMENT_MOVEMENTS) {
      const first = experimentInput(battle, movement);
      const second = experimentInput(battle, movement);
      expect(first).toEqual(second);
      expect(Number.isFinite(first.x)).toBe(true);
      expect(Number.isFinite(first.y)).toBe(true);
      expect(Math.hypot(first.x, first.y)).toBeLessThanOrEqual(1.000001);
    }
  });

  it("uses zero input for the explicit stationary baseline", () => {
    expect(experimentInput({
      tick: 1, hero: { x: 160, y: 224 }, enemies: [], drops: [],
    }, "stationary")).toEqual({ x: 0, y: 0 });
  });

  it("seeks an actual fragment when no nearby enemy threatens the player", () => {
    const input = experimentInput({
      tick: 100,
      hero: { x: 100, y: 100 },
      enemies: [{ x: 300, y: 400 }],
      drops: [{ x: 200, y: 100 }],
    }, "pickup");
    expect(input.x).toBeGreaterThan(0.99);
    expect(Math.abs(input.y)).toBeLessThan(0.001);
  });

  it("adds an evasive component when a threat is close to the pickup route", () => {
    const input = experimentInput({
      tick: 100,
      hero: { x: 100, y: 100 },
      enemies: [{ x: 100, y: 110 }],
      drops: [{ x: 200, y: 100 }],
    }, "pickup");
    expect(input.x).toBeGreaterThan(0);
    expect(input.y).toBeLessThan(0);
  });

  it("rejects unregistered policy names instead of silently changing the experiment", () => {
    expect(() => experimentInput({
      tick: 1, hero: { x: 160, y: 224 }, enemies: [], drops: [],
    }, "autoplay")).toThrow("Unknown experiment movement");
  });
});
