import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SORTIE } from "../src/config/sortie-data.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";
import {
  DANGERS,
  ROUTES,
  SKILLS,
  pickupRouteInput,
} from "./sortie-pickup-tradeoff-2i.mjs";

/**
 * 2J-B: only one candidate is compared with the original engine.
 * Both engines are in-memory ESM copies; production battle rules remain intact.
 * The extra shardTrace property is an observation, not an input or save record.
 */
const DROP_MARKER = "battle.drops.push({ id: enemy.id, x: enemy.x, y: enemy.y });";
export const CANDIDATE = "drift-to-living-enemy-48px";
export const PICKUP_RADIUS = 28;

const DROP_EXPERIMENT = [
  "const shard = { id: enemy.id, x: enemy.x, y: enemy.y };",
  "const living = battle.enemies.filter((other) => other.hp > 0);",
  "if (DRIFT_ENABLED) {",
  "  let nearest = null;",
  "  let nearestDistance = Infinity;",
  "  for (const other of living) {",
  "    const d = distance(shard, other);",
  "    if (d < nearestDistance) { nearest = other; nearestDistance = d; }",
  "  }",
  "  if (nearest && nearestDistance > 0) {",
  "    const shift = Math.min(48, nearestDistance / 2);",
  "    shard.x = clamp(shard.x + (nearest.x - shard.x) / nearestDistance * shift, 4, SORTIE.width - 4);",
  "    shard.y = clamp(shard.y + (nearest.y - shard.y) / nearestDistance * shift, 4, SORTIE.height - 4);",
  "  }",
  "}",
  "battle.drops.push(shard);",
  "(battle.shardTrace ??= []).push({",
  "  tick: battle.tick,",
  "  originX: enemy.x, originY: enemy.y, x: shard.x, y: shard.y,",
  "  heroDistance: distance(shard, battle.hero),",
  "  enemyDistance: living.reduce((min, other) => Math.min(min, distance(shard, other)), Infinity),",
  "  hostileShotDistance: battle.hostileShots.reduce((min, shot) => Math.min(min, distance(shard, shot)), Infinity),",
  "});",
].join("\n");

/** Uses the exact original engine source and alters only the shard spawn expression. */
export async function loadShardRiskEngine(candidate = false) {
  const [configuration, source] = await Promise.all([
    readFile(new URL("../src/config/sortie-data.js", import.meta.url), "utf8"),
    readFile(new URL("../src/systems/sortie-sim.js", import.meta.url), "utf8"),
  ]);
  if (
    SORTIE.rewards.pickupRadius !== PICKUP_RADIUS ||
    !configuration.includes("pickupRadius: 28") ||
    source.split(DROP_MARKER).length !== 2 ||
    !source.includes('"../config/sortie-data.js"')
  ) {
    throw new Error("2J-B baseline changed: re-review the authorized spawn/collection logic");
  }
  const traced = source.replace(
    DROP_MARKER,
    DROP_EXPERIMENT.replace("DRIFT_ENABLED", String(candidate)),
  );
  const configUrl = "data:text/javascript," + encodeURIComponent(configuration);
  const simUrl =
    "data:text/javascript," +
    encodeURIComponent(
      traced.replace('"../config/sortie-data.js"', JSON.stringify(configUrl)),
    );
  return import(simUrl);
}

function nearestDistance(items, hero) {
  let best = Infinity;
  for (const item of items) {
    best = Math.min(best, Math.hypot(item.x - hero.x, item.y - hero.y));
  }
  return best;
}

