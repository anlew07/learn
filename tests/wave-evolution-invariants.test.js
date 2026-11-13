import { describe, expect, it } from "vitest";
import { POWERS } from "../src/config/game-data.js";
import { simulateSurvivorWaves } from "../src/systems/survivor-waves.js";
import { computeWaveBonuses } from "../src/systems/wave-combat.js";
import { evolvedWaveUltimate } from "../src/systems/attack-patterns.js";

describe("evolution and elite counter integrity", () => {
  for (const id of ["lingzai", "zombie", "beast"]) {
    it(id + ": cannot forge ultimate performance with an evolved flag alone", () => {
      const empty = { attack: [], support: [], evolved: false };
      const forged = { ...empty, evolved: true, evolutionName: "forged" };
      const context = { day: 35, level: 3, momentum: 1 };

      expect(evolvedWaveUltimate(id, forged, 3)).toBe(null);
      expect(simulateSurvivorWaves(id, forged, POWERS, context)).toEqual(
        simulateSurvivorWaves(id, empty, POWERS, context),
      );
      expect(computeWaveBonuses(id, forged, POWERS).evolution).toBe("");
      expect(simulateSurvivorWaves(id, forged, POWERS, context).burst).toBe(false);
    });
  }

  it("beast claws and instinct unlock real elite counters, not free currency", () => {
    const base = {
      attack: [{ id: "claws", lv: 2 }],
      support: [{ id: "instinct", lv: 1 }],
      evolved: false,
    };
    const evolved = { ...base, evolved: true, evolutionName: "协同守护" };
    const context = { day: 35, level: 3, momentum: 2 };
    const before = simulateSurvivorWaves("beast", base, POWERS, context);
    const after = simulateSurvivorWaves("beast", evolved, POWERS, context);

    expect(after.waves).toHaveLength(3);
    expect(after.waves[1].trait.id).toBe("armored");
    expect(after.waves[1].trait.countered).toBe(true);
    expect(after.waves[2].trait.id).toBe("swift");
    expect(after.waves[2].trait.countered).toBe(true);
    expect(after.waves.every((wave) => wave.attack.ultimate)).toBe(true);
    expect(after.defeated).toBeGreaterThan(before.defeated);
    const bonus = computeWaveBonuses("beast", evolved, POWERS, after);
    expect(bonus.resource).toBeLessThanOrEqual(0.5);
    expect(bonus.xp).toBeLessThanOrEqual(0.75);
    expect(bonus.doomReduction).toBeLessThanOrEqual(0.25);
  });
});
