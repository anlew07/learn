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
      const actionTotals = {};
      let worldCount = 0;
      let waveBattles = 0;
      let evolutionCount = 0;
      let autoBuilds = 0;
      let manualBuilds = 0;
      let extraXp = 0;
      let extraResources = 0;
      let extraDoomReduction = 0;
      let waveClearBonus = 0;
      let waveLossMitigation = 0;
      let waveLootModifier = 0;

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
          worldCount++;
          const metrics = world.metrics || {};
          for (const [action, count] of Object.entries(metrics.actions || {})) {
            actionTotals[action] = (actionTotals[action] || 0) + count;
          }
          waveBattles += metrics.waveCombats || 0;
          evolutionCount += metrics.evolutions || 0;
          autoBuilds += metrics.automaticBuilds || 0;
          manualBuilds += metrics.manualBuilds || 0;
          extraXp += metrics.extraXp || 0;
          extraResources += metrics.extraResources || 0;
          extraDoomReduction += metrics.extraDoomReduction || 0;
          waveClearBonus += metrics.waveClearBonus || 0;
          waveLossMitigation += metrics.waveLossMitigation || 0;
          waveLootModifier += metrics.waveLootModifier || 0;
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
        engagement: {
          meanActionsPerRun: Object.fromEntries(
            Object.entries(actionTotals).map(([action, count]) => [
              action,
              completed ? Number((count / completed).toFixed(2)) : 0,
            ]),
          ),
          meanWaveBattles: completed ? Number((waveBattles / completed).toFixed(2)) : 0,
          meanAutomaticBuilds: completed ? Number((autoBuilds / completed).toFixed(2)) : 0,
          meanManualBuilds: completed ? Number((manualBuilds / completed).toFixed(2)) : 0,
          evolutionRatePerWorld: worldCount ? Number((evolutionCount / worldCount).toFixed(3)) : 0,
          meanExtraXp: completed ? Number((extraXp / completed).toFixed(2)) : 0,
          meanExtraResources: completed ? Number((extraResources / completed).toFixed(2)) : 0,
          meanExtraDoomReduction: completed
            ? Number((extraDoomReduction / completed).toFixed(2))
            : 0,
          meanWaveClearBonus: completed
            ? Number((waveClearBonus / completed).toFixed(2))
            : 0,
          meanWaveLossMitigation: completed
            ? Number((waveLossMitigation / completed).toFixed(2))
            : 0,
          meanWaveLootModifier: completed
            ? Number((waveLootModifier / completed).toFixed(2))
            : 0,
        },
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
  const firstRunDefaultWithWaves = reports.find(
    (row) => row.runNumber === 1 && row.strategy === "default" && row.waves,
  );
  const rates = firstRunStrategies.map((row) => row.allSavedRate);
  const spread = Math.max(...rates) - Math.min(...rates);

  const invalidWaveAccounting = reports.some((row) => {
    const e = row.engagement;
    const totalBattles = e.meanActionsPerRun.fight || 0;
    if (e.meanWaveBattles > totalBattles + 0.02) return true;
    if (row.waves) {
      return (
        e.meanExtraXp > e.meanWaveBattles * 0.75 + 0.05 ||
        e.meanWaveClearBonus > e.meanWaveBattles * 0.15 + 0.05 ||
        e.meanWaveLossMitigation > e.meanWaveBattles * 0.08 + 0.05 ||
        e.meanWaveLootModifier > e.meanWaveBattles * 0.1 + 0.05
      );
    }
    return (
      e.meanWaveBattles !== 0 ||
      e.meanExtraXp !== 0 ||
      e.meanExtraResources !== 0 ||
      e.meanExtraDoomReduction !== 0 ||
      e.meanWaveClearBonus !== 0 ||
      e.meanWaveLossMitigation !== 0 ||
      e.meanWaveLootModifier !== 0 ||
      e.evolutionRatePerWorld !== 0
    );
  });

  if (
    reports.some((row) => row.incomplete > 0) ||
    firstRunDefault.allSavedRate >= 0.98 ||
    spread < 0.1 ||
    firstRunDefaultWithWaves.engagement.meanWaveBattles < 0.1 ||
    firstRunDefaultWithWaves.engagement.meanWaveBattles > 5 ||
    invalidWaveAccounting
  ) {
    process.stderr.write(
      "Balance check failed: stalled run, strategy gap, wave engagement or rewards.\n",
    );
    process.exitCode = 1;
  }
}
