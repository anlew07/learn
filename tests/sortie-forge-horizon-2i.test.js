import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  resourceAtHorizon,
  runForgeHorizonExperiment,
  summarizeForgeHorizonPairs,
} from "../scripts/sortie-forge-horizon-2i.mjs";

const execFileAsync = promisify(execFile);

const battle = (won, defeated = 10) => ({
  won,
  defeated,
  hp: 5,
  damageTaken: 2,
  stones: 3,
  collectedShards: 2,
});
const observation = (resource, won = true) => ({ resource, battle: battle(won) });

describe("2I-C authoritative forge six-sortie horizon", () => {
  it("separates genuine continuation from frozen terminal accounting", () => {
    const first = observation(10);
    const pairs = [{
      danger: 40,
      skill: "rune",
      movement: "kite",
      branches: {
        "no-build": {
          built: false,
          afterBuildResource: 10,
          stages: [first, observation(12), observation(13), null],
        },
        forge: {
          built: true,
          afterBuildResource: 4,
          stages: [first, observation(9), null],
        },
      },
    }];
    const report = summarizeForgeHorizonPairs(pairs, 4);
    expect(resourceAtHorizon(pairs[0].branches.forge, 2)).toBe(9);
    expect(resourceAtHorizon(pairs[0].branches.forge, 4)).toBe(9);
    expect(report.overall[0]).toMatchObject({
      built: 1,
      matched: 1,
      netResourceDeltaMatched: -3,
      paidBackMatched: 0,
    });
    expect(report.overall[1]).toMatchObject({
      controlContinued: 1,
      forgeContinued: 0,
      matched: 0,
      controlOnly: 1,
      netResourceDeltaMatched: null,
      netResourceDeltaFrozenAllBuilt: -4,
    });
    expect(report.overall[2].neither).toBe(1);
    expect(report.payback).toEqual({
      built: 1,
      firstAtSortie: { 2: 0, 3: 0, 4: 0 },
      neverPaidBack: 1,
    });
  });

  it("preserves the construction deduction when sortie two is unavailable", () => {
    const shared = observation(6);
    const pairs = [{
      danger: 0,
      skill: "thunder",
      movement: "stationary",
      branches: {
        "no-build": {
          built: false,
          afterBuildResource: 6,
          stages: [shared, null],
        },
        forge: {
          built: true,
          afterBuildResource: 0,
          stages: [shared, null],
        },
      },
    }];
    expect(resourceAtHorizon(pairs[0].branches.forge, 2)).toBe(0);
    const row = summarizeForgeHorizonPairs(pairs, 2).overall[0];
    expect(row).toMatchObject({
      matched: 0,
      neither: 1,
      netResourceDeltaMatched: null,
      netResourceDeltaFrozenAllBuilt: -6,
    });
    expect(() => summarizeForgeHorizonPairs(pairs, 7)).toThrow();
    expect(() => summarizeForgeHorizonPairs(null)).toThrow();
  });

  it("reuses 2H-C authoritative settlement and real stored forge level", () => {
    const report = runForgeHorizonExperiment(1, 6);
    expect(report.metadata.pairs).toBe(18);
    expect(report.metadata.maxSorties).toBe(6);
    expect(report.metadata.forgeCost).toBe(SORTIE.forge.cost);
    expect(report.metadata.damageWithoutForge).toBe(1);
    expect(report.metadata.damageWithForge).toBe(2);
    expect(report.overall).toHaveLength(5);
    expect(report.byDangerSkill).toHaveLength(30);
    expect(report.byRoute).toHaveLength(18);
    for (const row of report.overall) {
      expect(row.matched + row.controlOnly + row.forgeOnly + row.neither).toBe(row.built);
      expect(row.paidBackMatched).toBeLessThanOrEqual(row.matched);
      expect(row.paidBackFrozenAllBuilt).toBeLessThanOrEqual(row.built);
    }
  }, 120_000);

  it("runs 40 paired seeds across all dangers, skills and routes to sortie six", async () => {
    // A separate process keeps Vitest's RPC loop responsive while its 2H-C
    // regression suite simultaneously runs another full 40-seed matrix.
    const script = new URL("../scripts/sortie-forge-horizon-2i.mjs", import.meta.url).pathname;
    const { stdout } = await execFileAsync(process.execPath, [script, "--seeds=40"], {
      maxBuffer: 1024 * 1024,
      timeout: 600_000,
    });
    const prefix = "FORGE_HORIZON_2I_JSON=";
    const line = stdout.split("\n").find((value) => value.startsWith(prefix));
    expect(line).toBeDefined();
    const report = JSON.parse(line.slice(prefix.length));
    expect(report.metadata.pairs).toBe(720);
    expect(report.overall[0].built).toBe(518);
    expect(report.overall[0].matched).toBe(518);
    expect(report.overall).toHaveLength(5);
    expect(report.payback.built).toBe(518);
    expect(
      Object.values(report.payback.firstAtSortie).reduce((sum, value) => sum + value, 0) +
        report.payback.neverPaidBack,
    ).toBe(518);
    for (const row of report.overall) {
      expect(row.matched + row.controlOnly + row.forgeOnly + row.neither).toBe(518);
      expect(row.netResourceDeltaFrozenAllBuilt).not.toBeNull();
    }
    console.log("FORGE_HORIZON_2I_JSON=" + JSON.stringify(report));
  }, 600_000);
});
