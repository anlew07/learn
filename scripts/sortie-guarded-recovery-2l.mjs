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
import { experimentInput } from "./sortie-experiment.mjs";

// 2L-A: production tick physics + authoritative Engine replay in isolated saves.
// prettier-ignore
export const RECOVERY_DANGERS = [0, 40, 75];
// prettier-ignore
export const RECOVERY_SKILLS = ["thunder", "rune"];
// prettier-ignore
export const RECOVERY_ROUTES = ["kite", "target", "mistake", "drift"];
// prettier-ignore
const SITE = SORTIE.mission;
// prettier-ignore
const round = (n) => Math.round(n * 1000) / 1000;
// prettier-ignore
const mean = (items, key) =>
  items.length ? items.reduce((sum, item) => sum + item[key], 0) / items.length : 0;

// prettier-ignore
function normalize(x, y) {
  const length = Math.hypot(x, y);
  return length > 0.001 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

/**
 * Identical route intent for safe and salvage: approach the same coordinates
 * and attempt a visible one-second hold. Only salvage spawns actual guardians.
 * Mistakes are joystick direction errors, never scripted damage.
 */
// prettier-ignore
export function recoveryRouteInput(battle, route, controller) {
  if (!RECOVERY_ROUTES.includes(route)) throw new Error("Invalid recovery route");
  if (route === "kite" || controller.finished) return experimentInput(battle, "kite");
  if (battle.tick < SITE.appearsAtSeconds * SORTIE.ticksPerSecond) {
    return experimentInput(battle, "kite");
  }
  const dx = SITE.x - battle.hero.x;
  const dy = SITE.y - battle.hero.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= SITE.collectRadius - 5) {
    controller.holding++;
    if (controller.holding >= SITE.collectSeconds * SORTIE.ticksPerSecond + 1) {
      controller.finished = true;
      return experimentInput(battle, "kite");
    }
    return { x: 0, y: 0 };
  }
  controller.holding = 0;
  let motion = normalize(dx, dy);
  const age = battle.tick - SITE.appearsAtSeconds * SORTIE.ticksPerSecond;
  if (route === "mistake" && age >= 40 && age < 94) {
    motion = { x: -motion.x, y: -motion.y };
  }
  if (route === "drift") {
    const angle = (battle.tick % 300 < 90 ? 0.66 : -0.32);
    motion = {
      x: motion.x * Math.cos(angle) - motion.y * Math.sin(angle),
      y: motion.x * Math.sin(angle) + motion.y * Math.cos(angle),
    };
  }
  return motion;
}

// prettier-ignore
export function playRecoveryRun(archive, skill, route, missionId) {
  const previousDay = archive.run.day;
  const staged = JSON.parse(JSON.stringify(archive));
  staged.run.sortieCamp = {
    ...staged.run.sortieCamp,
    missionSelection: {
      missionId, day: previousDay,
      operationId: "2l:select:" + missionId + ":" + previousDay,
    },
  };
  const prepared = prepareSortieArchive(staged);
  if (!prepared.ok) throw new Error(prepared.error);
  const battle = createSortie(prepared.seed, prepared.danger, prepared.forgeLevel, missionId);
  const controller = { holding: 0, finished: false };
  const actions = [];
  while (battle.outcome === "running" && battle.tick <= DURATION_TICKS) {
    if (battle.skillChoicePending) {
      const choice = chooseSortieSkill(battle, skill);
      if (!choice.ok) throw new Error(choice.error);
      actions.push(["skill", skill]);
    }
    const input = recoveryRouteInput(battle, route, controller);
    stepSortie(battle, input);
    actions.push(["tick", input.x, input.y]);
  }
  if (battle.outcome === "running" || battle.skillChoicePending) {
    throw new Error("Recovery run exceeded fixed tick budget");
  }
  const settled = settleSortieArchive(prepared.archive, actions);
  if (!settled.ok) throw new Error("Authority refused recovery run: " + settled.error);
  const reward = settled.receipt.battle;
  const mission = battle.mission;
  if (settled.receipt.missionId !== missionId ||
    reward.missionId !== missionId ||
    settled.receipt.objectiveStones !== reward.objectiveStones ||
    reward.objectiveStones !== (
      missionId === "salvage" && mission.status === "completed" && battle.outcome === "won"
        ? SITE.rewardStones : 0
    ) ||
    reward.stones !== reward.baseStones + reward.shardStones + reward.objectiveStones ||
    reward.baseStones !== (battle.outcome === "won" ? SORTIE.rewards.baseStonesOnWin : 0) ||
    reward.shardStones > SORTIE.rewards.maxShardStones ||
    reward.collectedShards + reward.uncollectedShards >
      Math.floor(reward.defeated / SORTIE.rewards.defeatedPerShard) ||
    settled.receipt.worlds[0].resourceDelta !== reward.stones ||
    settled.receipt.worlds[1].resourceDelta !== 0 ||
    settled.archive.run.day !== previousDay + 1) {
    throw new Error("2L-A reward / replay / world invariant failed");
  }
  // Never mutate the old archive: successful action saves the returned snapshot.
  if (archive.run.day !== previousDay) throw new Error("Original archive was modified");
  return {
    archive: settled.archive,
    receipt: settled.receipt,
    actions,
    stats: {
      day: previousDay,
      missionId,
      route,
      skill,
      danger: battle.danger,
      won: Number(battle.outcome === "won"),
      hurt: battle.hurt,
      hp: battle.hero.hp,
      defeated: battle.defeated,
      shards: reward.collectedShards,
      objectiveStones: reward.objectiveStones,
      stones: reward.stones,
      completed: Number(mission.status === "completed"),
      firstSeen: missionId === "salvage" ? SITE.appearsAtSeconds : null,
      firstContact: mission.firstContactTick === null ? null :
        mission.firstContactTick / SORTIE.ticksPerSecond,
      completion: mission.completedTick === null ? null :
        mission.completedTick / SORTIE.ticksPerSecond,
      guardCount: mission.guardCount,
      guardDamage: mission.guardDamage,
      lingResource: Engine.byId(settled.archive.run, "lingzai").resource,
      lingDelta: settled.receipt.worlds[0].resourceDelta,
      zombieDelta: settled.receipt.worlds[1].resourceDelta,
      zombieProgress: settled.receipt.worlds[1].pDelta,
      zombieDanger: settled.receipt.worlds[1].dDelta,
    },
  };
}

