import {
  createSortie,
  DURATION_TICKS,
  stepSortie,
  chooseSortieSkill,
  SORTIE,
} from "../src/systems/sortie-sim.js";
import { replaySortieTrace } from "../src/systems/sortie-trace.js";

const SEEDS = 40;
const LEVELS = [1, 2, 3, 4];
const DANGER_BANDS = [0, 45, 80, 100];
const CONTROLS = ["stationary", "salvage-hold"];

function inputFor(control, battle) {
  if (control === "stationary") return { x: 0, y: 0 };
  const dx = SORTIE.mission.x - battle.hero.x;
  const dy = SORTIE.mission.y - battle.hero.y;
  const range = Math.hypot(dx, dy);
  if (range <= SORTIE.mission.collectRadius * 0.5) return { x: 0, y: 0 };
  return { x: dx / range, y: dy / range };
}

function runBattle(seed, danger, combatLevel, control) {
  const missionId = control === "salvage-hold" ? "salvage" : "safe";
  const battle = createSortie(seed, danger, 0, missionId, { combatLevel });
  const actions = [];
  let guard = 0;
  while (battle.outcome === "running" && guard < DURATION_TICKS + 2) {
    if (battle.skillChoicePending) {
      const chosen = chooseSortieSkill(battle, "thunder");
      if (!chosen.ok) throw new Error("Skill choice failed: " + chosen.error);
      actions.push(["skill", "thunder"]);
    } else {
      const input = inputFor(control, battle);
      stepSortie(battle, input);
      actions.push(["tick", input.x, input.y]);
    }
    guard++;
  }
  if (battle.outcome === "running") throw new Error("Battle exceeded fixed tick budget: " + seed);
  const result = {
    outcome: battle.outcome, maxHp: battle.maxHp, hpRemaining: battle.hero.hp,
    hpRatio: Number((battle.hero.hp / battle.maxHp).toFixed(3)), hurt: battle.hurt,
    defeated: battle.defeated, collectedShards: battle.collectedShards,
    missionStatus: battle.mission.status, guardCount: battle.mission.guardCount,
    guardDamage: battle.mission.guardDamage, guardTriggered: battle.mission.guardTriggeredTick !== null,
  };
  const replay = replaySortieTrace(seed, danger, actions, 0, missionId, "auto", combatLevel);
  if (!replay.ok) throw new Error("Trace replay failed: " + seed + " / " + control);
  const b = replay.battle;
  const replayResult = {
    outcome: b.outcome, maxHp: b.maxHp, hpRemaining: b.hero.hp, hurt: b.hurt,
    defeated: b.defeated, collectedShards: b.collectedShards, missionStatus: b.mission.status,
    guardCount: b.mission.guardCount, guardDamage: b.mission.guardDamage,
    guardTriggered: b.mission.guardTriggeredTick !== null,
  };
  const expected = {
    outcome: result.outcome, maxHp: result.maxHp, hpRemaining: result.hpRemaining,
    hurt: result.hurt, defeated: result.defeated, collectedShards: result.collectedShards,
    missionStatus: result.missionStatus, guardCount: result.guardCount,
    guardDamage: result.guardDamage, guardTriggered: result.guardTriggered,
  };
  if (JSON.stringify(replayResult) !== JSON.stringify(expected)) throw new Error("Replay drift: " + seed);
  return result;
}

function aggregate(samples) {
  const sum = (key) => samples.reduce((total, item) => total + item[key], 0);
  const wins = samples.filter((item) => item.outcome === "won").length;
  return {
    samples: samples.length, wins,
    losses: samples.filter((item) => item.outcome === "lost").length,
    winRatePct: Number((wins / samples.length * 100).toFixed(1)),
    avgMaxHp: Number((sum("maxHp") / samples.length).toFixed(2)),
    avgHpRemaining: Number((sum("hpRemaining") / samples.length).toFixed(2)),
    avgHpRatio: Number((sum("hpRatio") / samples.length).toFixed(3)),
    avgHurt: Number((sum("hurt") / samples.length).toFixed(2)),
    avgDefeated: Number((sum("defeated") / samples.length).toFixed(2)),
    avgShards: Number((sum("collectedShards") / samples.length).toFixed(2)),
    missionTriggered: samples.filter((item) => item.guardTriggered).length,
    missionCompleted: samples.filter((item) => item.missionStatus === "completed").length,
    avgGuardCount: Number((sum("guardCount") / samples.length).toFixed(2)),
    avgGuardDamage: Number((sum("guardDamage") / samples.length).toFixed(2)),
  };
}

const results = {};
for (const control of CONTROLS) {
  results[control] = {};
  for (const danger of DANGER_BANDS) {
    results[control][danger] = {};
    for (const level of LEVELS) {
      const samples = [];
      for (let index = 0; index < SEEDS; index++) {
        samples.push(runBattle("2ag-e-pressure-" + danger + "-" + index, danger, level, control));
      }
      results[control][danger][level] = aggregate(samples);
    }
  }
}

const pairedAgainstLevel1 = {};
for (const control of CONTROLS) {
  pairedAgainstLevel1[control] = {};
  for (const danger of DANGER_BANDS) {
    pairedAgainstLevel1[control][danger] = {};
    for (const level of LEVELS.slice(1)) {
      const base = results[control][danger][1];
      const current = results[control][danger][level];
      pairedAgainstLevel1[control][danger][level] = {
        winRateDelta: Number((current.winRatePct - base.winRatePct).toFixed(1)),
        avgHpRemainingDelta: Number((current.avgHpRemaining - base.avgHpRemaining).toFixed(2)),
        avgHurtDelta: Number((current.avgHurt - base.avgHurt).toFixed(2)),
        avgDefeatedDelta: Number((current.avgDefeated - base.avgDefeated).toFixed(2)),
        avgShardsDelta: Number((current.avgShards - base.avgShards).toFixed(2)),
      };
    }
  }
}

const report = {
  experiment: "2AG-E-B paired high-pressure validation of world-level health",
  seedsPerDangerAndLevel: SEEDS, dangerBands: DANGER_BANDS, levels: LEVELS,
  controls: {
    stationary: "fixed position with a constant thunder build",
    salvageHold: "move to the recovery site, trigger its guards, hold position, and keep the same thunder build",
  },
  totalBattles: CONTROLS.length * DANGER_BANDS.length * LEVELS.length * SEEDS,
  results, pairedAgainstLevel1,
  caveat: "Deterministic pressure scripts are not substitutes for real mobile-player testing.",
};

if (process.argv.includes("--assert")) {
  for (const control of CONTROLS) for (const danger of DANGER_BANDS) for (const level of LEVELS) {
    const sample = results[control][danger][level];
    if (sample.samples !== SEEDS || sample.avgMaxHp !== 7 + level) {
      throw new Error("Invalid sample count or health scaling: " + control + " D" + danger + " Lv" + level);
    }
  }
  for (const level of LEVELS) {
    if (results["salvage-hold"][100][level].missionTriggered !== SEEDS) {
      throw new Error("The salvage-hold pressure case did not trigger all guards at Lv" + level);
    }
  }
}
console.log(JSON.stringify(report, null, 2));
