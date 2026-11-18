import {
  assertForgeRoiExperiment,
  runForgeRoiExperiment,
} from "./sortie-forge-roi-2h.mjs";

const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value) => (value === null ? null : Math.round(value * 1000) / 1000);

/**
 * The 2H-C campaign stops recording stages when a world is no longer available.
 * Frozen resources are a separately labelled accounting outcome, not another sortie.
 * For an immediately unavailable second sortie, the forge's six-stone cost
 * has already been paid, even though stage[0] is the shared pre-build snapshot.
 */
export function resourceAtHorizon(branch, sortie) {
  let resource = branch.afterBuildResource;
  for (let index = 1; index < sortie; index++) {
    if (!branch.stages[index]) break;
    resource = branch.stages[index].resource;
  }
  return resource;
}

function stage(branch, sortie) {
  return branch.stages[sortie - 1] ?? null;
}

function describeCohort(pairs, sortie) {
  const built = pairs.filter((pair) => pair.branches.forge.built);
  const observations = built.map((pair) => {
    const control = stage(pair.branches["no-build"], sortie);
    const forge = stage(pair.branches.forge, sortie);
    return {
      control,
      forge,
      frozenDelta:
        resourceAtHorizon(pair.branches.forge, sortie) -
        resourceAtHorizon(pair.branches["no-build"], sortie),
    };
  });
  const matched = observations.filter((value) => value.control && value.forge);
  const delta = (field) =>
    round(mean(matched.map((value) => value.forge.battle[field] - value.control.battle[field])));
  const netDelta = matched.map((value) => value.forge.resource - value.control.resource);
  return {
    sortie,
    attempted: pairs.length,
    built: built.length,
    buildRate: round(pairs.length ? built.length / pairs.length : null),
    controlContinued: observations.filter((value) => value.control).length,
    forgeContinued: observations.filter((value) => value.forge).length,
    matched: matched.length,
    controlOnly: observations.filter((value) => value.control && !value.forge).length,
    forgeOnly: observations.filter((value) => !value.control && value.forge).length,
    neither: observations.filter((value) => !value.control && !value.forge).length,
    controlWins: matched.filter((value) => value.control.battle.won).length,
    forgeWins: matched.filter((value) => value.forge.battle.won).length,
    rescued: matched.filter((value) => !value.control.battle.won && value.forge.battle.won)
      .length,
    harmed: matched.filter((value) => value.control.battle.won && !value.forge.battle.won)
      .length,
    killDelta: delta("defeated"),
    hpDelta: delta("hp"),
    hurtDelta: delta("damageTaken"),
    earnedStonesDelta: delta("stones"),
    shardDelta: delta("collectedShards"),
    netResourceDeltaMatched: round(mean(netDelta)),
    paidBackMatched: netDelta.filter((value) => value >= 0).length,
    netResourceDeltaFrozenAllBuilt: round(mean(observations.map((value) => value.frozenDelta))),
    paidBackFrozenAllBuilt: observations.filter((value) => value.frozenDelta >= 0).length,
  };
}

/** All actual construction cohorts; never mix unbuilt attempts into effect estimates. */
export function summarizeForgeHorizonPairs(pairs, maxSorties = 6) {
  if (!Array.isArray(pairs) || !Number.isInteger(maxSorties) ||
    maxSorties < 2 || maxSorties > 6) {
    throw new Error("Invalid forge horizon observations");
  }
  const built = pairs.filter((pair) => pair.branches.forge.built);
  const horizons = Array.from({ length: maxSorties - 1 }, (_, index) => index + 2);
  const overall = horizons.map((sortie) => describeCohort(pairs, sortie));
  const byDangerSkill = [];
  const byRoute = [];
  for (const danger of [0, 40, 75]) {
    for (const skill of ["thunder", "rune"]) {
      const cohort = pairs.filter((pair) => pair.danger === danger && pair.skill === skill);
      for (const sortie of horizons) {
        byDangerSkill.push({ danger, skill, ...describeCohort(cohort, sortie) });
      }
      for (const movement of ["stationary", "kite", "pickup"]) {
        byRoute.push({
          danger,
          skill,
          movement,
          ...describeCohort(
            cohort.filter((pair) => pair.movement === movement),
            maxSorties,
          ),
        });
      }
    }
  }
  const firstPayback = Object.fromEntries(horizons.map((sortie) => [sortie, 0]));
  let neverPaidBack = 0;
  for (const pair of built) {
    let first = null;
    for (const sortie of horizons) {
      const control = stage(pair.branches["no-build"], sortie);
      const forge = stage(pair.branches.forge, sortie);
      if (!control || !forge) break;
      if (forge.resource >= control.resource) {
        first = sortie;
        break;
      }
    }
    if (first === null) neverPaidBack++;
    else firstPayback[first]++;
  }
  return {
    overall,
    byDangerSkill,
    byRoute,
    payback: { built: built.length, firstAtSortie: firstPayback, neverPaidBack },
  };
}

export function runForgeHorizonExperiment(seedCount = 40, maxSorties = 6) {
  const reference = runForgeRoiExperiment(seedCount, maxSorties);
  assertForgeRoiExperiment(reference);
  return {
    metadata: {
      ...reference.metadata,
      source: "2H-C authoritative paired double-world settlement",
      accounting: "terminal resource held constant after sortie unavailable",
    },
    ...summarizeForgeHorizonPairs(reference.pairs, maxSorties),
  };
}

if (process.argv[1]?.endsWith("sortie-forge-horizon-2i.mjs")) {
  const seedArg = process.argv.find((arg) => arg.startsWith("--seeds="));
  const seeds = seedArg ? Number(seedArg.slice("--seeds=".length)) : 40;
  const result = runForgeHorizonExperiment(seeds);
  console.log("FORGE_HORIZON_2I_JSON=" + JSON.stringify(result));
}
