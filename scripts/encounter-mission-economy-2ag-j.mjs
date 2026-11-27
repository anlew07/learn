import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  chooseSortieSkill,
  createSortie,
  DURATION_TICKS,
  retreatSortie,
  stepSortie,
} from "../src/systems/sortie-sim.js";
import { getAutonomousEncounterDecision } from "../src/systems/encounter-controller.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";
import { replaySortieTrace } from "../src/systems/sortie-trace.js";
import { experimentInput } from "./sortie-experiment.mjs";

export const SEED_COUNT = 40;
export const DANGER_BANDS = Object.freeze([0, 45, 80]);
export const COMBAT_LEVELS = Object.freeze([1, 4]);
export const MISSION_ECONOMY_PROFILES = Object.freeze([
  Object.freeze({
    id: "safe-ai",
    missionId: "safe",
    controller: "ai",
    delaySeconds: null,
    label: "稳妥巡护 · AI",
  }),
  Object.freeze({
    id: "safe-player",
    missionId: "safe",
    controller: "player",
    delaySeconds: null,
    label: "稳妥巡护 · 玩家路线",
  }),
  Object.freeze({
    id: "salvage-now",
    missionId: "salvage",
    controller: "player",
    delaySeconds: 0,
    label: "险地回收 · 完成即撤离",
  }),
  Object.freeze({
    id: "salvage-after-15s",
    missionId: "salvage",
    controller: "player",
    delaySeconds: 15,
    label: "险地回收 · 延迟 15 秒撤离",
  }),
  Object.freeze({
    id: "salvage-after-30s",
    missionId: "salvage",
    controller: "player",
    delaySeconds: 30,
    label: "险地回收 · 延迟 30 秒撤离",
  }),
  Object.freeze({
    id: "salvage-hold",
    missionId: "salvage",
    controller: "player",
    delaySeconds: null,
    label: "险地回收 · 坚守到底",
  }),
]);

function missionInput(battle) {
  const dx = battle.mission.x - battle.hero.x;
  const dy = battle.mission.y - battle.hero.y;
  const range = Math.hypot(dx, dy);
  if (range <= battle.mission.collectRadius * 0.5) return { x: 0, y: 0 };
  return { x: dx / range, y: dy / range };
}

function replaySignature(battle) {
  return {
    outcome: battle.outcome,
    tick: battle.tick,
    missionId: battle.mission?.id ?? "safe",
    missionStatus: battle.mission?.status ?? "inactive",
    completedTick: battle.mission?.completedTick ?? null,
    progressTicks: battle.mission?.progressTicks ?? 0,
    guardCount: battle.mission?.guardCount ?? 0,
    guardDamage: battle.mission?.guardDamage ?? 0,
    collectedShards: battle.collectedShards,
    defeated: battle.defeated,
    hurt: battle.hurt,
    hpRemaining: battle.hero.hp,
  };
}

function average(samples, key) {
  if (!samples.length) return 0;
  return Number(
    (samples.reduce((total, sample) => total + sample[key], 0) / samples.length).toFixed(3),
  );
}

