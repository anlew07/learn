import {
  createSortie,
  DURATION_TICKS,
  stepSortie,
  chooseSortieSkill,
  castSortieSkill,
} from "../src/systems/sortie-sim.js";
import {
  getAutonomousEncounterDecision,
} from "../src/systems/encounter-controller.js";
import { replaySortieTrace } from "../src/systems/sortie-trace.js";

const SEEDS = 40;
const DANGER_BANDS = [0, 45, 80];

function summarize(battle) {
  return {
    outcome: battle.outcome,
    tick: battle.tick,
    hp: battle.hero.hp,
    defeated: battle.defeated,
    hurt: battle.hurt,
    collectedShards: battle.collectedShards,
    thunderHits: battle.thunderHits,
    shieldBlocks: battle.shieldBlocks,
  };
}

function runMode(seed, danger, mode) {
  const battle = createSortie(seed, danger, 0, "safe", {
    skillReleaseMode: mode,
  });
  const actions = [];
  let casts = 0;
  let guard = 0;

  while (battle.outcome === "running" && guard < DURATION_TICKS + 2) {
    const decision = getAutonomousEncounterDecision(battle);
    if (decision.skillId) {
      const chosen = chooseSortieSkill(battle, decision.skillId);
      if (!chosen.ok) {
        throw new Error("AI skill choice failed: " + chosen.error);
      }
      actions.push(["skill", decision.skillId]);
    } else {
      if (decision.castSkill) {
        const cast = castSortieSkill(battle);
        if (cast.ok) {
          casts++;
          actions.push(["cast", battle.skillId]);
        }
      }
      stepSortie(battle, decision.input);
      actions.push(["tick", decision.input.x, decision.input.y]);
    }
    guard++;
  }

  const result = summarize(battle);
  const replay = replaySortieTrace(seed, danger, actions, 0, "safe", mode);
  if (
    !replay.ok ||
    JSON.stringify(summarize(replay.battle)) !== JSON.stringify(result)
  ) {
    throw new Error(
      "Authoritative replay drift for " + seed + " (" + mode + ")",
    );
  }
  return { ...result, casts };
}

function aggregate(samples) {
  const count = samples.length;
  const sum = (key) => samples.reduce((total, item) => total + item[key], 0);
  const wins = samples.filter((item) => item.outcome === "won").length;
  return {
    wins,
    losses: samples.filter((item) => item.outcome === "lost").length,
    retreats: samples.filter((item) => item.outcome === "retreated").length,
    winRatePct: Number(((wins / count) * 100).toFixed(1)),
    avgHpRemaining: Number((sum("hp") / count).toFixed(2)),
    avgDefeated: Number((sum("defeated") / count).toFixed(2)),
    totalHurt: sum("hurt"),
    totalShards: sum("collectedShards"),
    totalThunderHits: sum("thunderHits"),
    totalShieldBlocks: sum("shieldBlocks"),
    totalManualCasts: sum("casts"),
  };
}

const samples = { auto: [], manual: [] };
const paired = [];
for (let index = 0; index < SEEDS; index++) {
  const danger = DANGER_BANDS[index % DANGER_BANDS.length];
  const seed = "2ag-skill-release-report-" + index;
  const auto = runMode(seed, danger, "auto");
  const manual = runMode(seed, danger, "manual");
  samples.auto.push(auto);
  samples.manual.push(manual);
  paired.push({
    seed,
    danger,
    winDelta: Number(manual.outcome === "won") - Number(auto.outcome === "won"),
    hpDelta: manual.hp - auto.hp,
    defeatedDelta: manual.defeated - auto.defeated,
    hurtDelta: manual.hurt - auto.hurt,
    shardDelta: manual.collectedShards - auto.collectedShards,
  });
}

const report = {
  experiment: "2AG-B manual versus automatic skill release",
  seeds: SEEDS,
  dangerBands: DANGER_BANDS,
  control: "same deterministic AI movement; only skill release timing differs",
  modes: {
    auto: aggregate(samples.auto),
    manual: aggregate(samples.manual),
  },
  pairedDelta: {
    manualWins: paired.filter((item) => item.winDelta > 0).length,
    autoWins: paired.filter((item) => item.winDelta < 0).length,
    sameOutcome: paired.filter((item) => item.winDelta === 0).length,
    avgHpDelta: Number(
      (
        paired.reduce((total, item) => total + item.hpDelta, 0) / SEEDS
      ).toFixed(2),
    ),
    totalDefeatedDelta: paired.reduce(
      (total, item) => total + item.defeatedDelta,
      0,
    ),
    totalHurtDelta: paired.reduce((total, item) => total + item.hurtDelta, 0),
    totalShardDelta: paired.reduce((total, item) => total + item.shardDelta, 0),
  },
  caveat:
    "AI timing comparison only; " +
    "it does not replace real-player usability testing.",
};

if (process.argv.includes("--assert")) {
  if (report.modes.manual.totalManualCasts < 1) {
    throw new Error("Manual mode was not exercised by the AI policy.");
  }
  if (report.modes.auto.totalManualCasts !== 0) {
    throw new Error("Automatic mode unexpectedly recorded manual casts.");
  }
}

console.log(JSON.stringify(report, null, 2));