// prettier-ignore
export function pairedRecoveryRun(seedIndex, danger, skill, route) {
  const seed = "sortie-2e-fixed-" + String(seedIndex).padStart(3, "0") +
    "-danger-" + danger;
  const safeArchive = createSortieArchive(seed);
  const salvageArchive = createSortieArchive(seed);
  Engine.byId(safeArchive.run, "lingzai").d = danger;
  Engine.byId(salvageArchive.run, "lingzai").d = danger;
  const pair = { danger, skill, route, seedIndex, safe: [], salvage: [] };
  let a = safeArchive;
  let b = salvageArchive;
  for (let run = 0; run < 2; run++) {
    const safe = playRecoveryRun(a, skill, route, "safe");
    const salvage = playRecoveryRun(b, skill, route, "salvage");
    for (const field of ["zombieDelta", "zombieProgress", "zombieDanger"]) {
      if (safe.stats[field] !== salvage.stats[field]) {
        throw new Error("Other-world changes must match for identical paired runs: " + field);
      }
    }
    pair.safe.push(safe.stats);
    pair.salvage.push(salvage.stats);
    a = safe.archive;
    b = salvage.archive;
  }
  return pair;
}

// prettier-ignore
export function runRecoveryMatrix(seeds = 40) {
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 40) {
    throw new Error("Use 1..40 fixed seeds");
  }
  const pairs = [];
  for (const danger of RECOVERY_DANGERS) {
    for (const skill of RECOVERY_SKILLS) {
      for (const route of RECOVERY_ROUTES) {
        for (let seedIndex = 0; seedIndex < seeds; seedIndex++) {
          pairs.push(pairedRecoveryRun(seedIndex, danger, skill, route));
        }
      }
    }
  }
  const groups = [];
  for (const danger of RECOVERY_DANGERS) {
    for (const skill of RECOVERY_SKILLS) {
      for (const route of RECOVERY_ROUTES) {
        for (let run = 0; run < 2; run++) {
          const cohort = pairs.filter((p) =>
            p.danger === danger && p.skill === skill && p.route === route);
          const summarize = (id) => {
            const items = cohort.map((p) => p[id][run]);
            return {
              n: items.length,
              wins: items.reduce((s, p) => s + p.won, 0),
              objectives: items.reduce((s, p) => s + p.completed, 0),
              hurt: round(mean(items, "hurt")),
              hp: round(mean(items, "hp")),
              stones: round(mean(items, "stones")),
              objectiveStones: round(mean(items, "objectiveStones")),
              guardDamage: round(mean(items, "guardDamage")),
              firstContact: round(mean(items.filter((p) => p.firstContact !== null), "firstContact")),
            };
          };
          groups.push({
            danger, skill, route, sortie: run + 1,
            safe: summarize("safe"),
            salvage: summarize("salvage"),
          });
        }
      }
    }
  }
  return { seeds, totalPairs: pairs.length, totalBattles: pairs.length * 4, groups, pairs };
}

// prettier-ignore
export function assertRecoveryMatrix(report) {
  if (report.totalPairs !== report.seeds * 3 * 2 * RECOVERY_ROUTES.length ||
    report.totalBattles !== report.totalPairs * 4) {
    throw new Error("Paired 2L-A matrix cardinality violated");
  }
  for (const pair of report.pairs) {
    for (let run = 0; run < 2; run++) {
      const a = pair.safe[run];
      const b = pair.salvage[run];
      if (a.day !== run + 1 || b.day !== run + 1 ||
        a.objectiveStones !== 0 || a.guardCount !== 0 ||
        (b.objectiveStones > 0 && (!b.won || !b.completed)) ||
        b.objectiveStones > SITE.rewardStones ||
        b.stones > SORTIE.rewards.baseStonesOnWin +
          SORTIE.rewards.maxShardStones + SITE.rewardStones) {
        throw new Error("Invalid paired recovery rewards");
      }
    }
  }
  return true;
}

// prettier-ignore
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const count = Number(process.argv.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] ?? 40);
  const report = runRecoveryMatrix(count);
  assertRecoveryMatrix(report);
  console.log(JSON.stringify({
    seeds: report.seeds,
    totalPairs: report.totalPairs,
    totalBattles: report.totalBattles,
    groups: report.groups,
  }, null, 2));
}
