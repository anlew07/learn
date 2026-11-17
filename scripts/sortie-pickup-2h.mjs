import { SORTIE } from "../src/config/sortie-data.js";
import {
  chooseSortieSkill,
  createSortie,
  DURATION_TICKS,
  stepSortie,
} from "../src/systems/sortie-sim.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";
import { experimentInput } from "./sortie-experiment.mjs";

const dangers = [0, 40, 75];
const skills = ["thunder", "rune"];
const routes = ["kite", "pickup", "mistake"];
const seedArg = process.argv.find((arg) => arg.startsWith("--seeds="));
const seeds = seedArg ? Number(seedArg.slice("--seeds=".length)) : 40;
const assert = process.argv.includes("--assert");

if (!Number.isInteger(seeds) || seeds < 1 || seeds > 200) {
  throw new Error("--seeds must be an integer between 1 and 200");
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nearestDistance = (items, hero) =>
  items.length ? Math.min(...items.map((item) => distance(item, hero))) : Infinity;

function routeInput(battle, route) {
  const normal = experimentInput(
    battle,
    route === "kite" ? "kite" : "pickup",
  );
  // One wrong-direction joystick input for 65 ticks every 9 seconds.
  // No random calls, no invented damage and no change to enemy targeting.
  if (route === "mistake" && battle.tick % 540 < 65) {
    return { x: -normal.x, y: -normal.y };
  }
  return normal;
}

function play(seedIndex, danger, skill, route) {
  const seed =
    "sortie-2e-fixed-" +
    String(seedIndex).padStart(3, "0") +
    "-danger-" +
    danger;
  const battle = createSortie(seed, danger, 0);
  let nearDropHurt = 0;
  let contestedPickups = 0;
  let projectileNearPickup = 0;
  let ticks = 0;
  while (battle.outcome === "running" && ticks <= DURATION_TICKS) {
    if (battle.skillChoicePending) {
      const result = chooseSortieSkill(battle, skill);
      if (!result.ok) throw new Error(result.error);
    }
    const hurtBefore = battle.hurt;
    const shardsBefore = battle.collectedShards;
    const nearDrop = nearestDistance(battle.drops, battle.hero) <= 60;
    stepSortie(battle, routeInput(battle, route));
    ticks++;
    if (nearDrop) nearDropHurt += battle.hurt - hurtBefore;
    const collected = battle.collectedShards - shardsBefore;
    if (collected > 0) {
      if (nearestDistance(battle.enemies, battle.hero) <= 60) {
        contestedPickups += collected;
      }
      if (nearestDistance(battle.hostileShots, battle.hero) <= 30) {
        projectileNearPickup += collected;
      }
    }
  }
  if (battle.outcome === "running") {
    throw new Error("Battle exceeded the fixed tick budget");
  }
  const reward = previewSortieRewards(battle);
  const shardCap = SORTIE.rewards.maxShardStones;
  const expectedStones = Math.min(
    shardCap,
    Math.floor(battle.collectedShards / SORTIE.rewards.shardsPerStone),
  );
  if (
    reward.shardStones !== expectedStones ||
    battle.collectedShards + battle.drops.length >
      Math.floor(battle.defeated / SORTIE.rewards.defeatedPerShard)
  ) {
    throw new Error("Fragment reward invariant violated");
  }
  return {
    won: Number(battle.outcome === "won"),
    hp: battle.hero.hp,
    hurt: battle.hurt,
    shards: battle.collectedShards,
    stones: reward.shardStones,
    nearDropHurt,
    contestedPickups,
    projectileNearPickup,
  };
}

const rows = [];
for (const danger of dangers) {
  for (const skill of skills) {
    for (const route of routes) {
      const samples = Array.from({ length: seeds }, (_, seed) =>
        play(seed, danger, skill, route),
      );
      const average = (key) =>
        samples.reduce((sum, sample) => sum + sample[key], 0) / seeds;
      rows.push({
        danger,
        skill,
        route,
        wins: samples.reduce((sum, sample) => sum + sample.won, 0),
        hp: average("hp"),
        hurt: average("hurt"),
        shards: average("shards"),
        stones: average("stones"),
        nearDropHurt: average("nearDropHurt"),
        contestedPickups: samples.reduce(
          (sum, sample) => sum + sample.contestedPickups,
          0,
        ),
        projectileNearPickup: samples.reduce(
          (sum, sample) => sum + sample.projectileNearPickup,
          0,
        ),
      });
    }
  }
}

if (assert) {
  for (const danger of dangers) {
    for (const skill of skills) {
      const group = rows.filter(
        (row) => row.danger === danger && row.skill === skill,
      );
      const kite = group.find((row) => row.route === "kite");
      const pickup = group.find((row) => row.route === "pickup");
      if (pickup.shards <= kite.shards || pickup.stones < kite.stones) {
        throw new Error("Picking up must have a measurable reward benefit");
      }
    }
  }
}

console.log(
  "2H-B isolated fixed-tick battle: " +
    seeds +
    " paired seeds x 3 dangers x 2 skills x 3 routes; no forge",
);
console.log(
  "Mistake: reverse joystick for 65 ticks per 540; enemy/projectile damage unchanged.",
);
console.log(
  "| D | Skill | Route | Wins | HP | Hurt | Shards | Bonus stones | Hurt near drop | Pickups near enemy | Pickups near shot |",
);
console.log(
  "|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
);
for (const row of rows) {
  const f = (value) => value.toFixed(2);
  console.log(
    "| " +
      [
        row.danger,
        row.skill,
        row.route,
        row.wins + "/" + seeds,
        f(row.hp),
        f(row.hurt),
        f(row.shards),
        f(row.stones),
        f(row.nearDropHurt),
        row.contestedPickups,
        row.projectileNearPickup,
      ].join(" | ") +
      " |",
  );
}
console.log(
  "Near-enemy/shot samples describe proximity at pickup, not confirmed injury cause.",
);
console.log(
  "Scripted battle outcomes are not human win rates or an authoritative save test.",
);
