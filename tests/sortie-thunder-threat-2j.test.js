import { describe, expect, it } from "vitest";
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
} from "../scripts/sortie-experiment.mjs";

const DANGERS = [0, 40, 75];
const SKILLS = ["thunder", "rune"];
const MOVEMENTS = ["kite", "pickup", "mistouch"];
const mean = (items) =>
  items.length ? items.reduce((total, value) => total + value, 0) / items.length : 0;
const round = (n) => Math.round(n * 100) / 100;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function inputFor(battle, movement) {
  if (movement !== "mistouch") return experimentInput(battle, movement);
  const input = experimentInput(battle, "pickup");
  const phase = (battle.tick / SORTIE.ticksPerSecond) % 7;
  return phase < 0.4 ? { x: -input.x, y: -input.y } : input;
}

/**
 * Threat means the enemy could touch a hero who remains still for the next
 * second. This is a risk proxy, NOT a claim of an inevitable moving collision.
 */
function threatCounts(battle) {
  let near = 0;
  let oneSecond = 0;
  for (const enemy of battle.enemies) {
    if (enemy.hp <= 0) continue;
    const range = distance(enemy, battle.hero);
    if (range <= 48) near++;
    const collisionRadius = SORTIE.player.radius + SORTIE.enemies[enemy.kind].radius;
    if (range <= collisionRadius + SORTIE.enemies[enemy.kind].speed) oneSecond++;
  }
  return { near, oneSecond };
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
  const counters = {
    nearTicks: 0,
    possibleContactTicks: 0,
    strikes: 0,
    strikesNear: 0,
    strikesBeforeContact: 0,
    sameTickDefeats: 0,
    postStrikeHurt: 0,
    defeatsBy35: 0,
    defeatsBy50: 0,
    defeatsBy65: 0,
  };
  let latestStrike = -Infinity;
  while (battle.outcome === "running" && battle.tick < DURATION_TICKS) {
    if (battle.skillChoicePending) {
      if (!chooseSortieSkill(battle, skill).ok) throw new Error("Skill choice failed");
    }
    const { near, oneSecond } = threatCounts(battle);
    if (battle.skillId === "thunder") {
      counters.nearTicks += Number(near > 0);
      counters.possibleContactTicks += Number(oneSecond > 0);
    }
    const hits = battle.thunderHits;
    const kills = battle.defeated;
    const hurt = battle.hurt;
    stepSortie(battle, inputFor(battle, movement));
    if (battle.thunderHits > hits) {
      counters.strikes++;
      counters.strikesNear += Number(near > 0);
      counters.strikesBeforeContact += Number(oneSecond > 0);
      // Weapon shots are processed before thunder; correlated, not causal kills.
      counters.sameTickDefeats += battle.defeated - kills;
      latestStrike = battle.tick;
    }
    if (battle.hurt > hurt && battle.tick - latestStrike <= SORTIE.ticksPerSecond) {
      counters.postStrikeHurt += battle.hurt - hurt;
    }
    if (battle.tick === 35 * SORTIE.ticksPerSecond) counters.defeatsBy35 = battle.defeated;
    if (battle.tick === 50 * SORTIE.ticksPerSecond) counters.defeatsBy50 = battle.defeated;
    if (battle.tick === 65 * SORTIE.ticksPerSecond) counters.defeatsBy65 = battle.defeated;
  }
  return {
    danger, skill, movement,
    won: Number(battle.outcome === "won"),
    hp: battle.hero.hp,
    hurt: battle.hurt,
    kills: battle.defeated,
    shards: battle.collectedShards,
    hits: battle.thunderHits,
    ...counters,
  };
}

export function runThunderThreatExperiment(seedCount = 40) {
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 40) {
    throw new Error("Seed count must be 1..40");
  }
  const matrix = runSortieExperiment(seedCount);
  assertExperimentResult(matrix);
  const diagnostic = [];
  for (const danger of DANGERS) {
    for (const skill of SKILLS) {
      for (const movement of MOVEMENTS) {
        const runs = [];
        for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
          runs.push(inspectFirstSortie(seedIndex, danger, skill, movement));
        }
        const fields = [
          "hp", "hurt", "kills", "shards", "hits",
          "nearTicks", "possibleContactTicks",
          "strikes", "strikesNear", "strikesBeforeContact",
          "sameTickDefeats", "postStrikeHurt",
          "defeatsBy35", "defeatsBy50", "defeatsBy65",
        ];
        diagnostic.push({
          danger, skill, movement,
          n: runs.length, wins: runs.reduce((sum, row) => sum + row.won, 0),
          ...Object.fromEntries(fields.map((key) =>
            [key, round(mean(runs.map((row) => row[key])))])),
        });
      }
    }
  }
  const authoritative = matrix.groups.map((row) => ({
    danger: row.danger, build: row.buildMode,
    skill: row.skill, move: row.movement,
    n: row.secondRuns, wins: row.secondWins,
    kills: round(row.kills), hp: round(row.hp),
    hurt: round(row.damage), shards: round(row.shards),
    stones: round(row.stones), hits: round(row.thunderHits),
    endResource: round(row.endResource),
  }));
  return {
    seedCount,
    authoritativeSorties: matrix.sorties,
    instrumentedFirstSorties: diagnostic.reduce((sum, row) => sum + row.n, 0),
    authoritative, diagnostic,
  };
}

describe("2J-A thunder: threat removal and actual offensive value", () => {
  it("preserves the baseline skills, player, and reward contracts", () => {
    expect(SORTIE.skills.thunderCooldownSeconds).toBe(4);
    expect(SORTIE.skills.thunderTargets).toBe(1);
    expect(SORTIE.skills.thunderDamage).toBe(1);
    expect(SORTIE.skills.runeRechargeSeconds).toBe(25);
    expect(SORTIE.rewards.pickupRadius).toBe(28);
    expect(SORTIE.player.hp).toBe(8);
  });

  it("never deals thunder damage before the skill is chosen", () => {
    const battle = createSortie("2j-thunder-choice");
    battle.schedule = [];
    for (let i = 0; i < 25 * SORTIE.ticksPerSecond; i++) stepSortie(battle);
    expect(battle.skillChoicePending).toBe(true);
    expect(battle.thunderHits).toBe(0);
    expect(chooseSortieSkill(battle, "thunder").ok).toBe(true);
    expect(battle.thunderNextTick).toBe(
      battle.tick + SORTIE.skills.thunderCooldownSeconds * SORTIE.ticksPerSecond,
    );
  });

  it("runs deterministic CI smoke or explicit full 40-seed paired threat verification", () => {
    const seedCount = process.env.SORTIE_THUNDER_FULL === "1" ? 40 : 8;
    const result = runThunderThreatExperiment(seedCount);
    expect(result.authoritativeSorties).toBe(seedCount * 54);
    expect(result.instrumentedFirstSorties).toBe(seedCount * 18);
    expect(result.authoritative).toHaveLength(36);
    expect(result.diagnostic).toHaveLength(18);
    for (const row of result.diagnostic) {
      expect(row.wins).toBeGreaterThanOrEqual(0);
      expect(row.wins).toBeLessThanOrEqual(seedCount);
      expect(row.strikesBeforeContact).toBeLessThanOrEqual(row.strikes);
    }
    console.log("THUNDER_THREAT_2J_JSON=" + JSON.stringify(result));
  }, 600_000);
});
