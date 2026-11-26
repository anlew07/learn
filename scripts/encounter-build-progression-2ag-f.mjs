import {
  createSortie,
  DURATION_TICKS,
  stepSortie,
  chooseSortieSkill,
} from "../src/systems/sortie-sim.js";
import { SORTIE } from "../src/config/sortie-data.js";
import { replaySortieTrace } from "../src/systems/sortie-trace.js";

const SEEDS = 40;
const DANGER_BANDS = [0, 45, 80];
const CONTROLS = ["stationary", "salvage-hold"];
const PROFILES = [
  { id: "thunder-0", type: "thunder", rank: 0, skillId: "thunder" },
  { id: "thunder-1", type: "thunder", rank: 1, skillId: "thunder" },
  { id: "thunder-2", type: "thunder", rank: 2, skillId: "thunder" },
  { id: "rune-0", type: "rune", rank: 0, skillId: "rune" },
  { id: "rune-1", type: "rune", rank: 1, skillId: "rune" },
  { id: "rune-2", type: "rune", rank: 2, skillId: "rune" },
];

function buildFor(profile) {
  return {
    thunderLevel: profile.type === "thunder" ? profile.rank : 0,
    runeLevel: profile.type === "rune" ? profile.rank : 0,
  };
}

function inputFor(control, battle) {
  if (control === "stationary") return { x: 0, y: 0 };

  const dx = SORTIE.mission.x - battle.hero.x;
  const dy = SORTIE.mission.y - battle.hero.y;
  const range = Math.hypot(dx, dy);
  if (range <= SORTIE.mission.collectRadius * 0.5) return { x: 0, y: 0 };

  return { x: dx / range, y: dy / range };
}

function runBattle(seed, danger, control, profile) {
  const missionId = control === "salvage-hold" ? "salvage" : "safe";
  const combatBuild = buildFor(profile);
  const battle = createSortie(seed, danger, 0, missionId, { combatBuild });
  const actions = [];
  let guard = 0;

  while (battle.outcome === "running" && guard < DURATION_TICKS + 2) {
    if (battle.skillChoicePending) {
      const chosen = chooseSortieSkill(battle, profile.skillId);
      if (!chosen.ok) throw new Error("Skill choice failed: " + chosen.error);
      actions.push(["skill", profile.skillId]);
    } else {
      const input = inputFor(control, battle);
      stepSortie(battle, input);
      actions.push(["tick", input.x, input.y]);
    }
    guard++;
  }

  if (battle.outcome === "running" || battle.skillChoicePending) {
    throw new Error("Battle exceeded fixed tick budget: " + seed + " / " + profile.id);
  }

  const result = {
    outcome: battle.outcome,
    maxHp: battle.maxHp,
    hpRemaining: battle.hero.hp,
    hurt: battle.hurt,
    defeated: battle.defeated,
    collectedShards: battle.collectedShards,
    thunderHits: battle.thunderHits,
    shieldBlocks: battle.shieldBlocks,
    missionStatus: battle.mission.status,
    guardCount: battle.mission.guardCount,
    guardDamage: battle.mission.guardDamage,
  };

  const replay = replaySortieTrace(
    seed,
    danger,
    actions,
    0,
    missionId,
    "auto",
    1,
    combatBuild,
  );
  if (!replay.ok) throw new Error("Trace replay failed: " + seed + " / " + profile.id);

  const replayBattle = replay.battle;
  const replayResult = {
    outcome: replayBattle.outcome,
    maxHp: replayBattle.maxHp,
    hpRemaining: replayBattle.hero.hp,
    hurt: replayBattle.hurt,
    defeated: replayBattle.defeated,
    collectedShards: replayBattle.collectedShards,
    thunderHits: replayBattle.thunderHits,
    shieldBlocks: replayBattle.shieldBlocks,
    missionStatus: replayBattle.mission.status,
    guardCount: replayBattle.mission.guardCount,
    guardDamage: replayBattle.mission.guardDamage,
  };

  if (JSON.stringify(replayResult) !== JSON.stringify(result)) {
    throw new Error("Replay drift: " + seed + " / " + control + " / " + profile.id);
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
    avgDefeated: Number((sum("defeated") / samples.length).toFixed(2)),
    avgShards: Number((sum("collectedShards") / samples.length).toFixed(2)),
    avgThunderHits: Number((sum("thunderHits") / samples.length).toFixed(2)),
    totalShieldBlocks: sum("shieldBlocks"),
    missionTriggered: samples.filter((item) => item.guardCount > 0).length,
    missionCompleted: samples.filter((item) => item.missionStatus === "completed").length,
    avgGuardDamage: Number((sum("guardDamage") / samples.length).toFixed(2)),
  };
}

