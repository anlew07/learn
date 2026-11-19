import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  assertForgeSalvageExperiment,
  pairedForgeSalvageRun,
  runForgeSalvageExperiment,
} from "../scripts/sortie-forge-salvage-2n.mjs";

describe("2N genuine forge cost vs physical salvage", () => {
  it("compares the same first-day settlement and real second-day receipts", () => {
    const sample = runForgeSalvageExperiment(1);
    expect(assertForgeSalvageExperiment(sample)).toBe(true);
    expect(sample.pairs).toHaveLength(3 * 2 * 4);
    expect(sample.metadata.firstMission).toBe("safe");
    expect(sample.metadata.secondMission).toBe("salvage");
    expect(sample.metadata.forgeCost).toBe(6);
    expect(sample.metadata.forgedDamage).toBe(2);
    expect(sample.overall.matched).toBe(sample.overall.eligible);
    expect(sample.overall.matched).toBeGreaterThan(0);
    for (const pair of sample.pairs) {
      expect(pair.first.missionId).toBe("safe");
      expect(pair.first.day).toBe(1);
      if (!pair.eligible) {
        expect(pair.control).toBeNull();
        expect(pair.forged).toBeNull();
      } else {
        expect(pair.firstResource).toBeGreaterThanOrEqual(SORTIE.forge.cost);
        expect(pair.control.day).toBe(2);
        expect(pair.forged.day).toBe(2);
        expect(pair.control.weaponDamage).toBe(1);
        expect(pair.forged.weaponDamage).toBe(2);
        for (const result of [pair.control, pair.forged]) {
          expect(result.objectiveStones).toBe(
            result.won && result.completed ? SORTIE.mission.rewardStones : 0);
        }
      }
    }
  }, 120_000);

  it("rejects invalid or out-of-scope cohorts", () => {
    expect(() => runForgeSalvageExperiment(0)).toThrow();
    expect(() => runForgeSalvageExperiment(41)).toThrow();
    expect(() => runForgeSalvageExperiment(2.5)).toThrow();
    expect(() => pairedForgeSalvageRun(-1, 0, "rune", "target")).toThrow();
    expect(() => pairedForgeSalvageRun(0, 30, "rune", "target")).toThrow();
    expect(() => pairedForgeSalvageRun(0, 0, "invalid", "target")).toThrow();
    expect(() => pairedForgeSalvageRun(0, 0, "rune", "invalid")).toThrow();
  });

  it("reports all 40 fixed seeds without hiding unaffordable builds or lost rewards", () => {
    const report = runForgeSalvageExperiment(40);
    expect(assertForgeSalvageExperiment(report)).toBe(true);
    expect(report.pairs).toHaveLength(960);
    expect(report.byDanger).toHaveLength(3);
    expect(report.byDangerSkill).toHaveLength(6);
    expect(report.byRoute).toHaveLength(4);
    for (const row of [...report.byDanger, ...report.byDangerSkill, ...report.byRoute]) {
      expect(row.matched).toBe(row.eligible);
      expect(row.paidBack).toBeLessThanOrEqual(row.matched);
      expect(row.forgeObjectivePaid).toBeLessThanOrEqual(row.forgeObjectiveCompleted);
      expect(row.controlObjectivePaid).toBeLessThanOrEqual(row.controlObjectiveCompleted);
      expect(row.forgeObjectivePaid).toBeLessThanOrEqual(row.forgeWins);
      expect(row.controlObjectivePaid).toBeLessThanOrEqual(row.controlWins);
    }
    // The numeric record is emitted by THIS actual authoritative replay in CI.
    // Do not fill documentation with hypothetical or inferred performance values.
    console.log("FORGE_SALVAGE_2N_JSON=" + JSON.stringify({
      metadata: report.metadata,
      overall: report.overall,
      byDanger: report.byDanger,
      byDangerSkill: report.byDangerSkill,
      byRoute: report.byRoute,
    }));
  }, 480_000);
});