export function runMissionEconomyScenario(seed, danger, combatLevel, profileId) {
  const profile = MISSION_ECONOMY_PROFILES.find((item) => item.id === profileId);
  if (!profile) throw new Error("Unknown mission economy profile: " + profileId);

  const battle = createSortie(seed, danger, 0, profile.missionId, { combatLevel });
  const actions = [];
  let objectiveCompletedTick = null;
  let guard = 0;

  while (battle.outcome === "running" && guard < DURATION_TICKS + 4) {
    guard++;
    if (battle.skillChoicePending) {
      const skillId =
        profile.controller === "ai"
          ? getAutonomousEncounterDecision(battle).skillId
          : "rune";
      if (!skillId) throw new Error("AI did not select a skill: " + seed);
      const choice = chooseSortieSkill(battle, skillId);
      if (!choice.ok) throw new Error("Skill choice failed: " + choice.error);
      actions.push(["skill", skillId]);
      continue;
    }

    const decision =
      profile.controller === "ai" ? getAutonomousEncounterDecision(battle) : null;
    const input =
      decision?.input ??
      (profile.missionId === "salvage" && battle.mission.status !== "completed"
        ? missionInput(battle)
        : experimentInput(battle, "pickup"));
    stepSortie(battle, input);
    actions.push(["tick", input.x, input.y]);

    if (objectiveCompletedTick === null && battle.mission.status === "completed") {
      objectiveCompletedTick = battle.mission.completedTick ?? battle.tick;
    }

    if (
      profile.delaySeconds !== null &&
      objectiveCompletedTick !== null &&
      battle.outcome === "running" &&
      battle.tick - objectiveCompletedTick >= profile.delaySeconds * SORTIE.ticksPerSecond
    ) {
      const retreat = retreatSortie(battle);
      if (!retreat.ok) throw new Error("Voluntary extraction was rejected: " + profile.id);
      actions.push(["retreat"]);
    }
  }

  if (battle.outcome === "running") {
    throw new Error("Battle exceeded the fixed tick budget: " + seed + " / " + profile.id);
  }

  const replay = replaySortieTrace(
    seed,
    danger,
    actions,
    0,
    profile.missionId,
    "auto",
    combatLevel,
  );
  if (!replay.ok) throw new Error("Authoritative replay failed: " + seed + " / " + profile.id);
  if (
    JSON.stringify(replaySignature(replay.battle)) !== JSON.stringify(replaySignature(battle))
  ) {
    throw new Error("Replay drift: " + seed + " / " + profile.id);
  }

  const rewards = previewSortieRewards(battle, {
    bankObjectiveOnRetreat: profile.missionId === "salvage",
  });
  const survivedSeconds = rewards.survivedSeconds;
  return {
    seed,
    danger,
    combatLevel,
    profileId,
    missionId: profile.missionId,
    controller: profile.controller,
    outcome: rewards.outcome,
    survivedSeconds,
    objectiveCompleted: battle.mission.status === "completed",
    objectiveCompletedSeconds:
      objectiveCompletedTick === null
        ? null
        : Number((objectiveCompletedTick / SORTIE.ticksPerSecond).toFixed(2)),
    objectiveGuardCount: rewards.objectiveGuardCount,
    objectiveGuardDamage: rewards.objectiveGuardDamage,
    collectedShards: rewards.collectedShards,
    defeated: rewards.defeated,
    hurt: rewards.hurt,
    hpRemaining: rewards.hpRemaining,
    maxHp: rewards.maxHp,
    hpRatio: Number((rewards.hpRemaining / Math.max(1, rewards.maxHp)).toFixed(3)),
    shardStones: rewards.shardStones,
    baseStones: rewards.baseStones,
    objectiveStones: rewards.objectiveStones,
    stones: rewards.stones,
    stonesPerBattleMinute:
      survivedSeconds > 0
        ? Number((rewards.stones / (survivedSeconds / 60)).toFixed(3))
        : 0,
    experience: rewards.experience,
    progress: rewards.progress,
    actionCount: actions.length,
  };
}

export function summarizeMissionEconomySamples(samples) {
  const count = samples.length;
  if (!count) throw new Error("Cannot summarize an empty sample set");
  return {
    samples: count,
    wins: samples.filter((sample) => sample.outcome === "won").length,
    losses: samples.filter((sample) => sample.outcome === "lost").length,
    retreats: samples.filter((sample) => sample.outcome === "retreated").length,
    objectiveCompleted: samples.filter((sample) => sample.objectiveCompleted).length,
    winRatePct: Number(
      ((samples.filter((sample) => sample.outcome === "won").length / count) * 100).toFixed(1),
    ),
    avgSurvivedSeconds: average(samples, "survivedSeconds"),
    avgCollectedShards: average(samples, "collectedShards"),
    avgDefeated: average(samples, "defeated"),
    avgHurt: average(samples, "hurt"),
    avgHpRemaining: average(samples, "hpRemaining"),
    avgHpRatio: average(samples, "hpRatio"),
    avgShardStones: average(samples, "shardStones"),
    avgBaseStones: average(samples, "baseStones"),
    avgObjectiveStones: average(samples, "objectiveStones"),
    avgStones: average(samples, "stones"),
    avgStonesPerBattleMinute: average(samples, "stonesPerBattleMinute"),
    totalExperience: samples.reduce((total, sample) => total + sample.experience, 0),
    totalProgress: samples.reduce((total, sample) => total + sample.progress, 0),
  };
}

function delta(current, baseline, key) {
  return Number((current[key] - baseline[key]).toFixed(3));
}

