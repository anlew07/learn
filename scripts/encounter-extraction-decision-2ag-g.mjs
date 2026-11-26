import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  DURATION_TICKS,
  chooseSortieSkill,
  createSortie,
  retreatSortie,
  stepSortie,
} from "../src/systems/sortie-sim.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";
import { replaySortieTrace } from "../src/systems/sortie-trace.js";

const SEED_COUNT = 40;
const DANGER_BANDS = [0, 45, 80];
const STRATEGIES = [
  { id: "extract-now", label: "目标完成立即撤离", delaySeconds: 0 },
  { id: "extract-after-15s", label: "目标完成后继续 15 秒", delaySeconds: 15 },
  { id: "extract-after-30s", label: "目标完成后继续 30 秒", delaySeconds: 30 },
  { id: "hold-to-end", label: "继续战斗至结束", delaySeconds: null },
];

export function previewExtractionDecisionRewards(battle) {
  const baseline = previewSortieRewards(battle);
  if (!baseline) return null;
  const missionCompleted =
    battle.mission?.id === "salvage" && battle.mission.status === "completed";
  const canBankObjective =
    missionCompleted && ["won", "retreated"].includes(battle.outcome);
  const candidateObjectiveStones = canBankObjective
    ? SORTIE.mission.rewardStones
    : 0;
  const candidateStones =
    baseline.stones - baseline.objectiveStones + candidateObjectiveStones;
  return Object.freeze({
    ...baseline,
    candidateObjectiveStones,
    candidateStones,
    candidateDeltaStones: candidateStones - baseline.stones,
  });
}

function inputFor(battle) {
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
    missionStatus: battle.mission.status,
    completedTick: battle.mission.completedTick,
    collectedShards: battle.collectedShards,
    defeated: battle.defeated,
    hurt: battle.hurt,
    hpRemaining: battle.hero.hp,
  };
}

function runBattle(seed, danger, strategy) {
  const battle = createSortie(seed, danger, 0, "salvage");
  const actions = [];
  let objectiveCompletedTick = null;
  let guard = 0;

  while (battle.outcome === "running" && guard < DURATION_TICKS + 4) {
    guard++;
    if (battle.skillChoicePending) {
      const choice = chooseSortieSkill(battle, "rune");
      if (!choice.ok) throw new Error("Could not choose the fixed rune skill");
      actions.push(["skill", "rune"]);
      continue;
    }

    const input = inputFor(battle);
    stepSortie(battle, input);
    actions.push(["tick", input.x, input.y]);

    if (
      objectiveCompletedTick === null &&
      battle.mission.status === "completed"
    ) {
      objectiveCompletedTick = battle.mission.completedTick ?? battle.tick;
    }

    if (
      objectiveCompletedTick !== null &&
      strategy.delaySeconds !== null &&
      battle.outcome === "running" &&
      battle.tick - objectiveCompletedTick >=
        strategy.delaySeconds * SORTIE.ticksPerSecond
    ) {
      const retreat = retreatSortie(battle);
      if (!retreat.ok) throw new Error("Voluntary extraction was rejected");
      actions.push(["retreat"]);
    }
  }

  if (battle.outcome === "running") {
    throw new Error("Battle exceeded the fixed tick budget: " + seed);
  }

  const replay = replaySortieTrace(seed, danger, actions, 0, "salvage", "auto", 1);
  if (!replay.ok) {
    throw new Error("Authoritative replay failed: " + seed + " / " + strategy.id);
  }
  if (
    JSON.stringify(replaySignature(replay.battle)) !==
    JSON.stringify(replaySignature(battle))
  ) {
    throw new Error("Replay drift: " + seed + " / " + strategy.id);
  }

  const rewards = previewExtractionDecisionRewards(battle);
  return {
    seed,
    danger,
    strategy: strategy.id,
    outcome: battle.outcome,
    survivedSeconds: rewards.survivedSeconds,
    objectiveCompleted: battle.mission.status === "completed",
    objectiveCompletedTick,
    collectedShards: rewards.collectedShards,
    defeated: rewards.defeated,
    hurt: rewards.hurt,
    hpRemaining: rewards.hpRemaining,
    shardStones: rewards.shardStones,
    baselineObjectiveStones: rewards.objectiveStones,
    candidateObjectiveStones: rewards.candidateObjectiveStones,
    baselineStones: rewards.stones,
    candidateStones: rewards.candidateStones,
    candidateDeltaStones: rewards.candidateDeltaStones,
    experience: rewards.experience,
    progress: rewards.progress,
  };
}

