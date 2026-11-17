import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  createSortie,
  retreatSortie,
  stepSortie,
} from "../src/systems/sortie-sim.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";

function isolatedBattle(seed) {
  const battle = createSortie(seed);
  battle.schedule = [];
  battle.nextShotTick = Infinity;
  return battle;
}

describe("2H-B physical fragment pickup", () => {
  it("requires actual sprite contact instead of remote 28px magnet reach", () => {
    const battle = isolatedBattle("2h-radius");
    const contactRadius = Math.min(
      SORTIE.rewards.pickupRadius,
      SORTIE.player.radius + 5,
    );
    expect(contactRadius).toBe(16);
    battle.drops.push({ id: 101, x: 190, y: 224 });
    battle.hero.x = 190 - contactRadius - 0.01;
    stepSortie(battle);
    expect(battle.collectedShards).toBe(0);
    expect(battle.drops).toHaveLength(1);

    battle.hero.x = 190 - contactRadius;
    stepSortie(battle);
    expect(battle.collectedShards).toBe(1);
    expect(battle.drops).toHaveLength(0);
    for (let i = 0; i < 10; i++) stepSortie(battle);
    expect(battle.collectedShards).toBe(1);
  });

  it("exposes a pursuing player to existing enemy body collision", () => {
    const chase = (threat) => {
      const battle = isolatedBattle("2h-body");
      battle.drops.push({ id: 701, x: 190, y: 224 });
      if (threat) {
        battle.enemies.push({
          id: 702,
          kind: "wolf",
          x: 190,
          y: 224,
          hp: 999,
        });
      }
      for (let i = 0; i < 30 && !battle.collectedShards; i++) {
        stepSortie(battle, { x: 1, y: 0 });
      }
      return battle;
    };
    const safe = chase(false);
    const exposed = chase(true);
    expect(safe.collectedShards).toBe(1);
    expect(exposed.collectedShards).toBe(1);
    expect(safe.hurt).toBe(0);
    expect(exposed.hurt).toBeGreaterThan(0);
    expect(exposed.hero.hp).toBeLessThan(safe.hero.hp);
  });

  it("lets an existing hostile projectile threaten the shard location", () => {
    const battle = isolatedBattle("2h-projectile");
    battle.drops.push({ id: 701, x: 190, y: 224 });
    battle.hostileShots.push({
      x: 190,
      y: 224,
      vx: 0,
      vy: 0,
      ttl: 60,
    });
    for (let i = 0; i < 30 && !battle.collectedShards; i++) {
      stepSortie(battle, { x: 1, y: 0 });
    }
    expect(battle.collectedShards).toBe(1);
    expect(battle.hurt).toBe(1);
    expect(battle.hostileShots).toHaveLength(0);
  });

  it("respects pause, one-shot pickup, reward cap and isolated battle data", () => {
    const battle = isolatedBattle("2h-cap");
    battle.drops = Array.from({ length: 9 }, (_, id) => ({
      id: id + 100,
      x: battle.hero.x,
      y: battle.hero.y,
    }));
    battle.skillChoicePending = true;
    stepSortie(battle);
    expect(battle.collectedShards).toBe(0);
    battle.skillChoicePending = false;
    stepSortie(battle);
    expect(battle.collectedShards).toBe(9);
    expect(battle.drops).toHaveLength(0);
    stepSortie(battle);
    expect(battle.collectedShards).toBe(9);
    expect(retreatSortie(battle).ok).toBe(true);
    const before = structuredClone(battle);
    const rewards = previewSortieRewards(battle);
    expect(rewards.shardStones).toBe(SORTIE.rewards.maxShardStones);
    expect(rewards.stones).toBe(2);
    expect(battle).toEqual(before);
    expect(battle).not.toHaveProperty("run");
    expect(battle).not.toHaveProperty("profile");
  });
});
