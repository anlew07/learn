import Engine from "../src/engine.js";
import {
  collectOpeningWorlds,
  getOpeningWorlds,
  isOpeningWorldCohortComplete,
  openingWorldEndDay,
} from "./world-cohort.mjs";

const seeds = Number(process.argv.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] || 40);
const assert = process.argv.includes("--assert");
const doctrines = ["", "supply", "soul", "command"];
const summary = [];

function simulate(seed, runNumber, legacyId) {
  const run = Engine.fresh("legacy-" + seed, runNumber, true, legacyId, runNumber - 1);
  const cohort = collectOpeningWorlds(run);
  for (
    let day = 0;
    day < 160 && run.active && !isOpeningWorldCohortComplete(run, cohort);
    day += 1
  ) {
    Engine.step(run);
    collectOpeningWorlds(run, cohort);
  }
  if (!isOpeningWorldCohortComplete(run, cohort)) {
    throw new Error("Legacy opening-world cohort did not finish");
  }
  const worlds = getOpeningWorlds(run, cohort);
  for (const world of worlds) {
    if (![world.resource, world.p, world.d, world.xp].every(Number.isFinite)) {
      throw new Error("Non-finite world state for " + legacyId);
    }
    if (world.resource < 0 || world.d < 0 || world.d > 100) {
      throw new Error("Out-of-range world state for " + legacyId);
    }
  }
  const saved = worlds.filter((world) => world.status === "saved").length;
  const failed = worlds.filter((world) => world.status === "failed").length;
  return {
    saved,
    visited: worlds.length,
    failed,
    cohortShardEquivalent: saved * 4 + failed,
    endedDay: openingWorldEndDay(worlds),
  };
}

for (const runNumber of [1, 2, 3]) {
  const results = Object.fromEntries(doctrines.map((id) => [id || "baseline", []]));
  for (let seed = 0; seed < seeds; seed += 1) {
    for (const id of doctrines) results[id || "baseline"].push(simulate(seed, runNumber, id));
  }
  const baseline = results.baseline.reduce((sum, result) => sum + result.saved, 0);
  const worlds = results.baseline.reduce((sum, result) => sum + result.visited, 0);
  const row = { runNumber, seeds, worlds, baselineSaved: baseline };
  for (const id of doctrines.slice(1)) {
    const values = results[id];
    const saved = values.reduce((sum, result) => sum + result.saved, 0);
    const visited = values.reduce((sum, result) => sum + result.visited, 0);
    const cohortShardEquivalent = values.reduce((sum, result) => sum + result.cohortShardEquivalent, 0);
    const meanEndDay = values.reduce((sum, result) => sum + result.endedDay, 0) / values.length;
    row[id] = {
      saved,
      visited,
      savedRate: Number((saved / visited).toFixed(4)),
      savedDelta: saved - baseline,
      meanCohortShardEquivalent: Number((cohortShardEquivalent / seeds).toFixed(2)),
      meanEndDay: Number(meanEndDay.toFixed(2)),
    };
    if (assert && saved < baseline - Math.max(1, Math.ceil(seeds * 0.1))) {
      throw new Error(id + " materially regressed against baseline in run " + runNumber);
    }
  }
  summary.push(row);
}

console.log(JSON.stringify({ seedsPerRunNumber: seeds, measuredWorldInstancesPerRun: 3, rewardMetric: "cohort-equivalent only; not an actual run payout", summary }, null, 2));
