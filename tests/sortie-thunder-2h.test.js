import { describe, expect, it, vi } from "vitest";
import { SORTIE as BASE_SORTIE } from "../src/config/sortie-data.js";

const CONFIG_MODULE = "../src/config/sortie-data.js";
const VARIANTS = Object.freeze([
  { name: "2g-control", changes: {} },
  { name: "thunder-cooldown-1s", changes: { thunderCooldownSeconds: 1 } },
  { name: "thunder-targets-2", changes: { thunderTargets: 2 } },
]);

function round(value) {
  return Math.round(value * 100) / 100;
}

function compact(group) {
  return {
    d: group.danger,
    build: group.buildMode,
    skill: group.skill,
    move: group.movement,
    wins: group.secondWins,
    runs: group.secondRuns,
    kills: round(group.kills),
    hp: round(group.hp),
    hurt: round(group.damage),
    shards: round(group.shards),
    stones: round(group.stones),
    hits: round(group.thunderHits),
    blocks: round(group.shieldBlocks),
    resource: round(group.endResource),
  };
}

describe("2H-A isolated thunder single-variable paired-seed experiment", () => {
  it("reports the exact 40-seed authoritative matrix for control and one-parameter candidates", async () => {
    expect(BASE_SORTIE.skills.runeRechargeSeconds).toBe(25);
    expect(BASE_SORTIE.skills.thunderCooldownSeconds).toBe(4);
    expect(BASE_SORTIE.skills.thunderDamage).toBe(1);
    for (const variant of VARIANTS) {
      vi.resetModules();
      vi.doMock(CONFIG_MODULE, () => ({
        SORTIE: Object.freeze({
          ...BASE_SORTIE,
          skills: Object.freeze({ ...BASE_SORTIE.skills, ...variant.changes }),
        }),
      }));
      const { SORTIE } = await import("../src/config/sortie-data.js");
      const { runSortieExperiment, assertExperimentResult } = await import(
        "../scripts/sortie-experiment.mjs"
      );
      const changed = Object.keys(variant.changes);
      expect(changed.length).toBeLessThanOrEqual(1);
      expect(SORTIE.skills.runeRechargeSeconds).toBe(25);
      expect(SORTIE.skills).toEqual({ ...BASE_SORTIE.skills, ...variant.changes });
      const matrix = runSortieExperiment(40);
      expect(assertExperimentResult(matrix)).toBe(true);
      expect(matrix.sorties).toBe(2160);
      console.log(
        "[2H-A-EXPERIMENT] " +
          JSON.stringify({
            variant: variant.name,
            params: {
              thunderCooldownSeconds: SORTIE.skills.thunderCooldownSeconds,
              thunderDamage: SORTIE.skills.thunderDamage,
              runeRechargeSeconds: SORTIE.skills.runeRechargeSeconds,
            },
            noBuild: matrix.groups.filter((row) => row.buildMode === "no-build").map(compact),
            forge: matrix.groups.filter((row) => row.buildMode === "forge").map(compact),
          }),
      );
    }
    vi.doUnmock(CONFIG_MODULE);
    vi.resetModules();
  }, 600_000);
});
