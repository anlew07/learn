import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Engine from "../src/engine.js";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  createSortieArchive,
  prepareSortieArchive,
  settleSortieArchive,
} from "../src/systems/sortie-session.js";
import {
  chooseSortieSkill,
  createSortie,
  DURATION_TICKS,
  stepSortie,
} from "../src/systems/sortie-sim.js";
import {
  DANGERS,
  ROUTES,
  SKILLS,
  pickupRouteInput,
} from "./sortie-pickup-tradeoff-2i.mjs";

/**
 * 2K-B sole candidate: convert ONE of the three guaranteed victory stones
 * into a recover-under-threat objective. A picked real shard with a living
 * enemy within 96px completes the objective. No bonus above the existing
 * five-stone maximum, no new shard, narrower touch radius or artificial harm.
 *
 * Only disposable source copies are patched. Both runs use the original
 * Engine.settleSortie authority and the exact same validated input trace.
 */
export const CANDIDATE = "one-victory-stone-requires-contested-recovery-96px";
export const THREAT_RADIUS = 96;
const SIM_SHARD_FIELD = "drops: [], collectedShards: 0,";
const SIM_PICKUP = "battle.collectedShards++;";
const REWARD_BASE = "const baseStones = won ? rewards.baseStonesOnWin : 0;";
const REWARD_RESULT = "    baseStones,";
const clone = (value) => JSON.parse(JSON.stringify(value));
const mean = (items, key) =>
  items.length ? items.reduce((sum, item) => sum + item[key], 0) / items.length : 0;
const round = (value) => Math.round(value * 1000) / 1000;

export function makeExpeditionCandidate(sim, rewards) {
  for (const [source, marker] of [
    [sim, SIM_SHARD_FIELD],
    [sim, SIM_PICKUP],
    [rewards, REWARD_BASE],
    [rewards, REWARD_RESULT],
  ]) {
    if (source.split(marker).length !== 2) {
      throw new Error("2K-B engine contract changed: inspect source before experimenting");
    }
  }
  const nextSim = sim
    .replace(SIM_SHARD_FIELD, SIM_SHARD_FIELD + " exposedRecovered: 0,")
    .replace(
      SIM_PICKUP,
      SIM_PICKUP + `
      if (battle.enemies.some((enemy) =>
        enemy.hp > 0 && distance(enemy, battle.hero) <= 96
      )) battle.exposedRecovered++;`,
    );
  const nextRewards = rewards
    .replace(
      REWARD_BASE,
      `const objectiveStones = won && (battle.exposedRecovered || 0) > 0 ? 1 : 0;
  const baseStones = won ? rewards.baseStonesOnWin - 1 + objectiveStones : 0;`,
    )
    .replace(
      REWARD_RESULT,
      REWARD_RESULT + `
    objectiveStones,
    exposedRecovered: Math.max(0, Math.floor(battle.exposedRecovered || 0)),`,
    );
  return { sim: nextSim, rewards: nextRewards };
}

