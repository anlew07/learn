import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  assertTimedRecoveryMatrix,
  playTimedRecoveryRun,
  runTimedRecoveryMatrix,
  TIMED_APPROACH_ROUTES,
  TIMED_APPROACH_SECONDS,
} from "../scripts/sortie-recovery-timing-2o.mjs";

describe("2O timed salvage: physical approach choices", () => {
  it("uses existing mission bounds and checks true authority receipts", () => {
    expect(SORTIE.mission.appearsAtSeconds).toBe(10);
    expect(SORTIE.mission.expiresAtSeconds).toBe(65);
    expect(SORTIE.mission.collectSeconds).toBe(1);
    expect(SORTIE.mission.collectRadius).toBe(26);
    expect(SORTIE.mission.rewardStones).toBe(2);
    expect(TIMED_APPROACH_SECONDS).toEqual([10, 30, 50, 62]);
    expect(TIMED_APPROACH_ROUTES).toEqual(["direct", "reverse", "drift"]);

    const sample = runTimedRecoveryMatrix(1);
    expect(assertTimedRecoveryMatrix(sample)).toBe(true);
    expect(sample.metadata.trials).toBe(72);
    expect(sample.byDangerTiming).toHaveLength(12);
    expect(sample.byRouteTiming).toHaveLength(12);
    expect(sample.contrasts).toHaveLength(3);
    for (const row of sample.rows) {
      expect(row.objectiveStones).toBe(row.paid * 2);
      expect(row.paid).toBeLessThanOrEqual(row.won);
      expect(row.paid).toBeLessThanOrEqual(row.completed);
      expect(row.shardStones).toBeLessThanOrEqual(2);
      if (row.completed) {
        expect(row.firstContact).not.toBeNull();
        expect(row.completion).toBeGreaterThanOrEqual(row.firstContact);
        expect(row.completion).toBeLessThan(65);
      }
    }
  }, 120_000);

  it("refuses invalid seeds, timings, danger and error patterns", () => {
    expect(() => runTimedRecoveryMatrix(0)).toThrow();
    expect(() => runTimedRecoveryMatrix(41)).toThrow();
    expect(() => runTimedRecoveryMatrix(1.5)).toThrow();
    expect(() => playTimedRecoveryRun(-1, 0, "rune", "direct", 10)).toThrow();
    expect(() => playTimedRecoveryRun(40, 0, "rune", "direct", 10)).toThrow();
    expect(() => playTimedRecoveryRun(0, 20, "rune", "direct", 10)).toThrow();
    expect(() => playTimedRecoveryRun(0, 0, "invalid", "direct", 10)).toThrow();
    expect(() => playTimedRecoveryRun(0, 0, "rune", "wrong", 10)).toThrow();
    expect(() => playTimedRecoveryRun(0, 0, "rune", "direct", 20)).toThrow();
  });

  it("reports all 40 paired seeds and does not call proximity a mission success", () => {
    const report = runTimedRecoveryMatrix(40);
    expect(assertTimedRecoveryMatrix(report)).toBe(true);
    expect(report.rows).toHaveLength(2880);
    expect(report.byTiming.map((row) => row.n)).toEqual([720, 720, 720, 720]);
    expect(report.contrasts.map((row) => row.n)).toEqual([720, 720, 720]);
    for (const group of [
      ...report.byTiming, ...report.byDangerTiming, ...report.byRouteTiming,
    ]) {
      expect(group.paid).toBeLessThanOrEqual(group.objectives);
      expect(group.paid).toBeLessThanOrEqual(group.wins);
      expect(group.prematureContacts).toBeLessThanOrEqual(group.n);
      expect(group.prematureGuards).toBeLessThanOrEqual(group.n);
    }
    // CI emits actual production-physics and Engine-replayed outcomes; no
    // estimates or hypothetical reward arithmetic should enter the report.
    console.log("RECOVERY_TIMING_2O_JSON=" + JSON.stringify({
      metadata: report.metadata,
      overall: report.overall,
      byTiming: report.byTiming,
      byDangerTiming: report.byDangerTiming,
      byRouteTiming: report.byRouteTiming,
      contrasts: report.contrasts,
      highDangerContrasts: report.highDangerContrasts,
    }));
  }, 480_000);
});
