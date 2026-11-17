import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  createSortie,
  stepSortie,
  advanceSortie,
  chooseSortieSkill,
  retreatSortie,
  DURATION_TICKS,
} from "../src/systems/sortie-sim.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";

function reachSkillChoice(seed = "skill") {
  const battle = createSortie(seed);
  battle.schedule = [];
  for (let i = 0; i < 25 * SORTIE.ticksPerSecond; i++) stepSortie(battle);
  return battle;
}

function defeatAt(battle, id, x = 240, y = 300) {
  battle.nextShotTick = Number.POSITIVE_INFINITY;
  battle.enemies.push({ id, kind: "shade", x, y, hp: 1 });
  battle.shots.push({ x, y, vx: 0, vy: 0, ttl: 10 });
  stepSortie(battle);
}

describe("one-time in-combat power choice", () => {
  it("freezes combat at exactly 25 seconds until a valid skill is chosen", () => {
    const battle = reachSkillChoice();
    expect(battle.tick).toBe(1500);
    expect(battle.skillChoicePending).toBe(true);
    expect(battle.skillOffered).toBe(true);
    const saved = structuredClone(battle);
    stepSortie(battle);
    advanceSortie(battle, { x: 1, y: 0 }, 250);
    expect(battle).toEqual(saved);
    expect(chooseSortieSkill(battle, "sword").ok).toBe(false);
    expect(chooseSortieSkill(battle, "rune").ok).toBe(true);
    expect(battle.runeShield).toBe(1);
    expect(chooseSortieSkill(battle, "thunder").ok).toBe(false);
    stepSortie(battle);
    expect(battle.tick).toBe(1501);
    expect(battle.skillChoicePending).toBe(false);
  });

  it("thunder damages a real target through the normal kill path", () => {
    const battle = reachSkillChoice("thunder");
    expect(chooseSortieSkill(battle, "thunder").ok).toBe(true);
    battle.hero.invulnerable = 5000;
    battle.nextShotTick = Number.POSITIVE_INFINITY;
    battle.enemies.push(
      { id: 101, kind: "wolf", x: 200, y: 224, hp: 1 },
      { id: 102, kind: "wolf", x: 210, y: 224, hp: 1 },
    );
    for (let i = 0; i < 4 * SORTIE.ticksPerSecond; i++) stepSortie(battle);
    expect(battle.thunderHits).toBe(1);
    expect(battle.defeated).toBe(1);
    expect(battle.enemies).toHaveLength(1);
  });

  it("rune immediately blocks one body hit and recharges every ten seconds", () => {
    const battle = reachSkillChoice("rune");
    expect(chooseSortieSkill(battle, "rune").ok).toBe(true);
    battle.nextShotTick = Number.POSITIVE_INFINITY;
    battle.enemies.push({ id: 101, kind: "wolf", x: 160, y: 224, hp: 999 });
    stepSortie(battle);
    expect(battle.hero.hp).toBe(8);
    expect(battle.shieldBlocks).toBe(1);
    expect(battle.runeShield).toBe(0);
    battle.enemies = [];
    for (let i = 0; i < 10 * SORTIE.ticksPerSecond; i++) stepSortie(battle);
    expect(battle.runeShield).toBe(1);
    expect(battle.shieldBlocks).toBe(1);
  });

  it("is deterministic across 30, 60 and 120 Hz even with a skill pause", () => {
    function play(hz) {
      const battle = createSortie("skill-cadence");
      battle.hero.invulnerable = DURATION_TICKS + 10;
      for (let i = 0; i < hz * 40; i++) {
        if (battle.skillChoicePending) chooseSortieSkill(battle, "thunder");
        advanceSortie(battle, { x: 0, y: 0 }, 1000 / hz);
      }
      if (battle.skillChoicePending) chooseSortieSkill(battle, "thunder");
      return { tick: battle.tick, rng: battle.rng, killed: battle.defeated,
        picked: battle.collectedShards, thunderHits: battle.thunderHits,
        skill: battle.skillId, activeEnemies: battle.enemies.length };
    }
    expect(play(30)).toEqual(play(60));
    expect(play(60)).toEqual(play(120));
  });
});

describe("physical fragments and isolated reward preview", () => {
  it("drops one shard per three kills, collects only within 28 pixels", () => {
    const battle = createSortie("drops");
    battle.schedule = [];
    battle.nextShotTick = Number.POSITIVE_INFINITY;
    battle.hero.invulnerable = 1000;
    for (let id = 100; id < 109; id++) defeatAt(battle, id);
    expect(battle.defeated).toBe(9);
    expect(battle.drops).toHaveLength(3);
    expect(battle.collectedShards).toBe(0);
    const uncollected = retreatSortie(battle);
    expect(uncollected.ok).toBe(true);
    expect(previewSortieRewards(battle).shardStones).toBe(0);
    expect(previewSortieRewards(battle).uncollectedShards).toBe(3);
  });

  it("picking up is a real movement-distance decision and cannot duplicate", () => {
    const battle = createSortie("collect");
    battle.schedule = [];
    battle.hero.invulnerable = 1000;
    for (let id = 200; id < 209; id++) defeatAt(battle, id);
    battle.hero.x = 240;
    battle.hero.y = 300;
    stepSortie(battle);
    expect(battle.collectedShards).toBe(3);
    expect(battle.drops).toHaveLength(0);
    for (let i = 0; i < 20; i++) stepSortie(battle);
    expect(battle.collectedShards).toBe(3);
    expect(retreatSortie(battle).ok).toBe(true);
    const preview = previewSortieRewards(battle);
    expect(preview.stones).toBe(1);
    expect(preview.baseStones).toBe(0);
    expect(preview.experience).toBe(0);
    expect(preview.progress).toBe(0);
  });

  it("caps shard-converted stones at two and never invents unpicked rewards", () => {
    const battle = createSortie("cap");
    battle.collectedShards = 7;
    battle.defeated = 21;
    expect(previewSortieRewards(battle)).toBeNull();
    battle.outcome = "won";
    const untouched = structuredClone(battle);
    const first = previewSortieRewards(battle);
    const second = previewSortieRewards(battle);
    expect(first).toEqual(second);
    expect(first.stones).toBe(5);
    expect(first.shardStones).toBe(2);
    expect(first.baseStones).toBe(3);
    expect(first.experience).toBe(2);
    expect(first.progress).toBe(2);
    expect(battle).toEqual(untouched);
    expect(Object.isFrozen(first)).toBe(true);
    expect(retreatSortie(battle).ok).toBe(false);
  });

  it("failed and voluntarily retreated sorties have no base experience or progress", () => {
    const lost = createSortie("lost");
    lost.collectedShards = 4;
    lost.outcome = "lost";
    const result = previewSortieRewards(lost);
    expect(result.stones).toBe(1);
    expect(result.baseStones).toBe(0);
    expect(result.experience).toBe(0);
    expect(result.progress).toBe(0);
    const retreated = createSortie("retreat");
    retreated.collectedShards = 6;
    expect(retreatSortie(retreated).ok).toBe(true);
    const before = retreated.tick;
    stepSortie(retreated);
    expect(retreated.tick).toBe(before);
    expect(previewSortieRewards(retreated).stones).toBe(2);
  });

  it("does not touch the real daily engine or the permanent build slots", () => {
    const battle = reachSkillChoice("isolation");
    chooseSortieSkill(battle, "thunder");
    expect(battle).not.toHaveProperty("worlds");
    expect(battle).not.toHaveProperty("build");
    expect(battle).not.toHaveProperty("resource");
    expect(battle.skillId).toBe("thunder");
  });
});
