import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  assertForgeRoiExperiment,
  priceOnlyAccountingDelta,
  runForgeRoiExperiment,
} from "../scripts/sortie-forge-roi-2h.mjs";

describe("2H-C authoritative forge ROI experiment", () => {
  it("uses actual one-time construction and authoritative battle settlement", () => {
    const report = runForgeRoiExperiment(1, 3);
    expect(assertForgeRoiExperiment(report)).toBe(true);
    expect(report.pairs).toHaveLength(18);
    expect(report.metadata.forgeCost).toBe(6);
    expect(report.metadata.damageWithoutForge).toBe(1);
    expect(report.metadata.damageWithForge).toBe(2);
    expect(SORTIE.skills.runeRechargeSeconds).toBe(25);

    for (const pair of report.pairs) {
      const built = pair.branches.forge;
      const control = pair.branches["no-build"];
      expect(built.stages[0]).toEqual(control.stages[0]);
      expect(control.built).toBe(false);
      if (built.built) {
        expect(built.afterBuildResource).toBeCloseTo(pair.firstResource - 6);
        expect(built.stages[1]?.battle.weaponDamage).toBe(2);
        expect(control.stages[1]?.battle.weaponDamage).toBe(1);
      }
    }
  }, 120_000);

  it("rejects bad matrix parameters and does not treat accounting as a real replay", () => {
    expect(() => runForgeRoiExperiment(0)).toThrow();
    expect(() => runForgeRoiExperiment(1, 1)).toThrow();
    expect(() => runForgeRoiExperiment(1, 7)).toThrow();
    expect(priceOnlyAccountingDelta(-6, 6)).toBe(-6);
    expect(priceOnlyAccountingDelta(-6, 4)).toBe(-4);
    expect(priceOnlyAccountingDelta(-2, 4)).toBe(0);
    expect(() => priceOnlyAccountingDelta(Number.NaN, 4)).toThrow();
    expect(() => priceOnlyAccountingDelta(0, -1)).toThrow();
  });

  it("reproduces all 40 paired seeds across dangers, skills and routes through day four", () => {
    const report = runForgeRoiExperiment(40, 4);
    expect(assertForgeRoiExperiment(report)).toBe(true);
    expect(report.pairs).toHaveLength(720);
    expect(report.overall).toHaveLength(3);
    expect(report.byDangerSkill).toHaveLength(18);
    expect(report.byRoute).toHaveLength(54);
    for (const horizon of report.overall) {
      expect(horizon.n).toBe(720);
      expect(horizon.built).toBe(horizon.eligible);
      expect(horizon.matched).toBeLessThanOrEqual(horizon.built);
      expect(horizon.paidBack).toBeLessThanOrEqual(horizon.matched);
    }
    for (const row of report.byRoute) {
      expect(row.n).toBe(40);
      expect(row.matched).toBeLessThanOrEqual(row.built);
    }
    // CI logs are the source of the numerical report; no unverified values.
    console.log("FORGE_ROI_2H_JSON=" + JSON.stringify({
      metadata: report.metadata,
      overall: report.overall,
      byDangerSkill: report.byDangerSkill,
      byRoute: report.byRoute,
    }));
  }, 300_000);
});
