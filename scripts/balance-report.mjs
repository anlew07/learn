import Engine from "../src/engine.js";
import { BALANCE } from "../src/config/balance.js";

const argumentsList = process.argv.slice(2);
const sampleOption = argumentsList.find((arg) => arg.startsWith("--seeds="));
const samples = Number(sampleOption?.split("=")[1] ?? 100);
const shouldAssert = argumentsList.includes("--assert");

if (!Number.isInteger(samples) || samples < 10 || samples > 10000) {
  throw new RangeError("--seeds must be an integer between 10 and 10000");
}

const strategies = ["default", "growth", "clear", "rescue"];
const reports = [];

for (const runNumber of [1, 2, 3]) {
  for (const strategy of strategies) {
    for (const waves of [false, true]) {
      let fullySaved = 0;
      let totalSaved = 0;
      let totalDays = 0;
      let incomplete = 0;
      const savedByWorld = {};

      for (let index = 0; index < samples; index++) {
        // Keep the same seed across strategies and wave settings for useful comparisons.
        const state = Engine.fresh(`balance-v2-r${runNumber}-${index}`, runNumber, waves);
        if (strategy !== "default") {
          state.worlds.forEach((world) => {
            world.strategy = strategy;
          });
        }

        let days = 0;
        while (state.active && days++ < 200) {
          Engine.step(state);
        }

        if (state.active || !state.result) {
          incomplete++;
          continue;
        }

        fullySaved += Number(state.result.saved === state.worlds.length);
        totalSaved += state.result.saved;
        totalDays += state.result.endedDay;
        state.worlds.forEach((world) => {
          savedByWorld[world.id] = (savedByWorld[world.id] || 0) + Number(world.status === "saved");
        });
      }

      const completed = samples - incomplete;
      reports.push({
        runNumber,
        strategy,
        waves,
        completed,
        incomplete,
        allSavedRate: completed ? Number((fullySaved / completed).toFixed(3)) : null,
        meanSaved: completed ? Number((totalSaved / completed).toFixed(2)) : null,
        meanEndDay: completed ? Number((totalDays / completed).toFixed(1)) : null,
        worldSaveRates: Object.fromEntries(
          Object.entries(savedByWorld).map(([id, count]) => [
            id,
            completed ? Number((count / completed).toFixed(3)) : null,
          ]),
        ),
      });
    }
  }
}

const result = {
  engineVersion: Engine.VERSION,
  samplesPerCombination: samples,
  doomTuning: BALANCE.doom,
  reports,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (shouldAssert) {
  const firstRunDefault = reports.find(
    (row) => row.runNumber === 1 && row.strategy === "default" && !row.waves,
  );
  const firstRunStrategies = reports.filter((row) => row.runNumber === 1 && !row.waves);
  const rates = firstRunStrategies.map((row) => row.allSavedRate);
  const spread = Math.max(...rates) - Math.min(...rates);

  if (
    reports.some((row) => row.incomplete > 0) ||
    firstRunDefault.allSavedRate >= 0.98 ||
    spread < 0.1
  ) {
    process.stderr.write(
      "Balance smoke test failed: a run stalled, default all-save rate is too high, or strategy outcomes collapsed.\n",
    );
    process.exitCode = 1;
  }
}