/** Create an isolated, native-ESM clone with the SAME authoritative engine. */
export async function withCandidateAuthority(callback) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const temporary = await mkdtemp(join(tmpdir(), "sortie-2k-b-"));
  try {
    await cp(join(root, "src"), join(temporary, "src"), { recursive: true });
    await writeFile(join(temporary, "package.json"), '{"type":"module"}');
    await symlink(join(root, "node_modules"), join(temporary, "node_modules"), "dir");
    const simPath = join(temporary, "src/systems/sortie-sim.js");
    const rewardsPath = join(temporary, "src/systems/sortie-rewards.js");
    const originalSim = await readFile(simPath, "utf8");
    const originalRewards = await readFile(rewardsPath, "utf8");
    const candidate = makeExpeditionCandidate(originalSim, originalRewards);
    await writeFile(simPath, candidate.sim);
    await writeFile(rewardsPath, candidate.rewards);
    const [session, engine] = await Promise.all([
      import(pathToFileURL(join(temporary, "src/systems/sortie-session.js")).href),
      import(pathToFileURL(join(temporary, "src/engine.js")).href),
    ]);
    return await callback({ session, engine: engine.default, candidate });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function createExpeditionTrace(prepared, skill, route) {
  const battle = createSortie(prepared.seed, prepared.danger, prepared.forgeLevel);
  const actions = [];
  let firstPickup = null;
  let nearPickupHurt = 0;
  let pickupNearEnemies = 0;
  while (battle.outcome === "running" && battle.tick <= DURATION_TICKS) {
    if (battle.skillChoicePending) {
      const choice = chooseSortieSkill(battle, skill);
      if (!choice.ok) throw new Error(choice.error);
      actions.push(["skill", skill]);
    }
    const nearDrop = battle.drops.some(
      (drop) => Math.hypot(drop.x - battle.hero.x, drop.y - battle.hero.y) <= 60,
    );
    const beforeHurt = battle.hurt;
    const beforePicked = battle.collectedShards;
    const nearEnemy = battle.enemies.some(
      (enemy) =>
        enemy.hp > 0 &&
        Math.hypot(enemy.x - battle.hero.x, enemy.y - battle.hero.y) <= THREAT_RADIUS,
    );
    const input = pickupRouteInput(battle, route);
    stepSortie(battle, input);
    actions.push(["tick", input.x, input.y]);
    if (nearDrop) nearPickupHurt += battle.hurt - beforeHurt;
    if (battle.collectedShards > beforePicked) {
      if (firstPickup === null) firstPickup = battle.tick / SORTIE.ticksPerSecond;
      if (nearEnemy) pickupNearEnemies += battle.collectedShards - beforePicked;
    }
  }
  if (battle.outcome === "running" || battle.skillChoicePending) {
    throw new Error("2K-B trace exceeded the fixed 75-second battle limit");
  }
  return { actions, battle, firstPickup, nearPickupHurt, pickupNearEnemies };
}

function capture(settled, trace) {
  const world = (id) => settled.receipt.worlds.find((item) => item.id === id);
  const battle = settled.receipt.battle;
  const ling = world("lingzai");
  const other = world("zombie");
  return {
    won: Number(battle.outcome === "won"),
    hurt: trace.battle.hurt,
    hp: trace.battle.hero.hp,
    defeated: battle.defeated,
    shards: battle.collectedShards,
    missed: battle.uncollectedShards,
    shardStones: battle.shardStones,
    baseStones: battle.baseStones,
    stones: battle.stones,
    objectiveStones: battle.objectiveStones || 0,
    exposedRecovered: battle.exposedRecovered || 0,
    nearPickupHurt: trace.nearPickupHurt,
    pickupNearEnemies: trace.pickupNearEnemies,
    firstPickup: trace.firstPickup,
    lingResourceDelta: ling.resourceDelta,
    lingProgressDelta: ling.pDelta,
    lingDangerDelta: ling.dDelta,
    otherResourceDelta: other.resourceDelta,
    otherProgressDelta: other.pDelta,
    otherDangerDelta: other.dDelta,
    otherAction: other.actionId,
    finalResource: Engine.byId(settled.archive.run, "lingzai").resource,
    day: settled.archive.run.day,
  };
}

function assertPaired(control, candidate, trace) {
  const physical = ["won", "hurt", "hp", "defeated", "shards", "missed", "shardStones"];
  for (const key of physical) {
    if (control[key] !== candidate[key]) {
      throw new Error("2K-B candidate changed real battle physics: " + key);
    }
  }
  if (candidate.stones !== candidate.baseStones + candidate.shardStones ||
    candidate.shardStones > SORTIE.rewards.maxShardStones ||
    candidate.stones > SORTIE.rewards.baseStonesOnWin + SORTIE.rewards.maxShardStones ||
    candidate.baseStones !== (candidate.won ? 2 + candidate.objectiveStones : 0) ||
    (candidate.objectiveStones !== 0 && candidate.objectiveStones !== 1) ||
    candidate.lingResourceDelta - control.lingResourceDelta !==
      candidate.stones - control.stones) {
    throw new Error("2K-B candidate violated reward or authoritative resource accounting");
  }
  if (!Array.isArray(trace.actions) || trace.actions.length > DURATION_TICKS + 2) {
    throw new Error("Invalid sortie trace");
  }
  for (const key of ["otherResourceDelta", "otherProgressDelta", "otherDangerDelta", "otherAction"]) {
    if (control[key] !== candidate[key]) {
      throw new Error("2K-B mutated unrelated zombie-world settlement: " + key);
    }
  }
}

/** Exactly one real, fully replay-verified two-world settlement per variant. */
export function pairedExpedition({ candidateAuthority, seedIndex, danger, skill, route }) {
  const seed =
    "sortie-2e-fixed-" + String(seedIndex).padStart(3, "0") +
    "-danger-" + danger;
  const baseline = createSortieArchive(seed);
  const trial = candidateAuthority.session.createSortieArchive(seed);
  Engine.byId(baseline.run, "lingzai").d = danger;
  candidateAuthority.engine.byId(trial.run, "lingzai").d = danger;
  const pBase = prepareSortieArchive(baseline);
  const pTrial = candidateAuthority.session.prepareSortieArchive(trial);
  if (!pBase.ok || !pTrial.ok || pBase.seed !== pTrial.seed ||
    JSON.stringify(pBase.archive.run) !== JSON.stringify(pTrial.archive.run)) {
    throw new Error("2K-B paired world initial states differ");
  }
  const trace = createExpeditionTrace(pBase, skill, route);
  const settledBase = settleSortieArchive(pBase.archive, trace.actions);
  const settledTrial = candidateAuthority.session.settleSortieArchive(
    pTrial.archive, trace.actions,
  );
  if (!settledBase.ok || !settledTrial.ok) {
    throw new Error("2K-B authoritative settlement rejected trace: " +
      (settledBase.error || settledTrial.error));
  }
  const control = capture(settledBase, trace);
  const candidate = capture(settledTrial, trace);
  assertPaired(control, candidate, trace);
  return { control, candidate, trace: trace.actions, base: settledBase, trial: settledTrial };
}

function summary(samples) {
  const feedback = samples.filter((sample) => sample.firstPickup !== null);
  return {
    n: samples.length,
    wins: samples.reduce((sum, sample) => sum + sample.won, 0),
    hurt: round(mean(samples, "hurt")),
    hp: round(mean(samples, "hp")),
    defeated: round(mean(samples, "defeated")),
    shards: round(mean(samples, "shards")),
    missed: round(mean(samples, "missed")),
    shardStones: round(mean(samples, "shardStones")),
    baseStones: round(mean(samples, "baseStones")),
    stones: round(mean(samples, "stones")),
    objectiveCompleted: samples.reduce((sum, sample) => sum + sample.objectiveStones, 0),
    exposedRecovered: round(mean(samples, "exposedRecovered")),
    nearPickupHurt: round(mean(samples, "nearPickupHurt")),
    pickupNearEnemies: round(mean(samples, "pickupNearEnemies")),
    firstPickupCount: feedback.length,
    firstPickup: feedback.length ? round(mean(feedback, "firstPickup")) : null,
    lingResourceDelta: round(mean(samples, "lingResourceDelta")),
    lingProgressDelta: round(mean(samples, "lingProgressDelta")),
    lingDangerDelta: round(mean(samples, "lingDangerDelta")),
    otherResourceDelta: round(mean(samples, "otherResourceDelta")),
    otherProgressDelta: round(mean(samples, "otherProgressDelta")),
    otherDangerDelta: round(mean(samples, "otherDangerDelta")),
  };
}

export async function runExpeditionValue(seedCount = 40) {
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 100) {
    throw new Error("2K-B seeds must be 1..100");
  }
  return withCandidateAuthority(async (candidateAuthority) => {
    const rows = [];
    let checked = 0;
    let identicalPhysical = 0;
    for (const danger of DANGERS) {
      for (const skill of SKILLS) {
        for (const route of ROUTES) {
          const base = [];
          const trial = [];
          for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
            const pair = pairedExpedition({
              candidateAuthority,
              seedIndex,
              danger,
              skill,
              route,
            });
            base.push(pair.control);
            trial.push(pair.candidate);
            checked++;
            if (pair.control.hp === pair.candidate.hp &&
                pair.control.hurt === pair.candidate.hurt &&
                pair.control.defeated === pair.candidate.defeated) identicalPhysical++;
          }
          rows.push({ danger, skill, route, baseline: summary(base), candidate: summary(trial) });
        }
      }
    }
    return {
      metadata: {
        candidate: CANDIDATE,
        threatRadius: THREAT_RADIUS,
        seedCount,
        pairs: checked,
        authoritativeSorties: checked * 2,
        unchangedPhysics: identicalPhysical,
        dangers: DANGERS,
        skills: SKILLS,
        routes: ROUTES,
        maxShardStones: SORTIE.rewards.maxShardStones,
        originalBaseStones: SORTIE.rewards.baseStonesOnWin,
        candidateBaseStonesWithoutObjective: SORTIE.rewards.baseStonesOnWin - 1,
        existingMaxTotalStones: SORTIE.rewards.baseStonesOnWin + SORTIE.rewards.maxShardStones,
        authority: "Engine.settleSortie replay in disposable cloned src tree",
        noProductionChange: true,
      },
      rows,
    };
  });
}

