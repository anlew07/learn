import Engine from "../src/engine.js";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  buildSortieForge,
  createSortieArchive,
  previewSortieForge,
} from "../src/systems/sortie-session.js";
import {
  playRecoveryRun,
  RECOVERY_DANGERS,
  RECOVERY_ROUTES,
  RECOVERY_SKILLS,
} from "./sortie-guarded-recovery-2l.mjs";

// 2N compares ONE real 6-stone investment and the following physical salvage.
// No production balance, battle, mission, or storage code is changed.
// prettier-ignore
const round = (n) => n === null ? null : Math.round(n * 1000) / 1000;
// prettier-ignore
const mean = (values) => values.length ?
  values.reduce((sum, value) => sum + value, 0) / values.length : null;
// prettier-ignore
const resource = (archive) => Engine.byId(archive.run, "lingzai").resource;
// prettier-ignore
const seedOf = (index, danger) =>
  "sortie-2e-fixed-" + String(index).padStart(3, "0") + "-danger-" + danger;

/**
 * The first safe sortie is deliberately identical for both branches. It earns
 * real stones, advances BOTH worlds, and determines whether the player can
 * actually afford the forge. Then both branches choose the same "salvage"
 * mission and follow exactly the same physical joystick script.
 */
export function pairedForgeSalvageRun(seedIndex, danger, skill, route) {
  if (!Number.isInteger(seedIndex) || seedIndex < 0 || seedIndex >= 40 ||
    !RECOVERY_DANGERS.includes(danger) ||
    !RECOVERY_SKILLS.includes(skill) ||
    !RECOVERY_ROUTES.includes(route)) {
    throw new Error("Invalid 2N fixed seed / danger / skill / route");
  }
  const seed = seedOf(seedIndex, danger);
  const initial = createSortieArchive(seed);
  Engine.byId(initial.run, "lingzai").d = danger;
  const first = playRecoveryRun(initial, skill, "target", "safe");
  const originalResource = resource(first.archive);
  const preview = previewSortieForge(first.archive);
  const pair = {
    seedIndex, danger, skill, route, first: first.stats,
    firstResource: originalResource, eligible: preview.available,
    forgeCost: SORTIE.forge.cost, control: null, forged: null,
  };
  if (!preview.available) return pair;

  const snapshotBeforePayment = JSON.stringify(first.archive);
  const paid = buildSortieForge(
    first.archive, "2n:forge:" + seed + ":" + skill + ":" + route,
  );
  if (!paid.ok || paid.replayed || paid.receipt.cost !== SORTIE.forge.cost ||
    paid.receipt.afterStones !== resource(paid.archive) ||
    resource(paid.archive) !== originalResource - SORTIE.forge.cost ||
    JSON.stringify(first.archive) !== snapshotBeforePayment) {
    throw new Error("2N forge was not a genuine isolated 6-stone payment");
  }
  const control = playRecoveryRun(first.archive, skill, route, "salvage");
  const forged = playRecoveryRun(paid.archive, skill, route, "salvage");
  for (const result of [control, forged]) {
    if (result.receipt.day !== first.archive.run.day ||
      result.archive.run.day !== first.archive.run.day + 1 ||
      result.receipt.battle.missionId !== "salvage" ||
      result.receipt.worlds[1].resourceDelta !== 0 ||
      result.receipt.worlds[0].resourceDelta !== result.receipt.battle.stones) {
      throw new Error("2N compared an invalid authoritative second-day receipt");
    }
  }
  if (control.receipt.battle.weaponDamage !== SORTIE.weapon.damage ||
    forged.receipt.battle.weaponDamage !==
      SORTIE.weapon.damage + SORTIE.forge.damageBonus) {
    throw new Error("2N weapon damage differs from genuine upgrade effect");
  }
  pair.control = { ...control.stats, weaponDamage: control.receipt.battle.weaponDamage };
  pair.forged = { ...forged.stats, weaponDamage: forged.receipt.battle.weaponDamage };
  return pair;
}

