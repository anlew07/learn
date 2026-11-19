import Engine from "../src/engine.js";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  createSortieArchive,
  prepareSortieArchive,
  selectSortieCampMission,
  settleSortieArchive,
} from "../src/systems/sortie-session.js";
import {
  chooseSortieSkill,
  createSortie,
  DURATION_TICKS,
  stepSortie,
} from "../src/systems/sortie-sim.js";
import { experimentInput } from "./sortie-experiment.mjs";
import {
  recoveryRouteInput,
  RECOVERY_DANGERS,
  RECOVERY_SKILLS,
} from "./sortie-guarded-recovery-2l.mjs";

// Existing mission: appears at 10s and expires at 65s. No new reward, HP,
// enemy, spatial tolerance, mission timer or authoritative settlement rule.
// prettier-ignore
export const TIMED_APPROACH_SECONDS = Object.freeze([10, 30, 50, 62]);
// prettier-ignore
export const TIMED_APPROACH_ROUTES = Object.freeze(["direct", "reverse", "drift"]);
// prettier-ignore
const round = (value) => value === null ? null : Math.round(value * 1000) / 1000;
// prettier-ignore
const mean = (values) => values.length ?
  values.reduce((sum, value) => sum + value, 0) / values.length : null;
// prettier-ignore
const seedFor = (i, danger) =>
  "sortie-2e-fixed-" + String(i).padStart(3, "0") + "-danger-" + danger;

/**
 * A player first kites to survive or scavenge, then decides WHEN to approach.
 * "reverse" and "drift" are finite input errors relative to that approach,
 * rather than changing the battlefield's enemy physics or awarding fake damage.
 * All routes share identical production combat and guarded salvage logic.
 */
// prettier-ignore
export function timedRecoveryInput(battle, startSeconds, route, controller) {
  if (!TIMED_APPROACH_SECONDS.includes(startSeconds) ||
    !TIMED_APPROACH_ROUTES.includes(route)) {
    throw new Error("Invalid 2O approach timing / route");
  }
  const delayTick = startSeconds * SORTIE.ticksPerSecond;
  if (battle.tick < delayTick) return experimentInput(battle, "kite");
  const target = recoveryRouteInput(battle, "target", controller);
  if (controller.finished || (!target.x && !target.y)) return target;
  const elapsed = battle.tick - delayTick;
  if (route === "reverse" && elapsed < 54) {
    return { x: -target.x, y: -target.y };
  }
  if (route === "drift" && elapsed < 180) {
    const angle = elapsed < 90 ? 0.66 : -0.32;
    return {
      x: target.x * Math.cos(angle) - target.y * Math.sin(angle),
      y: target.x * Math.sin(angle) + target.y * Math.cos(angle),
    };
  }
  return target;
}

/**
 * Genuine one-day camp choice, real touchscreen-equivalent vector input,
 * live fixed-tick battle, and independent Engine authority replay.
 * Never overwrites a battle result or a reward after settlement.
 */
