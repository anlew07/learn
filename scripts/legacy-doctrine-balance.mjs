import Engine from "../src/engine.js";

const seeds = Number(process.argv.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] || 40);
const assert = process.argv.includes("--assert");
const doctrines = ["", "supply", "soul", "command"];
const summary = [];

function simulate(seed, runNumber, legacyId) {
  const run = Engine.fresh("legacy-" + seed, runNumber, true, legacyId);
  for (let day = 0; day < 160 && run.active; day += 1) Engine.step(run);
  if (run.active || !run.result) throw new Error("Legacy balance simulation did not finish");
  for (const world of run.worlds) {
    if (![world.resource, world.p, world.d, world.xp].every(Number.isFinite)) {
      throw new Error("Non-finite world state for " + legacyId);
    }
    if (world.resource < 0 || world.d < 0 || world.d > 100) {
      throw new Error("Out-of-range world state for " + legacyId);
    }
  }
  return {
    saved: run.result.saved,
    failed: run.result.failed,
    shards: run.result.shards,
    endedDay: run.result.endedDay,
  };
}

for (const runNumber of [1, 2, 3]) {
  const results = Object.fromEntries(doctrines.map((id) => [id || "baseline", []]));
  for (let seed = 0; seed < seeds; seed += 1) {
    for (const id of doctrines) results[id || "baseline"].push(simulate(seed, runNumber, id));
  }
  const baseline = results.baseline.reduce((sum, result) => sum + result.saved, 0);
  const worlds = seeds * (runNumber >= 3 ? 3 : 2);
  const row = { runNumber, seeds, worlds, baselineSaved: baseline };
  for (const id of doctrines.slice(1)) {
    const values = results[id];
    const saved = values.reduce((sum, result) => sum + result.saved, 0);
    const shards = values.reduce((sum, result) => sum + result.shards, 0);
    const meanEndDay = values.reduce((sum, result) => sum + result.endedDay, 0) / values.length;
    row[id] = {
      saved,
      savedRate: Number((saved / worlds).toFixed(4)),
      savedDelta: saved - baseline,
      meanShards: Number((shards / seeds).toFixed(2)),
      meanEndDay: Number(meanEndDay.toFixed(2)),
    };
    if (assert && saved < baseline - Math.max(1, Math.ceil(seeds * 0.1))) {
      throw new Error(id + " materially regressed against baseline in run " + runNumber);
    }
  }
  summary.push(row);
}

console.log(JSON.stringify({ seedsPerRunNumber: seeds, summary }, null, 2));
