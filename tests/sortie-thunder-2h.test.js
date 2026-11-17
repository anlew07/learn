import { describe, expect, it, vi } from "vitest";
import { SORTIE as LIVE_SORTIE } from "../src/config/sortie-data.js";

const CONFIG_MODULE = "../src/config/sortie-data.js";
const BASELINE_SKILLS = Object.freeze({
  ...LIVE_SORTIE.skills,
  thunderCooldownSeconds: 4,
  thunderDamage: 1,
  thunderTargets: 1,
});
const VARIANTS = Object.freeze([
  { name: "2g-control", changes: {} },
  { name: "thunder-cooldown-2s", changes: { thunderCooldownSeconds: 2 } },
  { name: "thunder-damage-2", changes: { thunderDamage: 2 } },
  { name: "thunder-cooldown-1s", changes: { thunderCooldownSeconds: 1 } },
  { name: "thunder-targets-2", changes: { thunderTargets: 2 } },
]);
const FULL_MATRIX = process.env.SORTIE_THUNDER_2H_FULL_MATRIX === "1";

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

describe("2H-A thunder paired-seed balance gate", () => {
  it("preserves the unchanged 2G release configuration until attack value is demonstrated", () => {
    expect(LIVE_SORTIE.skills.thunderCooldownSeconds).toBe(4);
    expect(LIVE_SORTIE.skills.thunderDamage).toBe(1);
    expect(LIVE_SORTIE.skills.thunderTargets).toBe(1);
    expect(LIVE_SORTIE.skills.runeRechargeSeconds).toBe(25);
  });

  it("checks 40 authoritative paired seeds, and optionally all five isolated candidates", async () => {
    const variants = FULL_MATRIX ? VARIANTS : VARIANTS.slice(0, 2);
    let runeBaseline = null;
    for (const variant of variants) {
      vi.resetModules();
      vi.doMock(CONFIG_MODULE, () => ({
        SORTIE: Object.freeze({
          ...LIVE_SORTIE,
          skills: Object.freeze({ ...BASELINE_SKILLS, ...variant.changes }),
        }),
      }));
      const { SORTIE } = await import("../src/config/sortie-data.js");
      const { runSortieExperiment, assertExperimentResult } = await import(
        "../scripts/sortie-experiment.mjs"
      );
      expect(Object.keys(variant.changes).length).toBeLessThanOrEqual(1);
      expect(SORTIE.skills).toEqual({ ...BASELINE_SKILLS, ...variant.changes });
      expect(SORTIE.skills.runeRechargeSeconds).toBe(25);
      const matrix = runSortieExperiment(40);
      expect(assertExperimentResult(matrix)).toBe(true);
      expect(matrix.sorties).toBe(2160);
      const runeGroups = matrix.groups.filter((row) => row.skill === "rune");
      if (runeBaseline === null) runeBaseline = runeGroups;
      else expect(runeGroups).toEqual(runeBaseline);
      console.log(
        "[2H-A-EXPERIMENT] " +
          JSON.stringify({
            variant: variant.name,
            params: {
              thunderCooldownSeconds: SORTIE.skills.thunderCooldownSeconds,
              thunderDamage: SORTIE.skills.thunderDamage,
              thunderTargets: SORTIE.skills.thunderTargets,
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

  it("uses one target, one damage and the configured four-second initial interval", async () => {
    const { createSortie, chooseSortieSkill, stepSortie } = await import(
      "../src/systems/sortie-sim.js"
    );
    const battle = createSortie("2h-thunder-contract");
    battle.schedule = [];
    for (let tick = 0; tick < 25 * LIVE_SORTIE.ticksPerSecond; tick++) {
      stepSortie(battle);
    }
    expect(battle.skillChoicePending).toBe(true);
    expect(chooseSortieSkill(battle, "thunder").ok).toBe(true);
    const cooldownTicks = LIVE_SORTIE.skills.thunderCooldownSeconds * LIVE_SORTIE.ticksPerSecond;
    expect(battle.thunderNextTick).toBe(battle.tick + cooldownTicks);
    battle.hero.invulnerable = 5000;
    battle.nextShotTick = Infinity;
    battle.enemies.push(
      { id: 101, kind: "wolf", x: 190, y: 224, hp: 2 },
      { id: 102, kind: "wolf", x: 200, y: 224, hp: 2 },
    );
    for (let tick = 1; tick < cooldownTicks; tick++) stepSortie(battle);
    expect(battle.thunderHits).toBe(0);
    stepSortie(battle);
    expect(battle.thunderHits).toBe(1);
    expect(battle.defeated).toBe(0);
    expect(battle.enemies.map((enemy) => enemy.hp).sort()).toEqual([1, 2]);
  });
});
