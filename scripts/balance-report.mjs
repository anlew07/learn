import Engine from "../src/engine.js";
import { BALANCE } from "../src/config/balance.js";
import { readWorldTerminal } from "./balance-outcome.mjs";
import {
  collectOpeningWorlds,
  getOpeningWorlds,
  isOpeningWorldCohortComplete,
  openingWorldEndDay,
} from "./world-cohort.mjs";

const argumentsList = process.argv.slice(2);
const sampleOption = argumentsList.find((arg) => arg.startsWith("--seeds="));
const samples = Number(sampleOption?.split("=")[1] ?? 100);
const shouldAssert = argumentsList.includes("--assert");
const worldIds = ["lingzai", "zombie", "beast"];

if (!Number.isInteger(samples) || samples < 10 || samples > 10000) {
  throw new RangeError("--seeds must be an integer between 10 and 10000");
}

const strategies = ["default", "growth", "clear", "rescue"];
const reports = [];

function emptyWorld() {
  return {
    visits: 0,
    saved: 0,
    actions: {},
    failureReasons: {},
    endDay: 0,
    endDayCount: 0,
  };
}


for (const runNumber of [1, 2, 3]) {
  for (const strategy of strategies) {
    for (const waves of [false, true]) {
      let fullySaved = 0;
      let totalSaved = 0;
      let totalVisited = 0;
      let totalDays = 0;
      let incomplete = 0;
      const worlds = Object.fromEntries(worldIds.map((id) => [id, emptyWorld()]));
      const actionTotals = {};
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
        // Initial parallel slots follow permanent rescue progression: 1 → 2 → 3.
        const savedBeforeRun = Math.min(2, Math.max(0, runNumber - 1));
        const state = Engine.fresh(
          `balance-v2-r${runNumber}-${index}`,
          runNumber,
          waves,
          "",
          savedBeforeRun,
        );
        const cohort = collectOpeningWorlds(state);
        const terminalByInstance = new Map();
        const applyStrategy = () => {
          if (strategy === "default") return;
          for (const world of state.worlds) {
            if (world.status === "running") world.strategy = strategy;
          }
        };
        applyStrategy();

        let days = 0;
        while (state.active && !isOpeningWorldCohortComplete(state, cohort) && days++ < 200) {
          const currentDay = state.day;
          Engine.step(state);
          applyStrategy();
          collectOpeningWorlds(state, cohort);
          for (const world of getOpeningWorlds(state, cohort)) {
            const key = world.worldNumber;
            if (world.status !== "running" && !terminalByInstance.has(key)) {
              terminalByInstance.set(key, readWorldTerminal(world, state.logs, currentDay));
            }
          }
        }

        const cohortWorlds = getOpeningWorlds(state, cohort);
        if (!isOpeningWorldCohortComplete(state, cohort)) {
          incomplete++;
          continue;
        }

        const cohortSaved = cohortWorlds.filter((world) => world.status === "saved").length;
        fullySaved += Number(cohortWorlds.length > 0 && cohortSaved === cohortWorlds.length);
        totalSaved += cohortSaved;
        totalVisited += cohortWorlds.length;
        totalDays += openingWorldEndDay(cohortWorlds);

        for (const world of cohortWorlds) {
          const key = world.worldNumber;
          const row = worlds[world.id];
          const terminal = terminalByInstance.get(key);
          const metrics = world.metrics || {};
          row.visits++;
          row.saved += Number(world.status === "saved");
          if (terminal) {
            row.endDay += terminal.day;
            row.endDayCount++;
          }
          for (const [action, count] of Object.entries(metrics.actions || {})) {
            actionTotals[action] = (actionTotals[action] || 0) + count;
            row.actions[action] = (row.actions[action] || 0) + count;
          }
          if (world.status !== "saved") {
            const reason = terminal?.reason ?? "未知原因";
            row.failureReasons[reason] = (row.failureReasons[reason] || 0) + 1;
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
        }
      }

      const completed = samples - incomplete;
      const worldCount = Object.values(worlds).reduce((sum, row) => sum + row.visits, 0);
      reports.push({
        runNumber,
        strategy,
        waves,
        completed,
        incomplete,
        allSavedRate: completed ? Number((fullySaved / completed).toFixed(3)) : null,
        meanSaved: completed ? Number((totalSaved / completed).toFixed(2)) : null,
        meanVisitedWorlds: completed ? Number((totalVisited / completed).toFixed(2)) : null,
        meanEndDay: completed ? Number((totalDays / completed).toFixed(1)) : null,
        worldSaveRates: Object.fromEntries(
          worldIds.map((id) => [
            id,
            worlds[id].visits ? Number((worlds[id].saved / worlds[id].visits).toFixed(3)) : null,
          ]),
        ),
        worldVisits: Object.fromEntries(worldIds.map((id) => [id, worlds[id].visits])),
        worldOutcomeReasons: Object.fromEntries(
          worldIds.map((id) => [
            id,
            {
              savedRate: worlds[id].visits
                ? Number((worlds[id].saved / worlds[id].visits).toFixed(3))
                : null,
              failureReasons: Object.fromEntries(
                Object.entries(worlds[id].failureReasons).map(([reason, count]) => [
                  reason,
                  worlds[id].visits ? Number((count / worlds[id].visits).toFixed(3)) : null,
                ]),
              ),
            },
          ]),
        ),
        meanWorldEndDay: Object.fromEntries(
          worldIds.map((id) => [
            id,
            worlds[id].endDayCount
              ? Number((worlds[id].endDay / worlds[id].endDayCount).toFixed(1))
              : null,
          ]),
        ),
        engagement: {
          meanActionsByWorld: Object.fromEntries(
            worldIds.map((id) => [
              id,
              Object.fromEntries(
                Object.entries(worlds[id].actions).map(([action, count]) => [
                  action,
                  worlds[id].visits ? Number((count / worlds[id].visits).toFixed(2)) : 0,
                ]),
              ),
            ]),
          ),
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
          meanWaveClearBonus: completed ? Number((waveClearBonus / completed).toFixed(2)) : 0,
          meanWaveLossMitigation: completed
            ? Number((waveLossMitigation / completed).toFixed(2))
            : 0,
          meanWaveLootModifier: completed ? Number((waveLootModifier / completed).toFixed(2)) : 0,
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
  const rescueSpread =
    Math.max(...firstRunStrategies.map((row) => row.meanSaved)) -
    Math.min(...firstRunStrategies.map((row) => row.meanSaved));

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
    rescueSpread < 0.1 ||
    firstRunDefaultWithWaves.engagement.meanWaveBattles < 0.1 ||
    firstRunDefaultWithWaves.engagement.meanWaveBattles > 5 ||
    invalidWaveAccounting
  ) {
    process.stderr.write(
      "Balance check failed: stalled run, rescue spread, wave engagement or rewards.\n",
    );
    process.exitCode = 1;
  }
}
