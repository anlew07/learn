import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SORTIE } from "../src/config/sortie-data.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";
import { experimentInput } from "./sortie-experiment.mjs";

/**
 * 2I-B paired radius experiment. Execute the real sortie-sim source with an
 * in-memory copy of sortie-data containing only a different pickupRadius.
 * No production file, save, reward cap, or sim rule is modified.
 */
export const RADII = Object.freeze([28, 24, 20, 16]);
// prettier-ignore
export const ROUTES = Object.freeze([
  "kite",
  "pickup",
  "reverse",
  "short-reverse",
  "drift",
]);
export const DANGERS = Object.freeze([0, 40, 75]);
export const SKILLS = Object.freeze(["thunder", "rune"]);

// prettier-ignore
export async function loadRadiusEngine(radius) {
  if (!RADII.includes(radius))
    throw new Error("Unsupported pickup radius: " + radius);
  const config = await readFile(
    new URL("../src/config/sortie-data.js", import.meta.url),
    "utf8",
  );
  const sim = await readFile(
    new URL("../src/systems/sortie-sim.js", import.meta.url),
    "utf8",
  );
  const matches = [...config.matchAll(/\bpickupRadius:\s*\d+/g)];
  if (matches.length !== 1 || !sim.includes('"../config/sortie-data.js"')) {
    throw new Error(
      "Unexpected engine import or pickupRadius source; inspect before testing",
    );
  }
  const variant = config.replace(
    /\bpickupRadius:\s*\d+/,
    "pickupRadius: " + radius,
  );
  const configUrl = "data:text/javascript," + encodeURIComponent(variant);
  const simUrl =
    "data:text/javascript," +
    encodeURIComponent(
      sim.replace('"../config/sortie-data.js"', JSON.stringify(configUrl)),
    );
  return import(simUrl);
}

/** Deterministic joystick mistakes, not synthetic injuries. */
// prettier-ignore
export function pickupRouteInput(battle, route) {
  if (!ROUTES.includes(route)) throw new Error("Unknown route: " + route);
  const normal = experimentInput(battle, route === "kite" ? "kite" : "pickup");
  if (route === "reverse" && battle.tick % 540 < 65) {
    return { x: -normal.x, y: -normal.y };
  }
  if (
    route === "short-reverse" &&
    battle.tick % 240 >= 118 &&
    battle.tick % 240 < 138
  ) {
    return { x: -normal.x, y: -normal.y };
  }
  if (route === "drift") {
    const angle =
      (battle.tick % 420 < 105 ? 0.39 : 0.17) *
      (Math.floor(battle.tick / 420) % 2 ? -1 : 1);
    return {
      x: normal.x * Math.cos(angle) - normal.y * Math.sin(angle),
      y: normal.x * Math.sin(angle) + normal.y * Math.cos(angle),
    };
  }
  return normal;
}

// prettier-ignore
function nearestDistance(items, hero) {
  let min = Infinity;
  for (const item of items)
    min = Math.min(min, Math.hypot(item.x - hero.x, item.y - hero.y));
  return min;
}

// prettier-ignore
export function playRadiusBattle(
  engine,
  { seedIndex, danger, skill, route, forgeLevel = 0 },
) {
  const seed =
    "sortie-2e-fixed-" +
    String(seedIndex).padStart(3, "0") +
    "-danger-" +
    danger;
  const battle = engine.createSortie(seed, danger, forgeLevel);
  let firstPickupTick = null;
  let nearDropHurt = 0;
  let contestedShards = 0;
  while (battle.outcome === "running" && battle.tick <= engine.DURATION_TICKS) {
    if (battle.skillChoicePending) {
      const choice = engine.chooseSortieSkill(battle, skill);
      if (!choice.ok) throw new Error(choice.error);
    }
    const nearDrop = nearestDistance(battle.drops, battle.hero) <= 60;
    const hurtBefore = battle.hurt;
    const shardsBefore = battle.collectedShards;
    engine.stepSortie(battle, pickupRouteInput(battle, route));
    if (nearDrop) nearDropHurt += battle.hurt - hurtBefore;
    const gained = battle.collectedShards - shardsBefore;
    if (gained > 0) {
      if (firstPickupTick === null) firstPickupTick = battle.tick;
      if (nearestDistance(battle.enemies, battle.hero) <= 60)
        contestedShards += gained;
    }
  }
  if (battle.outcome === "running")
    throw new Error("Fixed-tick battle exceeded budget");
  const reward = previewSortieRewards(battle);
  const eligibleShards = Math.floor(
    battle.defeated / SORTIE.rewards.defeatedPerShard,
  );
  if (
    !reward ||
    battle.collectedShards + battle.drops.length > eligibleShards ||
    reward.shardStones !==
      Math.min(
        SORTIE.rewards.maxShardStones,
        Math.floor(battle.collectedShards / SORTIE.rewards.shardsPerStone),
      )
  ) {
    throw new Error("Fragment and settlement preview invariants failed");
  }
  return {
    won: Number(battle.outcome === "won"),
    hp: battle.hero.hp,
    hurt: battle.hurt,
    defeated: battle.defeated,
    shards: battle.collectedShards,
    missed: battle.drops.length,
    shardStones: reward.shardStones,
    totalStones: reward.stones,
    firstPickupSeconds:
      firstPickupTick === null ? null : firstPickupTick / SORTIE.ticksPerSecond,
    nearDropHurt,
    contestedShards,
  };
}