// prettier-ignore
export function playTimedRecoveryRun(seedIndex, danger, skill, route, startSeconds) {
  if (!Number.isInteger(seedIndex) || seedIndex < 0 || seedIndex >= 40 ||
    !RECOVERY_DANGERS.includes(danger) || !RECOVERY_SKILLS.includes(skill) ||
    !TIMED_APPROACH_ROUTES.includes(route) ||
    !TIMED_APPROACH_SECONDS.includes(startSeconds)) {
    throw new Error("Invalid fixed-seed 2O trial");
  }
  const original = createSortieArchive(seedFor(seedIndex, danger));
  Engine.byId(original.run, "lingzai").d = danger;
  const picked = selectSortieCampMission(
    original, "salvage", "2o:select:salvage:" + original.run.day,
  );
  if (!picked.ok || picked.replayed) throw new Error("Real mission selection failed");
  const prepared = prepareSortieArchive(picked.archive);
  if (!prepared.ok || prepared.missionId !== "salvage") {
    throw new Error("2O not prepared for authoritative guarded salvage");
  }
  const beforeDay = prepared.archive.run.day;
  const oldZombie = JSON.stringify(Engine.byId(original.run, "zombie"));
  const battle = createSortie(
    prepared.seed, prepared.danger, prepared.forgeLevel, prepared.missionId,
  );
  const controller = { holding: 0, finished: false };
  const actions = [];
  while (battle.outcome === "running" && battle.tick <= DURATION_TICKS) {
    if (battle.skillChoicePending) {
      const choice = chooseSortieSkill(battle, skill);
      if (!choice.ok) throw new Error("2O skill was rejected");
      actions.push(["skill", skill]);
    }
    const input = timedRecoveryInput(battle, startSeconds, route, controller);
    stepSortie(battle, input);
    actions.push(["tick", input.x, input.y]);
  }
  if (battle.outcome === "running" || battle.skillChoicePending) {
    throw new Error("2O battle exceeded authority tick budget");
  }
  const settled = settleSortieArchive(prepared.archive, actions);
  if (!settled.ok) throw new Error("2O authoritative settlement failed: " + settled.error);
  const receipt = settled.receipt.battle;
  const mission = battle.mission;
  const expectedBonus = battle.outcome === "won" && mission.status === "completed" ?
    SORTIE.mission.rewardStones : 0;
  if (receipt.missionId !== "salvage" ||
    settled.receipt.missionId !== "salvage" ||
    receipt.objectiveStones !== expectedBonus ||
    settled.receipt.objectiveStones !== expectedBonus ||
    receipt.stones !== receipt.baseStones + receipt.shardStones + receipt.objectiveStones ||
    settled.receipt.worlds[0].resourceDelta !== receipt.stones ||
    settled.receipt.worlds[1].resourceDelta !== 0 ||
    settled.archive.run.day !== beforeDay + 1 ||
    original.run.day !== beforeDay ||
    JSON.stringify(Engine.byId(original.run, "zombie")) !== oldZombie) {
    throw new Error("2O physical mission / two-world receipt invariant failed");
  }
  const startTick = startSeconds * SORTIE.ticksPerSecond;
  return {
    seedIndex, danger, skill, route, startSeconds,
    won: Number(battle.outcome === "won"),
    completed: Number(mission.status === "completed"),
    paid: Number(receipt.objectiveStones > 0),
    lost: Number(battle.outcome === "lost"),
    hp: battle.hero.hp, hurt: battle.hurt,
    guardDamage: mission.guardDamage, guardCount: mission.guardCount,
    defeated: battle.defeated,
    shards: receipt.collectedShards, shardStones: receipt.shardStones,
    objectiveStones: receipt.objectiveStones, stones: receipt.stones,
    firstContact: mission.firstContactTick === null ? null :
      round(mission.firstContactTick / SORTIE.ticksPerSecond),
    completion: mission.completedTick === null ? null :
      round(mission.completedTick / SORTIE.ticksPerSecond),
    guardTriggered: mission.guardTriggeredTick === null ? null :
      round(mission.guardTriggeredTick / SORTIE.ticksPerSecond),
    preApproachContact: Number(mission.firstContactTick !== null &&
      mission.firstContactTick < startTick),
    preApproachGuard: Number(mission.guardTriggeredTick !== null &&
      mission.guardTriggeredTick < startTick),
  };
}

// prettier-ignore
function summarize(records) {
  const sum = (key) => records.reduce((count, item) => count + Number(item[key]), 0);
  const avg = (key) => round(mean(records.map((item) => item[key])));
  const contact = records.filter((item) => item.firstContact !== null);
  const completion = records.filter((item) => item.completion !== null);
  return {
    n: records.length,
    wins: sum("won"), objectives: sum("completed"), paid: sum("paid"),
    prematureContacts: sum("preApproachContact"),
    prematureGuards: sum("preApproachGuard"),
    losses: sum("lost"), guardTriggered: records.filter((x) =>
      x.guardTriggered !== null).length,
    hurt: avg("hurt"), hp: avg("hp"),
    guardDamage: avg("guardDamage"), defeated: avg("defeated"),
    shards: avg("shards"), shardStones: avg("shardStones"),
    objectiveStones: avg("objectiveStones"), stones: avg("stones"),
    meanFirstContact: round(mean(contact.map((x) => x.firstContact))),
    meanCompletion: round(mean(completion.map((x) => x.completion))),
  };
}

// prettier-ignore
function pairedContrast(rows, early, late) {
  const first = new Map(rows.filter((r) => r.startSeconds === early)
    .map((r) => [[r.seedIndex, r.danger, r.skill, r.route].join(":"), r]));
  const matched = rows.filter((r) => r.startSeconds === late).map((later) => ({
    earlier: first.get([later.seedIndex, later.danger, later.skill, later.route].join(":")),
    later,
  }));
  if (matched.some((p) => !p.earlier)) throw new Error("Missing 2O paired timing");
  const difference = (key) => round(mean(matched.map((p) =>
    p.later[key] - p.earlier[key])));
  return {
    early, late, n: matched.length,
    winDelta: difference("won"),
    paidDelta: difference("paid"),
    completedDelta: difference("completed"),
    hurtDelta: difference("hurt"),
    guardDamageDelta: difference("guardDamage"),
    shardDelta: difference("shards"),
    earnedStonesDelta: difference("stones"),
    savedByDelay: matched.filter((p) => !p.earlier.won && p.later.won).length,
    harmedByDelay: matched.filter((p) => p.earlier.won && !p.later.won).length,
  };
}