export function runMissionEconomyExperiment() {
  const samples = [];
  for (const combatLevel of COMBAT_LEVELS) {
    for (const danger of DANGER_BANDS) {
      for (let index = 0; index < SEED_COUNT; index++) {
        const seed = "2ag-f-build-" + danger + "-" + index;
        for (const profile of MISSION_ECONOMY_PROFILES) {
          samples.push(runMissionEconomyScenario(seed, danger, combatLevel, profile.id));
        }
      }
    }
  }

  const results = {};
  const pairedAgainstSafeAI = {};
  const pairedAgainstSafePlayer = {};
  for (const combatLevel of COMBAT_LEVELS) {
    results["Lv" + combatLevel] = {};
    pairedAgainstSafeAI["Lv" + combatLevel] = {};
    pairedAgainstSafePlayer["Lv" + combatLevel] = {};
    for (const danger of DANGER_BANDS) {
      const group = samples.filter(
        (sample) => sample.combatLevel === combatLevel && sample.danger === danger,
      );
      results["Lv" + combatLevel]["D" + danger] = {};
      for (const profile of MISSION_ECONOMY_PROFILES) {
        results["Lv" + combatLevel]["D" + danger][profile.id] = summarizeMissionEconomySamples(
          group.filter((sample) => sample.profileId === profile.id),
        );
      }

      const safeAI = results["Lv" + combatLevel]["D" + danger]["safe-ai"];
      const safePlayer = results["Lv" + combatLevel]["D" + danger]["safe-player"];
      pairedAgainstSafeAI["Lv" + combatLevel]["D" + danger] = {};
      pairedAgainstSafePlayer["Lv" + combatLevel]["D" + danger] = {};
      const salvageProfiles = MISSION_ECONOMY_PROFILES.filter(
        (item) => item.missionId === "salvage",
      );
      for (const profile of salvageProfiles) {
        const current = results["Lv" + combatLevel]["D" + danger][profile.id];
        pairedAgainstSafeAI["Lv" + combatLevel]["D" + danger][profile.id] = {
          avgStonesDelta: delta(current, safeAI, "avgStones"),
          winRateDeltaPct: delta(current, safeAI, "winRatePct"),
          avgSecondsDelta: delta(current, safeAI, "avgSurvivedSeconds"),
          avgHpRatioDelta: delta(current, safeAI, "avgHpRatio"),
        };
        pairedAgainstSafePlayer["Lv" + combatLevel]["D" + danger][profile.id] = {
          avgStonesDelta: delta(current, safePlayer, "avgStones"),
          winRateDeltaPct: delta(current, safePlayer, "winRatePct"),
          avgSecondsDelta: delta(current, safePlayer, "avgSurvivedSeconds"),
          avgHpRatioDelta: delta(current, safePlayer, "avgHpRatio"),
        };
      }
    }
  }

  return {
    experiment: "2AG-J: safe patrol versus salvage mission economy and control cost",
    seedCount: SEED_COUNT,
    totalBattles: samples.length,
    dangerBands: DANGER_BANDS,
    combatLevels: COMBAT_LEVELS,
    profiles: MISSION_ECONOMY_PROFILES,
    results,
    pairedAgainstSafeAI,
    pairedAgainstSafePlayer,
    caveat:
      "Deterministic AI and scripted pickup routes are reproducible controls, not human mobile play. Battle-minute yield is simulated combat time, not wall-clock or campaign-day throughput.",
  };
}

function main() {
  const report = runMissionEconomyExperiment();
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--assert")) {
    const allProfilesHaveSamples = Object.values(report.results).every((byDanger) =>
      Object.values(byDanger).every((byProfile) =>
        MISSION_ECONOMY_PROFILES.every((profile) => byProfile[profile.id].samples === SEED_COUNT),
      ),
    );
    if (!allProfilesHaveSamples) throw new Error("A paired profile is missing samples");
    for (const level of Object.keys(report.results)) {
      for (const danger of Object.keys(report.results[level])) {
        const byProfile = report.results[level][danger];
        if (
          byProfile["safe-ai"].avgObjectiveStones !== 0 ||
          byProfile["safe-player"].avgObjectiveStones !== 0
        ) {
          throw new Error("Safe patrol must never bank an objective reward");
        }
        const salvageProfiles = MISSION_ECONOMY_PROFILES.filter(
          (profile) => profile.missionId === "salvage",
        );
        for (const profile of salvageProfiles) {
          if (byProfile[profile.id].objectiveCompleted !== SEED_COUNT) {
            throw new Error(
              "Salvage objective completion drift: " +
                level +
                " / " +
                danger +
                " / " +
                profile.id,
            );
          }
        }
      }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
