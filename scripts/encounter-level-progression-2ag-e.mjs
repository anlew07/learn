import {
  createSortie,
  DURATION_TICKS,
  stepSortie,
  chooseSortieSkill,
} from "../src/systems/sortie-sim.js";
import { getAutonomousEncounterDecision } from "../src/systems/encounter-controller.js";
import { replaySortieTrace } from "../src/systems/sortie-trace.js";

const SEEDS = 40;
const LEVELS = [1, 2, 3, 4];
const DANGER_BANDS = [0, 45, 80];
const CONTROLS = ["ai", "scripted-wander"];

function runBattle(seed, danger, combatLevel, control) {
  const battle = createSortie(seed, danger, 0, "safe", { combatLevel });
  const actions = [];
  let guard = 0;

  while (battle.outcome === "running" && guard < DURATION_TICKS + 2) {
    if (battle.skillChoicePending) {
      const decision =
        control === "ai"
          ? getAutonomousEncounterDecision(battle)
          : {
              skillId: battle.hero.hp <= Math.ceil(battle.maxHp / 2) ? "rune" : "thunder",
            };
      const chosen = chooseSortieSkill(battle, decision.skillId);
      if (!chosen.ok) throw new Error("Skill choice failed: " + chosen.error);
      actions.push(["skill", decision.skillId]);
    } else {
      const input =
        control === "ai"
          ? getAutonomousEncounterDecision(battle).input
          : {
              x: Math.sin(battle.tick / 67),
              y: Math.cos(battle.tick / 83),
            };
      stepSortie(battle, input);
      actions.push(["tick", input.x, input.y]);
    }
    guard++;
  }

  const result = {
    outcome: battle.outcome,
    combatLevel: battle.combatLevel,
    maxHp: battle.maxHp,
    hpRemaining: battle.hero.hp,
    hpRatio: Number((battle.hero.hp / battle.maxHp).toFixed(3)),
    hurt: battle.hurt,
    defeated: battle.defeated,
    collectedShards: battle.collectedShards,
  };
  const replay = replaySortieTrace(seed, danger, actions, 0, "safe", "auto", combatLevel);
  const replayResult = replay.ok
    ? {
        outcome: replay.battle.outcome,
        combatLevel: replay.battle.combatLevel,
        maxHp: replay.battle.maxHp,
        hpRemaining: replay.battle.hero.hp,
        hurt: replay.battle.hurt,
        defeated: replay.battle.defeated,
        collectedShards: replay.battle.collectedShards,
      }
    : null;
  const expectedResult = {
    outcome: result.outcome,
    combatLevel: result.combatLevel,
    maxHp: result.maxHp,
    hpRemaining: result.hpRemaining,
    hurt: result.hurt,
    defeated: result.defeated,
    collectedShards: result.collectedShards,
  };
  if (!replay.ok || JSON.stringify(replayResult) !== JSON.stringify(expectedResult)) {
    throw new Error("Authoritative replay drift: " + seed + " / Lv" + combatLevel);
  }
  return result;
}

function aggregate(samples) {
  const count = samples.length;
  const sum = (key) => samples.reduce((total, item) => total + item[key], 0);
  const wins = samples.filter((item) => item.outcome === "won").length;
  return {
    samples: count,
    wins,
    losses: samples.filter((item) => item.outcome === "lost").length,
    retreats: samples.filter((item) => item.outcome === "retreated").length,
    winRatePct: Number(((wins / count) * 100).toFixed(1)),
    avgMaxHp: Number((sum("maxHp") / count).toFixed(2)),
    avgHpRemaining: Number((sum("hpRemaining") / count).toFixed(2)),
    avgHpRatio: Number((sum("hpRatio") / count).toFixed(3)),
    totalHurt: sum("hurt"),
    totalDefeated: sum("defeated"),
    totalShards: sum("collectedShards"),
  };
}

const samples = {};
for (const control of CONTROLS) {
  samples[control] = {};
  for (const level of LEVELS) {
    const runs = [];
    for (let index = 0; index < SEEDS; index++) {
      const danger = DANGER_BANDS[index % DANGER_BANDS.length];
      const seed = "2ag-e-level-" + index;
      runs.push(runBattle(seed, danger, level, control));
    }
    samples[control][level] = aggregate(runs);
  }
}

const pairedAgainstLevel1 = {};
for (const control of CONTROLS) {
  pairedAgainstLevel1[control] = {};
  for (const level of LEVELS) {
    if (level === 1) continue;
    pairedAgainstLevel1[control][level] = {
      avgHpRemainingDelta: Number(
        (samples[control][level].avgHpRemaining - samples[control][1].avgHpRemaining).toFixed(2),
      ),
      winRateDelta: Number(
        (samples[control][level].winRatePct - samples[control][1].winRatePct).toFixed(1),
      ),
      totalHurtDelta: samples[control][level].totalHurt - samples[control][1].totalHurt,
    };
  }
}

const report = {
  experiment: "2AG-E effective world level -> formal encounter health",
  seeds: SEEDS,
  dangerBands: DANGER_BANDS,
  levels: LEVELS,
  controls: {
    ai: "existing deterministic encounter AI",
    scriptedWander: "deterministic sinusoidal movement; not a substitute for human play",
  },
  results: samples,
  pairedAgainstLevel1,
};

if (process.argv.includes("--assert")) {
  for (const control of CONTROLS) {
    for (const level of LEVELS) {
      const result = samples[control][level];
      if (result.samples !== SEEDS || result.avgMaxHp !== 7 + level) {
        throw new Error("Unexpected sample count or health scaling at " + control + " Lv" + level);
      }
    }
  }
}

console.log(JSON.stringify(report, null, 2));
