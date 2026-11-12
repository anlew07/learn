import { describe, expect, it } from "vitest";
import { POWERS } from "../src/config/game-data.js";
import { computeWaveBonuses, WAVE_STAGES } from "../src/systems/wave-combat.js";

const build = (worldId, evolved = false) => ({
  attack: [ { id: { lingzai: "thunder", zombie: "blades", beast: "claws" }[worldId], lv: 2 }],
  support: [ { id: { lingzai: "rune", zombie: "armor", beast: "instinct" }[worldId], lv: 1 }],
  evolved, evolutionName: evolved ? "组合进化" : "",
});

describe("bounded wave combat and meaningful evolution", () => {
  for (const worldId of ["lingzai", "zombie", "beast"]) {
    it(`${worldId}: evolution improves one bounded effect`, () => {
      const before = computeWaveBonuses(worldId, build(worldId), POWERS);
      const after = computeWaveBonuses(worldId, build(worldId, true), POWERS);
      expect(after.xp >= before.xp).toBe(true);
      expect(after.resource >= before.resource).toBe(true);
      expect(after.doomReduction >= before.doomReduction).toBe(true);
      expect([after.xp > before.xp, after.resource > before.resource, after.doomReduction > before.doomReduction].some(Boolean)).toBe(true);
      expect(after.xp).toBeLessThanOrEqual(0.75);
      expect(after.resource).toBeLessThanOrEqual(0.5);
      expect(after.doomReduction).toBeLessThanOrEqual(0.25);
      expect(after.stages).toHaveLength(3);
      expect(after.evolution).toBe("组合进化");
    });
  }

  it("does not invent skills when no build is equipped", () => {
    const bonus = computeWaveBonuses("zombie", { attack: [], support: [], evolved: false }, POWERS);
    expect(bonus.xp).toBe(0);
    expect(bonus.resource).toBe(0);
    expect(bonus.doomReduction).toBe(0);
    expect(bonus.skills).toHaveLength(0);
    expect(WAVE_STAGES.zombie).toHaveLength(3);
  });
});
