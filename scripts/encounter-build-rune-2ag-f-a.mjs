import {
  createSortie,
  DURATION_TICKS,
  stepSortie,
  chooseSortieSkill,
} from "../src/systems/sortie-sim.js";
import { replaySortieTrace } from "../src/systems/sortie-trace.js";
import { SORTIE } from "../src/config/sortie-data.js";

const SEEDS = 40;
const DANGER_BANDS = [0, 45, 80, 100];
const CONTROLS = ["stationary", "salvage-hold"];
const BUILDS = [false, true];

function inputFor(control, battle) {
  if (control === "stationary") return { x: 0, y: 0 };
  const dx = SORTIE.mission.x - battle.hero.x;
  const dy = SORTIE.mission.y - battle.hero.y;
  const range = Math.hypot(dx, dy);
  if (range <= SORTIE.mission.collectRadius * 0.5) return { x: 0, y: 0 };
  return { x: dx / range, y: dy / range };
}

function runBattle(seed, danger, control, permanentRune) {
  const missionId = control === "salvage-hold" ? "salvage" : "safe";
  const battle = createSortie(seed, danger, 0, missionId, {
    combatLevel: 1,
    permanentRune,
  });
  const actions = [];
  let guard = 0;

  while (battle.outcome === "running" && guard < DURATION_TICKS + 2) {
    if (battle.skillChoicePending) {
      const selected = chooseSortieSkill(battle, "thunder");
      if (!selected.ok) throw new Error("Skill choice failed: " + selected.error);
      actions.push(["skill", "thunder"]);
    } else {
      const input = inputFor(control, battle);
      stepSortie(battle, input);
      actions.push(["tick", input.x, input.y]);
    }
    guard++;
  }

  if (battle.outcome === "running") {
    throw new Error("Battle exceeded fixed tick budget: " + seed + " / " + control);
  }

  const result = {
    outcome: battle.outcome,
    permanentRune: battle.permanentRune,
    hpRemaining: battle.hero.hp,
    maxHp: battle.maxHp,
    hurt: battle.hurt,
    shieldBlocks: battle.shieldBlocks,
    defeated: battle.defeated,
    collectedShards: battle.collectedShards,
    missionStatus: battle.mission.status,
    guardCount: battle.mission.guardCount,
    guardDamage: battle.mission.guardDamage,
    guardTriggered: battle.mission.guardTriggeredTick !== null,
  };

  const replay = replaySortieTrace(
    seed,
    danger,
    actions,
    0,
    missionId,
    "auto",
    1,
    permanentRune,
  );
  if (!replay.ok) throw new Error("Trace replay failed: " + seed + " / " + control);

  const replayBattle = replay.battle;
  const replayResult = {
    outcome: replayBattle.outcome,
    permanentRune: replayBattle.permanentRune,
    hpRemaining: replayBattle.hero.hp,
    maxHp: replayBattle.maxHp,
    hurt: replayBattle.hurt,
    shieldBlocks: replayBattle.shieldBlocks,
    defeated: replayBattle.defeated,
    collectedShards: replayBattle.collectedShards,
    missionStatus: replayBattle.mission.status,
    guardCount: replayBattle.mission.guardCount,
    guardDamage: replayBattle.mission.guardDamage,
    guardTriggered: replayBattle.mission.guardTriggeredTick !== null,
  };
  if (JSON.stringify(result) !== JSON.stringify(replayResult)) {
    throw new Error("Authoritative replay drift: " + seed + " / " + control);
  }

  return result;
}

function aggregate(samples) {
  const sum = (key) => samples.reduce((total, item) => total + item[key], 0);
  const wins = samples.filter((item) => item.outcome === "won").length;
  return {
    samples: samples.length,
    wins,
    losses: samples.filter((item) => item.outcome === "lost").length,
    winRatePct: Number(((wins / samples.length) * 100).toFixed(1)),
    avgHpRemaining: Number((sum("hpRemaining") / samples.length).toFixed(2)),
    avgHurt: Number((sum("hurt") / samples.length).toFixed(2)),
    avgShieldBlocks: Number((sum("shieldBlocks") / samples.length).toFixed(2)),
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
    for (const permanentRune of BUILDS) {
      const samples = [];
      for (let index = 0; index < SEEDS; index++) {
        const seed = "2ag-f-rune-" + danger + "-" + index;
        samples.push(runBattle(seed, danger, control, permanentRune));
      }
      results[control][danger][String(permanentRune)] = aggregate(samples);
    }
  }
}

const deltas = {};
for (const control of CONTROLS) {
  deltas[control] = {};
  for (const danger of DANGER_BANDS) {
    const base = results[control][danger]["false"];
    const powered = results[control][danger]["true"];
    deltas[control][danger] = {
      winRateDelta: Number((powered.winRatePct - base.winRatePct).toFixed(1)),
      avgHpRemainingDelta: Number((powered.avgHpRemaining - base.avgHpRemaining).toFixed(2)),
      avgHurtDelta: Number((powered.avgHurt - base.avgHurt).toFixed(2)),
      avgShieldBlocks: powered.avgShieldBlocks,
      avgDefeatedDelta: Number((powered.avgDefeated - base.avgDefeated).toFixed(2)),
      avgShardsDelta: Number((powered.avgShards - base.avgShards).toFixed(2)),
    };
  }
}

const report = {
  experiment: "2AG-F-A permanent rune opening shield",
  seedsPerDangerAndBuild: SEEDS,
  dangerBands: DANGER_BANDS,
  combatLevel: 1,
  fixedTemporarySkill: "thunder",
  controls: {
    stationary: "fixed position",
    salvageHold: "move to the recovery site, trigger its guards, then hold position",
  },
  totalBattles: CONTROLS.length * DANGER_BANDS.length * BUILDS.length * DANGER_BANDS.length * SEEDS,
  results,
  deltas,
  caveat: "Deterministic pressure scripts are not substitutes for real mobile-player testing.",
};

if (process.argv.includes("--assert")) {
  for (const control of CONTROLS) {
    for (const danger of DANGER_BANDS) {
      for (const permanentRune of BUILDS) {
        const sample = results[control][danger][String(permanentRune)];
        if (sample.samples !== SEEDS) {
          throw new Error("Invalid sample count: " + control + " D" + danger);
        }
        if (permanentRune && sample.avgShieldBlocks > 1) {
          throw new Error("Permanent rune granted more than one opening shield");
        }
      }
    }
  }
  if (results["salvage-hold"][100].true.missionTriggered !== SEEDS) {
    throw new Error("The salvage-hold pressure case did not trigger all guards");
  }
}
console.log(JSON.stringify(report, null, 2));
