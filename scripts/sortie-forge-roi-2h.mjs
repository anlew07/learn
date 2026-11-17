import Engine from "../src/engine.js";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  buildSortieForge,
  createSortieArchive,
  previewSortieForge,
} from "../src/systems/sortie-session.js";
import {
  EXPERIMENT_DANGERS,
  EXPERIMENT_MOVEMENTS,
  EXPERIMENT_SKILLS,
  simulateExperimentSortie,
} from "./sortie-experiment.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));
const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value) => (value === null ? null : Math.round(value * 1000) / 1000);
const resource = (archive) => Engine.byId(archive.run, "lingzai").resource;

/**
 * A price-only accounting sensitivity, NOT an authoritative battle or economy replay.
 * The observed build still cost the configured six stones.
 */
export function priceOnlyAccountingDelta(observedNetDelta, hypotheticalCost) {
  if (!Number.isFinite(observedNetDelta) || !Number.isFinite(hypotheticalCost) ||
    hypotheticalCost < 0) {
    throw new Error("Price sensitivity requires finite, nonnegative cost");
  }
  return observedNetDelta + SORTIE.forge.cost - hypotheticalCost;
}

function capture(result) {
  if (!result.available) return null;
  return {
    battle: result.battle,
    resource: resource(result.archive),
    day: result.archive.run.day,
    active: result.archive.run.active,
    lingStatus: Engine.byId(result.archive.run, "lingzai").status,
    progress: Engine.byId(result.archive.run, "lingzai").p,
  };
}

function campaign(seedIndex, danger, skill, movement, maxSorties) {
  // Reuse the exact established 2E/2G seed convention for paired comparability.
  const seed = "sortie-2e-fixed-" + String(seedIndex).padStart(3, "0") +
    "-danger-" + danger;
  const archive = createSortieArchive(seed);
  Engine.byId(archive.run, "lingzai").d = danger;
  const first = simulateExperimentSortie(archive, skill, movement);
  if (!first.available) throw new Error("First sortie unexpectedly unavailable");
  const firstStage = capture(first);
  const firstArchive = first.archive;
  const preview = previewSortieForge(firstArchive);
  const branches = {};
  for (const mode of ["no-build", "forge"]) {
    let nextArchive = clone(firstArchive);
    let built = false;
    let buildReason = null;
    let afterBuildResource = resource(nextArchive);
    if (mode === "forge") {
      const result = buildSortieForge(
        nextArchive,
        "2h:forge:" + seed + ":" + skill + ":" + movement,
      );
      if (result.ok && !result.replayed) {
        nextArchive = result.archive;
        built = true;
        afterBuildResource = resource(nextArchive);
      } else {
        buildReason = result.error || "build unavailable";
      }
    }
    const stages = [firstStage];
    for (let sortie = 2; sortie <= maxSorties; sortie++) {
      const result = simulateExperimentSortie(nextArchive, skill, movement);
      stages.push(capture(result));
      if (!result.available) break;
      nextArchive = result.archive;
    }
    branches[mode] = {
      built,
      buildReason,
      afterBuildResource,
      stages,
      finalResource: resource(nextArchive),
      finalDay: nextArchive.run.day,
    };
  }
  return {
    seedIndex, danger, skill, movement, firstResource: firstStage.resource,
    eligible: preview.available, branches,
  };
}

function summary(pairs, sortieNumber) {
  const built = pairs.filter((pair) => pair.branches.forge.built);
  const matched = built.filter((pair) =>
    pair.branches.forge.stages[sortieNumber - 1] &&
    pair.branches["no-build"].stages[sortieNumber - 1]);
  const controls = matched.map((pair) =>
    pair.branches["no-build"].stages[sortieNumber - 1]);
  const treatments = matched.map((pair) =>
    pair.branches.forge.stages[sortieNumber - 1]);
  const deltas = matched.map((pair, i) => ({
    win: Number(treatments[i].battle.won) - Number(controls[i].battle.won),
    kills: treatments[i].battle.defeated - controls[i].battle.defeated,
    hp: treatments[i].battle.hp - controls[i].battle.hp,
    hurt: treatments[i].battle.damageTaken - controls[i].battle.damageTaken,
    stones: treatments[i].battle.stones - controls[i].battle.stones,
    resource: treatments[i].resource - controls[i].resource,
    shards: treatments[i].battle.collectedShards -
      controls[i].battle.collectedShards,
    progress: treatments[i].progress - controls[i].progress,
  }));
  const avg = (field) => round(mean(deltas.map((delta) => delta[field])));
  return {
    n: pairs.length,
    eligible: pairs.filter((pair) => pair.eligible).length,
    built: built.length,
    matched: matched.length,
    controlWins: controls.filter((stage) => stage.battle.won).length,
    forgeWins: treatments.filter((stage) => stage.battle.won).length,
    winDelta: avg("win"),
    killDelta: avg("kills"),
    hpDelta: avg("hp"),
    hurtDelta: avg("hurt"),
    earnedStonesDelta: avg("stones"),
    shardDelta: avg("shards"),
    worldProgressDelta: avg("progress"),
    netResourceDelta: avg("resource"),
    // Only already-built AND actually matched cohorts. Never claim this
    // extrapolates to the seeds unable to afford construction.
    paidBack: deltas.filter((delta) => delta.resource >= 0).length,
    counterfactualCost4Delta: round(mean(deltas.map((delta) =>
      priceOnlyAccountingDelta(delta.resource, 4)))),
    counterfactualCost5Delta: round(mean(deltas.map((delta) =>
      priceOnlyAccountingDelta(delta.resource, 5)))),
    controlHp: round(mean(controls.map((stage) => stage.battle.hp))),
    forgeHp: round(mean(treatments.map((stage) => stage.battle.hp))),
    controlKills: round(mean(controls.map((stage) => stage.battle.defeated))),
    forgeKills: round(mean(treatments.map((stage) => stage.battle.defeated))),
    controlStones: round(mean(controls.map((stage) => stage.battle.stones))),
    forgeStones: round(mean(treatments.map((stage) => stage.battle.stones))),
    controlResource: round(mean(controls.map((stage) => stage.resource))),
    forgeResource: round(mean(treatments.map((stage) => stage.resource))),
  };
}