function average(samples, key) {
  return Number(
    (samples.reduce((total, sample) => total + sample[key], 0) / samples.length).toFixed(2),
  );
}

function summarize(samples) {
  return {
    sampleCount: samples.length,
    objectiveCompleted: samples.filter((sample) => sample.objectiveCompleted).length,
    outcomes: {
      won: samples.filter((sample) => sample.outcome === "won").length,
      lost: samples.filter((sample) => sample.outcome === "lost").length,
      retreated: samples.filter((sample) => sample.outcome === "retreated").length,
    },
    avgSurvivedSeconds: average(samples, "survivedSeconds"),
    avgCollectedShards: average(samples, "collectedShards"),
    avgDefeated: average(samples, "defeated"),
    avgHurt: average(samples, "hurt"),
    avgHpRemaining: average(samples, "hpRemaining"),
    avgShardStones: average(samples, "shardStones"),
    avgBaselineStones: average(samples, "baselineStones"),
    avgCandidateStones: average(samples, "candidateStones"),
    avgCandidateObjectiveStones: average(samples, "candidateObjectiveStones"),
    avgCandidateDeltaStones: average(samples, "candidateDeltaStones"),
    totalExperience: samples.reduce((total, sample) => total + sample.experience, 0),
    totalProgress: samples.reduce((total, sample) => total + sample.progress, 0),
  };
}

function main() {
  const samples = [];
  for (const danger of DANGER_BANDS) {
    for (const strategy of STRATEGIES) {
      for (let seed = 1; seed <= SEED_COUNT; seed++) {
        samples.push(
          runBattle("2AG-G-" + seed, danger, strategy),
        );
      }
    }
  }

  const results = {};
  for (const danger of DANGER_BANDS) {
    results["D" + danger] = {};
    for (const strategy of STRATEGIES) {
      results["D" + danger][strategy.id] = summarize(
        samples.filter(
          (sample) => sample.danger === danger && sample.strategy === strategy.id,
        ),
      );
    }
  }

  const pairedAgainstHold = {};
  for (const danger of DANGER_BANDS) {
    const hold = results["D" + danger]["hold-to-end"];
    pairedAgainstHold["D" + danger] = {};
    for (const strategy of STRATEGIES.filter((item) => item.delaySeconds !== null)) {
      const current = results["D" + danger][strategy.id];
      pairedAgainstHold["D" + danger][strategy.id] = {
        candidateStonesDelta: Number(
          (current.avgCandidateStones - hold.avgCandidateStones).toFixed(2),
        ),
        collectedShardsDelta: Number(
          (current.avgCollectedShards - hold.avgCollectedShards).toFixed(2),
        ),
        survivedSecondsDelta: Number(
          (current.avgSurvivedSeconds - hold.avgSurvivedSeconds).toFixed(2),
        ),
        lossesDelta: current.outcomes.lost - hold.outcomes.lost,
        retreats: current.outcomes.retreated,
      };
    }
  }

  const report = {
    experiment:
      "2AG-G: recovery objective completion and voluntary extraction decision",
    seedCount: SEED_COUNT,
    totalBattles: samples.length,
    dangers: DANGER_BANDS,
    strategies: STRATEGIES,
    candidateRule:
      "A completed salvage objective banks its +2 stones on voluntary retreat or victory; death still forfeits the objective bonus.",
    results,
    pairedAgainstHold,
    caveat:
      "Candidate rewards are calculated in this isolated report only; the official reward and settlement code remain unchanged.",
  };
  console.log(JSON.stringify(report, null, 2));

  if (process.argv.includes("--assert")) {
    if (samples.length !== SEED_COUNT * DANGER_BANDS.length * STRATEGIES.length) {
      throw new Error("Unexpected total sample count");
    }
    for (const sample of samples) {
      if (!sample.objectiveCompleted) {
        throw new Error("Recovery objective did not complete: " + sample.seed);
      }
      if (sample.outcome === "retreated" && sample.candidateObjectiveStones !== SORTIE.mission.rewardStones) {
        throw new Error("Completed extraction did not bank the candidate objective reward");
      }
      if (sample.outcome === "lost" && sample.candidateObjectiveStones !== 0) {
        throw new Error("Death incorrectly banked the candidate objective reward");
      }
      if (sample.outcome === "won" && sample.candidateObjectiveStones !== SORTIE.mission.rewardStones) {
        throw new Error("Victory did not retain the objective reward");
      }
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