// A matched comparison only includes pairs that could actually pay six stones.
// prettier-ignore
function summarize(pairs) {
  const matched = pairs.filter((p) => p.control && p.forged);
  const sum = (key) => matched.reduce((n, p) => n + Number(key(p)), 0);
  const delta = (key) => round(mean(matched.map((p) =>
    key(p.forged) - key(p.control))));
  return {
    n: pairs.length,
    eligible: pairs.filter((p) => p.eligible).length,
    matched: matched.length,
    controlWins: sum((p) => p.control.won),
    forgeWins: sum((p) => p.forged.won),
    controlObjectiveCompleted: sum((p) => p.control.completed),
    forgeObjectiveCompleted: sum((p) => p.forged.completed),
    controlObjectivePaid: sum((p) => p.control.objectiveStones > 0),
    forgeObjectivePaid: sum((p) => p.forged.objectiveStones > 0),
    winDelta: delta((s) => s.won),
    hpDelta: delta((s) => s.hp),
    hurtDelta: delta((s) => s.hurt),
    defeatedDelta: delta((s) => s.defeated),
    pickedShardsDelta: delta((s) => s.shards),
    objectiveStonesDelta: delta((s) => s.objectiveStones),
    earnedStonesDelta: delta((s) => s.stones),
    netResourceDelta: delta((s) => s.lingResource),
    paidBack: sum((p) => p.forged.lingResource >= p.control.lingResource),
    controlEarnedStones: round(mean(matched.map((p) => p.control.stones))),
    forgeEarnedStones: round(mean(matched.map((p) => p.forged.stones))),
  };
}

/**
 * 40 paired seeds x three dangers x two skills x four control routes =
 * 960 matched-eligibility trials (not necessarily 960 affordable builds).
 */
export function runForgeSalvageExperiment(seeds = 40) {
  if (!Number.isInteger(seeds) || seeds < 1 || seeds > 40) {
    throw new Error("2N accepts 1..40 fixed seeds");
  }
  const pairs = [];
  for (const danger of RECOVERY_DANGERS) {
    for (const skill of RECOVERY_SKILLS) {
      for (const route of RECOVERY_ROUTES) {
        for (let i = 0; i < seeds; i++) {
          pairs.push(pairedForgeSalvageRun(i, danger, skill, route));
        }
      }
    }
  }
  const byDanger = RECOVERY_DANGERS.map((danger) => ({
    danger, ...summarize(pairs.filter((p) => p.danger === danger)),
  }));
  const byDangerSkill = RECOVERY_DANGERS.flatMap((danger) =>
    RECOVERY_SKILLS.map((skill) => ({
      danger, skill, ...summarize(pairs.filter((p) =>
        p.danger === danger && p.skill === skill)),
    })));
  const byRoute = RECOVERY_ROUTES.map((route) => ({
    route, ...summarize(pairs.filter((p) => p.route === route)),
  }));
  return {
    metadata: {
      seeds, pairs: pairs.length, dangers: RECOVERY_DANGERS,
      skills: RECOVERY_SKILLS, routes: RECOVERY_ROUTES,
      firstMission: "safe", secondMission: "salvage",
      forgeCost: SORTIE.forge.cost,
      forgedDamage: SORTIE.weapon.damage + SORTIE.forge.damageBonus,
    },
    pairs, overall: summarize(pairs), byDanger, byDangerSkill, byRoute,
  };
}

// prettier-ignore
export function assertForgeSalvageExperiment(report) {
  const { metadata, pairs, overall } = report;
  if (pairs.length !== metadata.seeds * 3 * 2 * 4 ||
    overall.n !== pairs.length || overall.matched !== overall.eligible) {
    throw new Error("2N fixed-seed cardinality or eligibility mismatch");
  }
  for (const pair of pairs) {
    if (!pair.eligible) {
      if (pair.control || pair.forged) throw new Error("Unpaid pair leaked into comparison");
      continue;
    }
    const { control, forged } = pair;
    if (!control || !forged || control.day !== pair.first.day + 1 ||
      forged.day !== control.day || control.missionId !== "salvage" ||
      forged.missionId !== "salvage" ||
      control.weaponDamage !== SORTIE.weapon.damage ||
      forged.weaponDamage !== SORTIE.weapon.damage + SORTIE.forge.damageBonus ||
      (control.objectiveStones > 0 && (!control.won || !control.completed)) ||
      (forged.objectiveStones > 0 && (!forged.won || !forged.completed)) ||
      control.objectiveStones > SORTIE.mission.rewardStones ||
      forged.objectiveStones > SORTIE.mission.rewardStones) {
      throw new Error("2N forged/control authority or reward mismatch");
    }
  }
  return true;
}

if (process.argv[1] &&
  import.meta.url === new URL("file://" + process.argv[1]).href) {
  const seeds = Number(process.argv.find((arg) =>
    arg.startsWith("--seeds="))?.split("=")[1] ?? 40);
  const result = runForgeSalvageExperiment(seeds);
  assertForgeSalvageExperiment(result);
  console.log("FORGE_SALVAGE_2N_JSON=" + JSON.stringify({
    metadata: result.metadata,
    overall: result.overall,
    byDanger: result.byDanger,
    byDangerSkill: result.byDangerSkill,
    byRoute: result.byRoute,
  }));
}
