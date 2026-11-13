import { describe, expect, it } from "vitest";
import { BALANCE, dailyDoomPressure } from "../src/config/balance.js";
import { WORLDS, THRESHOLDS } from "../src/config/game-data.js";

describe("declarative rules and balance configuration", () => {
  it("separates growth and clearing into distinct opportunities", () => {
    expect(BALANCE.actions.trainingExperience).toBeGreaterThan(
      BALANCE.actions.combatExperience,
    );
    expect(BALANCE.actions.combatExperience).toBeGreaterThan(
      BALANCE.actions.maxStageCombatExperience,
    );
    expect(BALANCE.actions.gatheringResources).toBeGreaterThan(
      BALANCE.actions.combatResources,
    );
    expect(BALANCE.actions.beastSuppressionDoomRelief).toBeGreaterThan(0);
    expect(BALANCE.actions.beastSuppressionDoomRelief).toBeLessThanOrEqual(3);
    expect(BALANCE.actions.beastSuppressionThreatMitigation * 2).toBeLessThanOrEqual(0.2);
  });

  it("keeps the natural world pressure independent from action choice", () => {
    expect(dailyDoomPressure(1, 1)).toBeLessThan(dailyDoomPressure(35, 1));
    expect(dailyDoomPressure(35, 1)).toBeLessThan(dailyDoomPressure(70, 1));
    expect(dailyDoomPressure(10, 1)).toBeLessThan(dailyDoomPressure(10, 2));
    expect(dailyDoomPressure(10, 3)).toBeGreaterThan(0);
  });

  it("maintains a conventional victory route for every world", () => {
    expect(Object.keys(WORLDS)).toEqual(["lingzai", "zombie", "beast"]);
    for (const world of Object.values(WORLDS)) {
      expect(world.finalCost).toBeGreaterThan(0);
      expect(world.stages).toHaveLength(4);
    }
    expect(THRESHOLDS).toEqual([0, 14, 42, 78]);
  });
});