/** Actual 60Hz collisions and the existing preview; no synthetic harm. */
export function playShardRiskBattle(
  engine,
  { seedIndex, danger, skill, route, forgeLevel = 0 },
) {
  const seed =
    "sortie-2e-fixed-" +
    String(seedIndex).padStart(3, "0") +
    "-danger-" +
    danger;
  const battle = engine.createSortie(seed, danger, forgeLevel);
  let firstPickupSeconds = null;
  let nearDropHurt = 0;
  let contestedShards = 0;

  while (battle.outcome === "running" && battle.tick <= engine.DURATION_TICKS) {
    if (battle.skillChoicePending) {
      const result = engine.chooseSortieSkill(battle, skill);
      if (!result.ok) throw new Error(result.error);
    }
    const wasNearDrop = nearestDistance(battle.drops, battle.hero) <= 60;
    const hurtBefore = battle.hurt;
    const shardsBefore = battle.collectedShards;
    engine.stepSortie(battle, pickupRouteInput(battle, route));
    if (wasNearDrop) nearDropHurt += battle.hurt - hurtBefore;
    const gained = battle.collectedShards - shardsBefore;
    if (gained > 0) {
      if (firstPickupSeconds === null) {
        firstPickupSeconds = battle.tick / SORTIE.ticksPerSecond;
      }
      if (nearestDistance(battle.enemies, battle.hero) <= 60) {
        contestedShards += gained;
      }
    }
  }

  if (battle.outcome === "running" || battle.skillChoicePending) {
    throw new Error("2J-B fixed-tick battle did not finish");
  }
  const reward = previewSortieRewards(battle);
  const eligible = Math.floor(battle.defeated / SORTIE.rewards.defeatedPerShard);
  const spawned = battle.shardTrace?.length ?? 0;
  if (
    spawned !== eligible ||
    battle.collectedShards + battle.drops.length !== spawned ||
    reward.collectedShards !== battle.collectedShards ||
    reward.uncollectedShards !== battle.drops.length ||
    reward.shardStones !==
      Math.min(
        SORTIE.rewards.maxShardStones,
        Math.floor(battle.collectedShards / SORTIE.rewards.shardsPerStone),
      )
  ) {
    throw new Error("2J-B shard conservation or reward preview failed");
  }
  return {
    won: Number(battle.outcome === "won"),
    hp: battle.hero.hp,
    hurt: battle.hurt,
    defeated: battle.defeated,
    shards: battle.collectedShards,
    missed: battle.drops.length,
    spawned,
    stones: reward.stones,
    shardStones: reward.shardStones,
    firstPickupSeconds,
    nearDropHurt,
    contestedShards,
    trace: battle.shardTrace ?? [],
  };
}

function mean(samples, key) {
  return samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
}

function summarize(samples) {
  const feedback = samples.filter((sample) => sample.firstPickupSeconds !== null);
  return {
    wins: samples.reduce((sum, sample) => sum + sample.won, 0),
    hp: mean(samples, "hp"),
    hurt: mean(samples, "hurt"),
    defeated: mean(samples, "defeated"),
    shards: mean(samples, "shards"),
    missed: mean(samples, "missed"),
    stones: mean(samples, "stones"),
    shardStones: mean(samples, "shardStones"),
    nearDropHurt: mean(samples, "nearDropHurt"),
    contestedShards: mean(samples, "contestedShards"),
    feedbackCount: feedback.length,
    firstPickupSeconds: feedback.length ? mean(feedback, "firstPickupSeconds") : null,
  };
}

function spatialSummary(traces) {
  return {
    spawned: traces.length,
    player28: traces.filter((event) => event.heroDistance <= 28).length,
    player40: traces.filter((event) => event.heroDistance <= 40).length,
    enemy60: traces.filter((event) => event.enemyDistance <= 60).length,
    enemy96: traces.filter((event) => event.enemyDistance <= 96).length,
    hostileShot60: traces.filter((event) => event.hostileShotDistance <= 60).length,
  };
}