// prettier-ignore
function aggregate(samples, key) {
  return samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
}

// prettier-ignore
export async function runPickupTradeoff({
  seedCount = 40,
  radii = RADII,
  dangers = DANGERS,
  skills = SKILLS,
  routes = ROUTES,
  forgeLevels = [0],
} = {}) {
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 200) {
    throw new Error("seedCount must be 1..200");
  }
  const rows = [];
  for (const radius of radii) {
    const engine = await loadRadiusEngine(radius);
    for (const forgeLevel of forgeLevels) {
      for (const danger of dangers) {
        for (const skill of skills) {
          for (const route of routes) {
            const samples = Array.from({ length: seedCount }, (_, seedIndex) =>
              playRadiusBattle(engine, {
                seedIndex,
                danger,
                skill,
                route,
                forgeLevel,
              }),
            );
            const feedback = samples
              .map((sample) => sample.firstPickupSeconds)
              .filter((time) => time !== null);
            rows.push({
              radius,
              forgeLevel,
              danger,
              skill,
              route,
              wins: samples.reduce((sum, sample) => sum + sample.won, 0),
              count: seedCount,
              hp: aggregate(samples, "hp"),
              hurt: aggregate(samples, "hurt"),
              defeated: aggregate(samples, "defeated"),
              shards: aggregate(samples, "shards"),
              missed: aggregate(samples, "missed"),
              stones: aggregate(samples, "shardStones"),
              totalStones: aggregate(samples, "totalStones"),
              pickupFeedbackCount: feedback.length,
              firstPickupSeconds:
                feedback.length
                  ? feedback.reduce((sum, time) => sum + time, 0) / feedback.length
                  : null,
              nearDropHurt: aggregate(samples, "nearDropHurt"),
              contestedShards: samples.reduce(
                (sum, sample) => sum + sample.contestedShards,
                0,
              ),
            });
          }
        }
      }
    }
  }
  return { seedCount, sorties: rows.length * seedCount, rows };
}

// prettier-ignore
export function assertPickupTradeoff(result) {
  for (const row of result.rows) {
    if (
      !Number.isFinite(row.hurt) ||
      row.wins > row.count ||
      row.stones > SORTIE.rewards.maxShardStones ||
      row.shards < 0 ||
      row.missed < 0
    )
      throw new Error("Invalid pickup experiment row");
  }
  // The orbit route never steers toward a shard: reducing pickup range cannot
  // make that same deterministic trajectory collect more shards.
  for (const row of result.rows.filter((item) => item.route === "kite")) {
    const larger = result.rows.find(
      (item) =>
        item.route === "kite" &&
        item.radius === 28 &&
        item.forgeLevel === row.forgeLevel &&
        item.danger === row.danger &&
        item.skill === row.skill,
    );
    if (larger && row.shards > larger.shards + 1e-9) {
      throw new Error("Passive pickup increased when radius shrank");
    }
  }
  return true;
}

// prettier-ignore
function parseArgs(args) {
  const seedsArg = args.find((arg) => arg.startsWith("--seeds="));
  const forgeArg = args.find((arg) => arg.startsWith("--forge="));
  const seedCount = seedsArg ? Number(seedsArg.slice(8)) : 40;
  const mode = forgeArg ? forgeArg.slice(8) : "0";
  if (!["0", "1", "both"].includes(mode))
    throw new Error("Use --forge=0|1|both");
  return { seedCount, forgeLevels: mode === "both" ? [0, 1] : [Number(mode)] };
}

// prettier-ignore
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await runPickupTradeoff(parseArgs(process.argv.slice(2)));
  if (process.argv.includes("--assert")) assertPickupTradeoff(result);
  console.log(
    "2I-B paired exact-engine simulation: " +
      result.sorties +
      " battles; same 40 seed series; not human touch evidence",
  );
  console.log(
    "| Radius | Forge | D | Skill | Route | Wins | HP | Hurt | Kills | Shards | Missed | Bonus stones | First feedback (s) | Feedback n |",
  );
  console.log(
    "|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const row of result.rows) {
    const fixed = (n) => n === null ? "—" : n.toFixed(2);
    console.log(
      "| " +
        [
          row.radius,
          row.forgeLevel,
          row.danger,
          row.skill,
          row.route,
          row.wins + "/" + row.count,
          fixed(row.hp),
          fixed(row.hurt),
          fixed(row.defeated),
          fixed(row.shards),
          fixed(row.missed),
          fixed(row.stones),
          fixed(row.firstPickupSeconds),
          row.pickupFeedbackCount,
        ].join(" | ") + " |",
    );
  }
}