export function assertExpeditionValue(report) {
  if (report.metadata.pairs !==
    report.metadata.seedCount * DANGERS.length * SKILLS.length * ROUTES.length ||
    report.metadata.authoritativeSorties !== report.metadata.pairs * 2 ||
    report.metadata.unchangedPhysics !== report.metadata.pairs ||
    report.rows.length !== DANGERS.length * SKILLS.length * ROUTES.length) {
    throw new Error("2K-B incomplete paired authoritative matrix");
  }
  for (const row of report.rows) {
    const a = row.baseline;
    const b = row.candidate;
    if (a.n !== report.metadata.seedCount || b.n !== report.metadata.seedCount ||
      a.wins !== b.wins || a.hurt !== b.hurt || a.hp !== b.hp ||
      a.defeated !== b.defeated || a.shards !== b.shards ||
      a.shardStones !== b.shardStones ||
      b.stones > report.metadata.existingMaxTotalStones ||
      b.objectiveCompleted > b.n ||
      b.lingResourceDelta - a.lingResourceDelta !==
        round(b.stones - a.stones)) {
      throw new Error("2K-B paired result invariants broken");
    }
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raw = process.argv.find((value) => value.startsWith("--seeds="));
  const seedCount = raw ? Number(raw.slice(8)) : 40;
  const report = await runExpeditionValue(seedCount);
  if (process.argv.includes("--assert")) assertExpeditionValue(report);
  console.log("EXPEDITION_VALUE_2K_JSON=" + JSON.stringify(report));
}