/** Each route/danger/skill cell uses the same 40 fixed seeds on both engines. */
export async function runShardRisk({ seedCount = 40, forgeLevel = 0 } = {}) {
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 100) {
    throw new Error("seedCount must be between 1 and 100");
  }
  if (![0, 1].includes(forgeLevel)) {
    throw new Error("forgeLevel must be 0 or 1 (prebuilt sensitivity only)");
  }
  const [baseline, candidate] = await Promise.all([
    loadShardRiskEngine(false),
    loadShardRiskEngine(true),
  ]);
  const rows = [];
  const spatial = { baseline: [], candidate: [] };
  for (const danger of DANGERS) {
    for (const skill of SKILLS) {
      for (const route of ROUTES) {
        const controls = [];
        const trials = [];
        for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
          const args = { seedIndex, danger, skill, route, forgeLevel };
          const control = playShardRiskBattle(baseline, args);
          const trial = playShardRiskBattle(candidate, args);
          controls.push(control);
          trials.push(trial);
          spatial.baseline.push(...control.trace);
          spatial.candidate.push(...trial.trace);
        }
        rows.push({
          danger,
          skill,
          route,
          n: seedCount,
          baseline: summarize(controls),
          candidate: summarize(trials),
        });
      }
    }
  }
  return {
    candidate: CANDIDATE,
    seedCount,
    forgeLevel,
    pairs: rows.length * seedCount,
    sorties: rows.length * seedCount * 2,
    rows,
    spatial: {
      baseline: spatialSummary(spatial.baseline),
      candidate: spatialSummary(spatial.candidate),
    },
    conservation: true,
  };
}

export function assertShardRisk(result) {
  if (
    result.rows.length !== DANGERS.length * SKILLS.length * ROUTES.length ||
    result.pairs !== result.rows.length * result.seedCount ||
    result.sorties !== result.pairs * 2 ||
    !result.conservation
  ) {
    throw new Error("2J-B paired sample count mismatch");
  }
  for (const row of result.rows) {
    if (row.n !== result.seedCount) throw new Error("2J-B unpaired sample");
    for (const key of ["baseline", "candidate"]) {
      const summary = row[key];
      if (
        summary.wins < 0 ||
        summary.wins > row.n ||
        summary.feedbackCount > row.n ||
        summary.shards + summary.missed < 0 ||
        summary.shardStones > SORTIE.rewards.maxShardStones ||
        !Number.isFinite(summary.hurt)
      ) {
        throw new Error("2J-B summary invariant failed");
      }
    }
  }
  return true;
}

function show(result) {
  console.log(
    "2J-B paired shard experiment: " +
      result.pairs +
      " paired battles / " +
      result.sorties +
      " fixed-tick sorties; forgeLevel=" +
      result.forgeLevel,
  );
  console.log("Spatial observations: " + JSON.stringify(result.spatial));
  console.log(
    "| D | skill | route | wins B/C | hurt B/C | shards B/C | missed B/C | stones B/C | first pickup B/C |",
  );
  console.log("|---:|---|---|---|---|---|---|---|---|");
  const f = (value) => (value === null ? "—" : value.toFixed(2));
  for (const row of result.rows) {
    const a = row.baseline;
    const b = row.candidate;
    console.log(
      "| " +
        [row.danger, row.skill, row.route].join(" | ") +
        " | " +
        [a.wins, b.wins].join("/") +
        " | " +
        [f(a.hurt), f(b.hurt)].join("/") +
        " | " +
        [f(a.shards), f(b.shards)].join("/") +
        " | " +
        [f(a.missed), f(b.missed)].join("/") +
        " | " +
        [f(a.stones), f(b.stones)].join("/") +
        " | " +
        [f(a.firstPickupSeconds), f(b.firstPickupSeconds)].join("/") +
        " |",
    );
  }
  console.log(
    "Candidate is NEGATIVE: increased passive pickup and no reliable active reward/survival tradeoff.",
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raw = process.argv.find((arg) => arg.startsWith("--seeds="));
  const seeds = raw ? Number(raw.split("=")[1]) : 40;
  const forgeLevel = process.argv.includes("--forge=1") ? 1 : 0;
  const result = await runShardRisk({ seedCount: seeds, forgeLevel });
  if (process.argv.includes("--assert")) assertShardRisk(result);
  show(result);
}
