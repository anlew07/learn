import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import { makeTempoVariant, runForgeTempoExperiment } from "../scripts/sortie-forge-tempo-2j.mjs";

const execFileAsync = promisify(execFile);

describe("2J-C forge-only 0.63-second attack tempo", () => {
  it("changes only forge config and ordinary fire in a disposable copy", async () => {
    const config = await readFile(new URL("../src/config/sortie-data.js", import.meta.url), "utf8");
    const sim = await readFile(new URL("../src/systems/sortie-sim.js", import.meta.url), "utf8");
    const variant = makeTempoVariant(config, sim);
    expect(SORTIE.forge.cost).toBe(6);
    expect(SORTIE.weapon.cooldownSeconds).toBe(0.7);
    expect(SORTIE.rewards.pickupRadius).toBe(28);
    expect(variant.config).toContain("attackCooldownSeconds: 0.63");
    expect(variant.sim).toContain("battle.forgeLevel > 0");
    expect(variant.sim).not.toBe(sim);
    expect(() => makeTempoVariant(variant.config, variant.sim)).toThrow();
  });

  it("uses the real building and double-world settlement path on a small sample", async () => {
    const result = await runForgeTempoExperiment(1);
    expect(result.metadata.pairs).toBe(18);
    expect(result.metadata.realBuildCost).toBe(6);
    expect(result.firingTicks.baseline.noBuild).toEqual([1, 43, 85]);
    expect(result.firingTicks.baseline.built).toEqual([1, 43, 85]);
    expect(result.firingTicks.candidate.noBuild).toEqual([1, 43, 85]);
    expect(result.firingTicks.candidate.built).toEqual([1, 39, 77]);
    expect(result.comparison.overall).toHaveLength(5);
    for (const row of result.comparison.overall) {
      expect(row.matched).toBeLessThanOrEqual(row.built);
      expect(row.noBuildContinued).toBeLessThanOrEqual(row.built);
    }
  }, 120_000);

  it("executes 40 fixed seeds for both versions through sortie six", async () => {
    const script = new URL("../scripts/sortie-forge-tempo-2j.mjs", import.meta.url).pathname;
    const { stdout } = await execFileAsync(process.execPath, [script, "--seeds=40"], {
      maxBuffer: 1024 * 1024,
      timeout: 840_000,
    });
    const prefix = "FORGE_TEMPO_2J_JSON=";
    const line = stdout.split("\n").find((item) => item.startsWith(prefix));
    expect(line).toBeDefined();
    const report = JSON.parse(line.slice(prefix.length));
    expect(report.metadata.pairs).toBe(720);
    expect(report.metadata.genuineBuilt).toBe(518);
    expect(report.comparison.overall.map((item) => item.sortie)).toEqual([2, 3, 4, 5, 6]);
    for (const row of report.comparison.overall) {
      expect(row.built).toBe(518);
      expect(row.matched).toBeLessThanOrEqual(518);
    }
    expect(report.comparison.overall[4].baseline.netResource).toBeCloseTo(-6.618, 3);
    expect(report.firingTicks.candidate.built).toEqual([1, 39, 77]);
    expect(report.firstPayback.candidate.built).toBe(518);
    console.log("FORGE_TEMPO_2J_JSON=" + JSON.stringify(report));
  }, 850_000);
});
