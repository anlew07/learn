import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  chooseSortieSkill,
  createSortie,
  stepSortie,
} from "../src/systems/sortie-sim.js";
import { runThunderValueExperiment } from "../scripts/sortie-thunder-value-2i.mjs";

describe("2I-A thunder: reproducible offensive-value experiment", () => {
  it("keeps the shared 2G skill and economy contract", () => {
    expect(SORTIE.skills.thunderCooldownSeconds).toBe(4);
    expect(SORTIE.skills.thunderDamage).toBe(1);
    expect(SORTIE.skills.thunderTargets).toBe(1);
    expect(SORTIE.skills.runeRechargeSeconds).toBe(25);
    expect(SORTIE.rewards.pickupRadius).toBe(28);
  });

  it("retains the four-second first trigger and one-target damage", () => {
    const battle = createSortie("2i-thunder-target-contract");
    battle.schedule = [];
    for (let i = 0; i < 25 * SORTIE.ticksPerSecond; i++) stepSortie(battle);
    expect(chooseSortieSkill(battle, "thunder").ok).toBe(true);
    battle.hero.invulnerable = Infinity;
    battle.nextShotTick = Infinity;
    battle.enemies.push(
      { id: 101, kind: "wolf", x: 180, y: 224, hp: 2 },
      { id: 102, kind: "shade", x: 190, y: 224, hp: 1 },
    );
    const delay = 4 * SORTIE.ticksPerSecond;
    for (let i = 0; i < delay - 1; i++) stepSortie(battle);
    expect(battle.thunderHits).toBe(0);
    stepSortie(battle);
    expect(battle.thunderHits).toBe(1);
    expect(battle.defeated).toBeLessThanOrEqual(1);
  });

  it("runs forty paired seeds and reports timing/threat plus authoritative settlement", () => {
    const report = runThunderValueExperiment(40);
    expect(report.authoritativeSorties).toBe(2160);
    expect(report.instrumentedFirstSorties).toBe(960);
    expect(report.second).toHaveLength(36);
    expect(report.diagnostics).toHaveLength(24);
    for (const group of report.diagnostics) {
      expect(group.wins).toBeGreaterThanOrEqual(0);
      expect(group.wins).toBeLessThanOrEqual(40);
      expect(group.hurt).toBeGreaterThanOrEqual(0);
    }
    console.log("THUNDER_VALUE_2I_JSON=" + JSON.stringify(report));
  }, 600_000);
});