const results = {};
for (const control of CONTROLS) {
  results[control] = {};
  for (const danger of DANGER_BANDS) {
    results[control][danger] = {};
    for (const profile of PROFILES) {
      const samples = [];
      for (let index = 0; index < SEEDS; index++) {
        const seed = "2ag-f-build-" + danger + "-" + index;
        samples.push(runBattle(seed, danger, control, profile));
      }
      results[control][danger][profile.id] = aggregate(samples);
    }
  }
}

const pairedAgainstRank0 = {};
for (const control of CONTROLS) {
  pairedAgainstRank0[control] = {};
  for (const danger of DANGER_BANDS) {
    pairedAgainstRank0[control][danger] = {};
    for (const type of ["thunder", "rune"]) {
      const baseline = results[control][danger][type + "-0"];
      for (const rank of [1, 2]) {
        const current = results[control][danger][type + "-" + rank];
        pairedAgainstRank0[control][danger][type + "-" + rank] = {
          winRateDelta: Number((current.winRatePct - baseline.winRatePct).toFixed(1)),
          avgHpRemainingDelta: Number((current.avgHpRemaining - baseline.avgHpRemaining).toFixed(2)),
          avgHurtDelta: Number((current.avgHurt - baseline.avgHurt).toFixed(2)),
          avgDefeatedDelta: Number((current.avgDefeated - baseline.avgDefeated).toFixed(2)),
          avgShardsDelta: Number((current.avgShards - baseline.avgShards).toFixed(2)),
          avgThunderHitsDelta: Number((current.avgThunderHits - baseline.avgThunderHits).toFixed(2)),
          totalShieldBlocksDelta: current.totalShieldBlocks - baseline.totalShieldBlocks,
        };
      }
    }
  }
}

const report = {
  experiment: "2AG-F paired test of persistent world build effects in real-time combat",
  seedsPerDangerAndProfile: SEEDS,
  dangerBands: DANGER_BANDS,
  controls: {
    stationary: "fixed position, selecting the matching skill",
    salvageHold: "move to the recovery site, trigger guards, then hold position",
  },
  profiles: PROFILES.map((profile) => ({
    id: profile.id,
    skillId: profile.skillId,
    combatBuild: buildFor(profile),
  })),
  totalBattles: CONTROLS.length * DANGER_BANDS.length * PROFILES.length * SEEDS,
  results,
  pairedAgainstRank0,
  caveat: "Deterministic pressure scripts are not substitutes for real mobile-player testing.",
};

if (process.argv.includes("--assert")) {
  for (const control of CONTROLS) {
    for (const danger of DANGER_BANDS) {
      for (const profile of PROFILES) {
        const sample = results[control][danger][profile.id];
        if (sample.samples !== SEEDS) {
          throw new Error("Unexpected sample count: " + control + " D" + danger + " " + profile.id);
        }
        if (sample.avgHpRemaining < 0 || sample.avgHpRemaining > 8) {
          throw new Error("Invalid remaining HP: " + control + " D" + danger + " " + profile.id);
        }
      }
    }
  }
}

console.log(JSON.stringify(report, null, 2));
