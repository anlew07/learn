import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  RADII,
  ROUTES,
  assertPickupTradeoff,
  loadRadiusEngine,
  pickupRouteInput,
  runPickupTradeoff,
} from "../scripts/sortie-pickup-tradeoff-2i.mjs";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";

describe("2I-B pickup radius and touch tolerance", () => {
  it("keeps production pickup at 28px until a candidate is approved", () => {
    expect(SORTIE.rewards.pickupRadius).toBe(28);
    expect(RADII).toEqual([28, 24, 20, 16]);
    expect(ROUTES).toContain("short-reverse");
    expect(ROUTES).toContain("drift");
  });

  it.each(RADII)("collects only within the exact %ipx radius", async (radius) => {
    const engine = await loadRadiusEngine(radius);
    const battle = engine.createSortie("2i-radius-" + radius);
    battle.schedule = [];
    battle.nextShotTick = Infinity;
    battle.drops.push({ id: 91, x: 190, y: 224 });
    battle.hero.x = 190 - radius - 0.01;
    engine.stepSortie(battle);
    expect(battle.collectedShards).toBe(0);
    expect(battle.drops).toHaveLength(1);
    battle.hero.x = 190 - radius;
    engine.stepSortie(battle);
    expect(battle.collectedShards).toBe(1);
    expect(battle.drops).toHaveLength(0);
    engine.stepSortie(battle);
    expect(battle.collectedShards).toBe(1);
  });

  it("short reverse and joystick drift alter directions but never invent damage", async () => {
    const engine = await loadRadiusEngine(24);
    const battle = engine.createSortie("2i-input");
    battle.tick = 120;
    const original = pickupRouteInput(battle, "pickup");
    const opposite = pickupRouteInput(battle, "short-reverse");
    expect(opposite.x).toBeCloseTo(-original.x);
    expect(opposite.y).toBeCloseTo(-original.y);
    const drift = pickupRouteInput(battle, "drift");
    expect(Math.hypot(drift.x, drift.y)).toBeCloseTo(Math.hypot(original.x, original.y));
    expect(drift.x).not.toBeCloseTo(original.x);
    expect(battle.hurt).toBe(0);
    expect(battle.hero.hp).toBe(SORTIE.player.hp);
  });

  it("keeps pause, no duplicate pickups, reward cap, and ephemeral battle isolation", async () => {
    const engine = await loadRadiusEngine(20);
    const battle = engine.createSortie("2i-reward");
    battle.schedule = [];
    battle.nextShotTick = Infinity;
    battle.drops = Array.from({ length: 9 }, (_, id) => ({
      id: id + 100,
      x: battle.hero.x,
      y: battle.hero.y,
    }));
    battle.skillChoicePending = true;
    engine.stepSortie(battle);
    expect(battle.collectedShards).toBe(0);
    battle.skillChoicePending = false;
    engine.stepSortie(battle);
    engine.stepSortie(battle);
    expect(battle.collectedShards).toBe(9);
    expect(battle.drops).toHaveLength(0);
    const result = engine.retreatSortie(battle);
    expect(result.ok).toBe(true);
    const original = structuredClone(battle);
    expect(previewSortieRewards(battle).shardStones).toBe(2);
    expect(battle).toEqual(original);
    expect(battle).not.toHaveProperty("run");
    expect(battle).not.toHaveProperty("profile");
  });

  it("runs both forge/no-forge matrix smoke groups with fixed seed and invariants", async () => {
    const result = await runPickupTradeoff({ seedCount: 1, forgeLevels: [0, 1] });
    expect(result.sorties).toBe(4 * 2 * 3 * 2 * 5);
    expect(result.rows).toHaveLength(4 * 2 * 3 * 2 * 5);
    expect(assertPickupTradeoff(result)).toBe(true);
  });
});
