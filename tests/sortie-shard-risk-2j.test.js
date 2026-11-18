import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";
import {
  CANDIDATE,
  PICKUP_RADIUS,
  assertShardRisk,
  loadShardRiskEngine,
  runShardRisk,
} from "../scripts/sortie-shard-risk-2j.mjs";

const execFileAsync = promisify(execFile);

function createThreeDefeats(engine, withLivingEnemy) {
  const battle = engine.createSortie("2j-shards-physical");
  battle.schedule = [];
  battle.nextShotTick = Infinity;
  battle.hero.invulnerable = 1000;
  if (withLivingEnemy) {
    battle.enemies.push({
      id: 900,
      kind: "wolf",
      x: 290,
      y: 224,
      hp: 999,
    });
  }
  for (let id = 100; id < 103; id++) {
    battle.enemies.push({
      id,
      kind: "shade",
      x: 240,
      y: 224,
      hp: 1,
    });
    battle.shots.push({ x: 240, y: 224, vx: 0, vy: 0, ttl: 2 });
    engine.stepSortie(battle);
  }
  return battle;
}

describe("2J-B shard-drop spatial risk (rejected candidate)", () => {
  it("preserves 28px pickup tolerance, existing reward cap and base rule", () => {
    expect(PICKUP_RADIUS).toBe(28);
    expect(SORTIE.rewards.pickupRadius).toBe(28);
    expect(SORTIE.rewards.maxShardStones).toBe(2);
    expect(SORTIE.rewards.defeatedPerShard).toBe(3);
    expect(CANDIDATE).toBe("drift-to-living-enemy-48px");
  });

  it("only drifts toward an existing living enemy, never changes shard quantity", async () => {
    const [base, trial] = await Promise.all([
      loadShardRiskEngine(false),
      loadShardRiskEngine(true),
    ]);
    const original = createThreeDefeats(base, true);
    const candidate = createThreeDefeats(trial, true);
    expect(original.defeated).toBe(3);
    expect(candidate.defeated).toBe(3);
    expect(original.drops).toHaveLength(1);
    expect(candidate.drops).toHaveLength(1);
    expect(original.shardTrace).toHaveLength(1);
    expect(candidate.shardTrace).toHaveLength(1);
    expect(original.drops[0].x).toBeCloseTo(original.shardTrace[0].originX);
    expect(candidate.drops[0].x).toBeGreaterThan(original.drops[0].x);
    expect(candidate.shardTrace[0].enemyDistance).toBeLessThan(
      original.shardTrace[0].enemyDistance,
    );
    expect(
      Math.hypot(
        candidate.drops[0].x - candidate.shardTrace[0].originX,
        candidate.drops[0].y - candidate.shardTrace[0].originY,
      ),
    ).toBeLessThanOrEqual(48);
    const isolated = createThreeDefeats(trial, false);
    expect(isolated.drops[0].x).toBeCloseTo(isolated.shardTrace[0].originX);
    expect(isolated.drops[0].y).toBeCloseTo(isolated.shardTrace[0].originY);
  });

  it("keeps pickup paused, exactly once, and settlement preview read-only", async () => {
    const engine = await loadShardRiskEngine(true);
    const battle = createThreeDefeats(engine, false);
    const drop = battle.drops[0];
    battle.hero.x = drop.x - PICKUP_RADIUS - 0.01;
    battle.hero.y = drop.y;
    battle.skillChoicePending = true;
    engine.stepSortie(battle);
    expect(battle.collectedShards).toBe(0);
    battle.skillChoicePending = false;
    engine.stepSortie(battle);
    expect(battle.collectedShards).toBe(0);
    battle.hero.x = drop.x;
    engine.stepSortie(battle);
    engine.stepSortie(battle);
    expect(battle.collectedShards).toBe(1);
    expect(battle.drops).toHaveLength(0);
    expect(battle.shardTrace).toHaveLength(1);
    expect(engine.retreatSortie(battle).ok).toBe(true);
    const before = structuredClone(battle);
    expect(previewSortieRewards(battle).collectedShards).toBe(1);
    expect(previewSortieRewards(battle).shardStones).toBe(0);
    expect(battle).toEqual(before);
    expect(battle).not.toHaveProperty("run");
    expect(battle).not.toHaveProperty("profile");
  });

  it("has paired-route conservation with a one-seed smoke test", async () => {
    const result = await runShardRisk({ seedCount: 1 });
    expect(result.pairs).toBe(30);
    expect(result.sorties).toBe(60);
    expect(result.spatial.baseline.spawned).toBeGreaterThan(0);
    expect(result.spatial.candidate.spawned).toBeGreaterThan(0);
    expect(assertShardRisk(result)).toBe(true);
  });

  it(
    "replays the full 40-seed x 3D x 2 skills x 5 routes paired matrix",
    async () => {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["scripts/sortie-shard-risk-2j.mjs", "--seeds=40", "--assert"],
        { timeout: 180000, maxBuffer: 1_000_000 },
      );
      expect(stdout).toContain("1200 paired battles / 2400 fixed-tick sorties");
      expect(stdout).toContain("Candidate is NEGATIVE");
    },
    200000,
  );
});