/**
 * 40 seeds x 3 dangers x 2 skills x 3 player-input error routes
 * x 4 intended approach times = 2,880 independent authority replays.
 * Same 40 seeds are crossed across strategies, NOT 2,880 distinct people.
 */
// prettier-ignore
export function runTimedRecoveryMatrix(seeds = 40) {
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 40) {
    throw new Error("Use 1..40 2O fixed seeds");
  }
  const rows = [];
  for (const danger of RECOVERY_DANGERS) {
    for (const skill of RECOVERY_SKILLS) {
      for (const route of TIMED_APPROACH_ROUTES) {
        for (let i = 0; i < seeds; i++) {
          for (const startSeconds of TIMED_APPROACH_SECONDS) {
            rows.push(playTimedRecoveryRun(i, danger, skill, route, startSeconds));
          }
        }
      }
    }
  }
  const byTiming = TIMED_APPROACH_SECONDS.map((startSeconds) => ({
    startSeconds, ...summarize(rows.filter((x) => x.startSeconds === startSeconds)),
  }));
  const byDangerTiming = RECOVERY_DANGERS.flatMap((danger) =>
    TIMED_APPROACH_SECONDS.map((startSeconds) => ({
      danger, startSeconds, ...summarize(rows.filter((x) =>
        x.danger === danger && x.startSeconds === startSeconds)),
    })));
  const byRouteTiming = TIMED_APPROACH_ROUTES.flatMap((route) =>
    TIMED_APPROACH_SECONDS.map((startSeconds) => ({
      route, startSeconds, ...summarize(rows.filter((x) =>
        x.route === route && x.startSeconds === startSeconds)),
    })));
  const contrasts = TIMED_APPROACH_SECONDS.slice(1).map((t) =>
    pairedContrast(rows, TIMED_APPROACH_SECONDS[0], t));
  const highDangerContrasts = TIMED_APPROACH_SECONDS.slice(1).map((t) =>
    pairedContrast(rows.filter((x) => x.danger === 75), TIMED_APPROACH_SECONDS[0], t));
  return {
    metadata: {
      seeds, trials: rows.length, dangers: RECOVERY_DANGERS,
      routes: TIMED_APPROACH_ROUTES, skills: RECOVERY_SKILLS,
      approaches: TIMED_APPROACH_SECONDS, rewardStones: SORTIE.mission.rewardStones,
    },
    rows, overall: summarize(rows), byTiming, byDangerTiming,
    byRouteTiming, contrasts, highDangerContrasts,
  };
}

// prettier-ignore
export function assertTimedRecoveryMatrix(result) {
  const { metadata, rows } = result;
  if (metadata.trials !== metadata.seeds * 3 * 2 * 3 * 4 ||
    rows.length !== metadata.trials ||
    result.byTiming.length !== 4 || result.byDangerTiming.length !== 12 ||
    result.byRouteTiming.length !== 12 ||
    result.contrasts.length !== 3) {
    throw new Error("2O cohort cardinality mismatch");
  }
  for (const r of rows) {
    if (r.paid > r.won || r.paid > r.completed ||
      r.objectiveStones !== r.paid * SORTIE.mission.rewardStones ||
      r.shardStones > SORTIE.rewards.maxShardStones ||
      r.guardCount > (r.danger >= 75 ? 4 : r.danger >= 40 ? 3 : 2) ||
      (r.completed && r.completion === null) ||
      (r.paid && !r.firstContact) ||
      (r.firstContact !== null && r.firstContact < SORTIE.mission.appearsAtSeconds) ||
      (r.completion !== null && r.completion >= SORTIE.mission.expiresAtSeconds)) {
      throw new Error("2O invalid physical objective or genuine receipt");
    }
  }
  return true;
}

if (process.argv[1] &&
  import.meta.url === new URL("file://" + process.argv[1]).href) {
  const seeds = Number(process.argv.find((arg) =>
    arg.startsWith("--seeds="))?.split("=")[1] ?? 40);
  const report = runTimedRecoveryMatrix(seeds);
  assertTimedRecoveryMatrix(report);
  console.log("RECOVERY_TIMING_2O_JSON=" + JSON.stringify({
    metadata: report.metadata,
    overall: report.overall,
    byTiming: report.byTiming,
    byDangerTiming: report.byDangerTiming,
    byRouteTiming: report.byRouteTiming,
    contrasts: report.contrasts,
    highDangerContrasts: report.highDangerContrasts,
  }));
}