export function runForgeRoiExperiment(seedCount = 40, maxSorties = 4) {
  if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 500 ||
    !Number.isInteger(maxSorties) || maxSorties < 2 || maxSorties > 6) {
    throw new Error("Invalid fixed-seed count or sortie horizon");
  }
  const pairs = [];
  for (const danger of EXPERIMENT_DANGERS) {
    for (let seedIndex = 0; seedIndex < seedCount; seedIndex++) {
      for (const skill of EXPERIMENT_SKILLS) {
        for (const movement of EXPERIMENT_MOVEMENTS) {
          pairs.push(campaign(seedIndex, danger, skill, movement, maxSorties));
        }
      }
    }
  }
  const horizons = Array.from({ length: maxSorties - 1 },
    (_, index) => index + 2);
  const overall = horizons.map((sortie) => ({ sortie, ...summary(pairs, sortie) }));
  const byDangerSkill = [];
  const byRoute = [];
  for (const danger of EXPERIMENT_DANGERS) {
    for (const skill of EXPERIMENT_SKILLS) {
      const group = pairs.filter((pair) => pair.danger === danger &&
        pair.skill === skill);
      for (const sortie of horizons) {
        byDangerSkill.push({ danger, skill, sortie, ...summary(group, sortie) });
        for (const movement of EXPERIMENT_MOVEMENTS) {
          byRoute.push({
            danger, skill, movement, sortie,
            ...summary(group.filter((pair) => pair.movement === movement), sortie),
          });
        }
      }
    }
  }
  return {
    metadata: {
      seedCount, maxSorties, pairs: pairs.length,
      baseline: "2G / PR #74",
      dangerLevels: EXPERIMENT_DANGERS,
      skills: EXPERIMENT_SKILLS,
      routes: EXPERIMENT_MOVEMENTS,
      forgeCost: SORTIE.forge.cost,
      damageWithoutForge: SORTIE.weapon.damage,
      damageWithForge: SORTIE.weapon.damage + SORTIE.forge.damageBonus,
    },
    pairs,
    overall,
    byDangerSkill,
    byRoute,
  };
}

export function assertForgeRoiExperiment(result) {
  const expected = result.metadata.seedCount * EXPERIMENT_DANGERS.length *
    EXPERIMENT_SKILLS.length * EXPERIMENT_MOVEMENTS.length;
  if (result.pairs.length !== expected) throw new Error("Missing paired seeds");
  for (const pair of result.pairs) {
    const { forge, ["no-build"]: control } = pair.branches;
    if (pair.eligible !== forge.built)
      throw new Error("Forge availability is inconsistent with actual construction");
    if (control.built) throw new Error("Control unexpectedly built a forge");
    if (JSON.stringify(forge.stages[0]) !== JSON.stringify(control.stages[0]))
      throw new Error("Seed cohorts diverged before the forge decision");
    if (forge.built && Math.abs(
      forge.afterBuildResource - pair.firstResource + SORTIE.forge.cost) > 1e-7)
      throw new Error("Build did not deduct the exact current price");
    for (let index = 1; index < result.metadata.maxSorties; index++) {
      const controlStage = control.stages[index];
      const forgeStage = forge.stages[index];
      if (controlStage?.battle.weaponDamage !== undefined &&
        controlStage.battle.weaponDamage !== SORTIE.weapon.damage)
        throw new Error("Control weapon damage changed");
      if (forgeStage?.battle.weaponDamage !== undefined &&
        forgeStage.battle.weaponDamage !== SORTIE.weapon.damage +
          (forge.built ? SORTIE.forge.damageBonus : 0))
        throw new Error("Forge did not use the authoritative saved weapon level");
    }
  }
  return true;
}

if (process.argv[1] && process.argv[1].endsWith("sortie-forge-roi-2h.mjs")) {
  const seeds = process.argv.find((arg) => arg.startsWith("--seeds="));
  const sorties = process.argv.find((arg) => arg.startsWith("--sorties="));
  const result = runForgeRoiExperiment(
    seeds ? Number(seeds.slice(8)) : 40,
    sorties ? Number(sorties.slice(10)) : 4,
  );
  assertForgeRoiExperiment(result);
  // Delimited machine-readable output supports CI log evidence without
  // modifying the shared package scripts or Actions workflow.
  console.log("FORGE_ROI_2H_JSON=" + JSON.stringify({
    metadata: result.metadata,
    overall: result.overall,
    byDangerSkill: result.byDangerSkill,
    byRoute: result.byRoute,
  }));
}
