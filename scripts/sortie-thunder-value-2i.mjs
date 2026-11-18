import Engine from "../src/engine.js";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  createSortieArchive,
  prepareSortieArchive,
} from "../src/systems/sortie-session.js";
import {
  chooseSortieSkill,
  createSortie,
  DURATION_TICKS,
  stepSortie,
} from "../src/systems/sortie-sim.js";
import {
  assertExperimentResult,
  experimentInput,
  runSortieExperiment,
} from "./sortie-experiment.mjs";

const DANGERS = [0, 40, 75];
const SKILLS = ["thunder", "rune"];
const MOVEMENTS = ["stationary", "kite", "pickup", "mistouch"];
const mean = (values) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
const round = (value) => Math.round(value * 100) / 100;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function movementInput(battle, movement) {
  if (movement !== "mistouch") return experimentInput(battle, movement);
  const intended = experimentInput(battle, "pickup");
  // The same brief mistaken reversal is applied to both skill variants.
  const phase = (battle.tick / SORTIE.ticksPerSecond) % 7;
  return phase < 0.4 ? { x: -intended.x, y: -intended.y } : intended;
}

function inspectFirstSortie(seedIndex, danger, skill, movement) {
  const seed =
    "sortie-2e-fixed-" +
    String(seedIndex).padStart(3, "0") +
    "-danger-" +
    danger;
  const archive = createSortieArchive(seed);
  Engine.byId(archive.run, "lingzai").d = danger;
  const prepared = prepareSortieArchive(archive);
  if (!prepared.ok) throw new Error(prepared.error);
  const battle = createSortie(prepared.seed, prepared.danger, prepared.forgeLevel);
  const stats = {
    danger,
    skill,
    movement,
    thunderFires: 0,
    emptyReady: 0,
    closeAtThunder: 0,
    strikeFrameKills: 0,
    threatTicks: 0,
    defeatedBy35: 0,
    defeatedBy50: 0,
    defeatedBy65: 0,
    hurtNearThunder: 0,
  };
  let lastStrikeTick = -Infinity;
  while (battle.outcome === "running" && battle.tick < DURATION_TICKS) {
    if (battle.skillChoicePending) {
      if (!chooseSortieSkill(battle, skill).ok) {
        throw new Error("Skill choice failed");
      }
    }
    const ready =
      skill === "thunder" && battle.tick + 1 >= battle.thunderNextTick;
    const beforeHits = battle.thunderHits;
    const beforeKills = battle.defeated;
    const beforeHurt = battle.hurt;
    const threatCount = battle.enemies.filter(
      (enemy) => enemy.hp > 0 && distance(enemy, battle.hero) <= 48,
    ).length;
    if (threatCount) stats.threatTicks++;
    stepSortie(battle, movementInput(battle, movement));
    if (ready) {
      const fired = battle.thunderHits > beforeHits;
      if (fired) {
        stats.thunderFires++;
        stats.closeAtThunder += Number(threatCount > 0);
        stats.strikeFrameKills += battle.defeated - beforeKills;
        lastStrikeTick = battle.tick;
      } else {
        stats.emptyReady++;
      }
    }
    if (battle.hurt > beforeHurt && battle.tick - lastStrikeTick <= 60) {
      stats.hurtNearThunder += battle.hurt - beforeHurt;
    }
    if (battle.tick === 35 * SORTIE.ticksPerSecond) {
      stats.defeatedBy35 = battle.defeated;
    }
    if (battle.tick === 50 * SORTIE.ticksPerSecond) {
      stats.defeatedBy50 = battle.defeated;
    }
    if (battle.tick === 65 * SORTIE.ticksPerSecond) {
      stats.defeatedBy65 = battle.defeated;
    }
  }
  return {
    ...stats,
    hp: battle.hero.hp,
    hurt: battle.hurt,
    defeated: battle.defeated,
    shards: battle.collectedShards,
    won: battle.outcome === "won",
  };
}

function compact(row) {
  return {
    d: row.danger,
    skill: row.skill,
    move: row.movement,
    build: row.buildMode,
    wins: row.secondWins,
    hp: round(row.hp),
    hurt: round(row.damage),
    kills: round(row.kills),
    stones: round(row.stones),
    shards: round(row.shards),
    hits: round(row.thunderHits),
    resource: round(row.endResource),
  };
}

export function runThunderValueExperiment(seedCount = 40) {
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 40) {
    throw new Error("Seed count must be 1..40");
  }
  // Reuse the existing authoritative two-sortie settlement and forge matrix.
  const matrix = runSortieExperiment(seedCount);
  assertExperimentResult(matrix);
  const probes = [];
  for (const danger of DANGERS) {
    for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
      for (const skill of SKILLS) {
        for (const movement of MOVEMENTS) {
          probes.push(inspectFirstSortie(seedIndex, danger, skill, movement));
        }
      }
    }
  }
  const diagnostics = [];
  for (const danger of DANGERS) {
    for (const skill of SKILLS) {
      for (const movement of MOVEMENTS) {
        const matching = probes.filter(
          (item) =>
            item.danger === danger &&
            item.skill === skill &&
            item.movement === movement,
        );
        const keys = [
          "thunderFires",
          "emptyReady",
          "closeAtThunder",
          "strikeFrameKills",
          "threatTicks",
          "defeatedBy35",
          "defeatedBy50",
          "defeatedBy65",
          "hp",
          "hurt",
          "defeated",
          "shards",
          "hurtNearThunder",
        ];
        const values = Object.fromEntries(
          keys.map((key) => [key, round(mean(matching.map((row) => row[key])))]),
        );
        diagnostics.push({
          danger,
          skill,
          movement,
          wins: matching.filter((row) => row.won).length,
          ...values,
        });
      }
    }
  }
  return {
    seedCount,
    authoritativeSorties: matrix.sorties,
    instrumentedFirstSorties: probes.length,
    second: matrix.groups.map(compact),
    diagnostics,
  };
}

if (process.argv[1]?.endsWith("sortie-thunder-value-2i.mjs")) {
  const requested = Number(
    process.argv.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] ?? 40,
  );
  console.log(
    "THUNDER_VALUE_2I_JSON=" +
      JSON.stringify(runThunderValueExperiment(requested)),
  );
}
