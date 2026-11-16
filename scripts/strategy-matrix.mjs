import { pathToFileURL } from "node:url";
import Engine from "../src/engine.js";
import { LABELS } from "../src/config/game-data.js";
import { readWorldTerminal } from "./balance-outcome.mjs";
import { buildStrategyProfiles, STRATEGY_IDS } from "./strategy-matrix-core.mjs";

const params = process.argv.slice(2);
const seeds = Number(params.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] ?? 60);
const shouldAssert = params.includes("--assert");

if (!Number.isInteger(seeds) || seeds < 10 || seeds > 1000) {
  throw new RangeError("--seeds must be an integer between 10 and 1000");
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function profileId(worldIds, strategies) {
  return worldIds.map((worldId) => `${worldId}-${strategies[worldId]}`).join("__");
}

function simulateProfile(runNumber, profile, worldIds, samples) {
  let fullySaved = 0;
  let totalSaved = 0;
  let totalEndDay = 0;
  let incomplete = 0;
  let unknownFailures = 0;
  const savedByWorld = Object.fromEntries(worldIds.map((id) => [id, 0]));
  const actionsByWorld = Object.fromEntries(worldIds.map((id) => [id, {}]));
  const outcomesByWorld = Object.fromEntries(worldIds.map((id) => [id, { saved: 0, failed: {} }]));
  const endDayTotalsByWorld = Object.fromEntries(worldIds.map((id) => [id, 0]));
  const endDayCountsByWorld = Object.fromEntries(worldIds.map((id) => [id, 0]));
  const actionTotals = {};

  for (let index = 0; index < samples; index++) {
    const state = Engine.fresh(`strategy-matrix-r${runNumber}-s${index}`, runNumber, false);
    state.worlds.forEach((world) => {
      world.strategy = profile.strategies[world.id];
    });

    const terminalByWorld = {};
    let ticks = 0;
    while (state.active && ticks < 200) {
      const terminalDay = state.day;
      Engine.step(state);
      ticks++;
      for (const world of state.worlds) {
        if (world.status !== "running" && !terminalByWorld[world.id]) {
          terminalByWorld[world.id] = readWorldTerminal(world, state.logs, terminalDay);
        }
      }
    }

    if (state.active || !state.result) {
      incomplete++;
      continue;
    }

    const savedCount = state.worlds.filter((world) => world.status === "saved").length;
    fullySaved += Number(savedCount === worldIds.length);
    totalSaved += savedCount;
    totalEndDay += state.result.endedDay;

    for (const world of state.worlds) {
      const outcomes = outcomesByWorld[world.id];
      const terminal =
        terminalByWorld[world.id] ?? readWorldTerminal(world, state.logs, state.result.endedDay);

      if (world.status === "saved") {
        savedByWorld[world.id]++;
        outcomes.saved++;
      } else {
        const reason = terminal?.reason ?? "未知原因";
        outcomes.failed[reason] = (outcomes.failed[reason] || 0) + 1;
        if (reason === "未知原因") unknownFailures++;
      }

      if (terminal) {
        endDayTotalsByWorld[world.id] += terminal.day;
        endDayCountsByWorld[world.id]++;
      }

      for (const [action, count] of Object.entries(world.metrics?.actions || {})) {
        actionTotals[action] = (actionTotals[action] || 0) + count;
        const worldActions = actionsByWorld[world.id];
        worldActions[action] = (worldActions[action] || 0) + count;
      }
    }
  }

  const completed = samples - incomplete;
  return {
    profileId: profile.id,
    strategies: profile.strategies,
    completed,
    incomplete,
    unknownFailures,
    allSavedRate: completed ? round(fullySaved / completed) : null,
    meanSavedWorlds: completed ? round(totalSaved / completed, 2) : null,
    meanEndDay: completed ? round(totalEndDay / completed, 2) : null,
    worldSaveRates: Object.fromEntries(
      worldIds.map((id) => [id, completed ? round(savedByWorld[id] / completed) : null]),
    ),
    worldOutcomeReasons: Object.fromEntries(
      worldIds.map((id) => {
        const outcomes = outcomesByWorld[id];
        return [
          id,
          {
            savedRate: completed ? round(outcomes.saved / completed) : null,
            failureReasons: Object.fromEntries(
              Object.entries(outcomes.failed)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([reason, count]) => [reason, round(count / completed)]),
            ),
          },
        ];
      }),
    ),
    meanWorldEndDay: Object.fromEntries(
      worldIds.map((id) => [
        id,
        endDayCountsByWorld[id]
          ? round(endDayTotalsByWorld[id] / endDayCountsByWorld[id], 2)
          : null,
      ]),
    ),
    meanActionsByWorld: Object.fromEntries(
      worldIds.map((id) => [
        id,
        Object.fromEntries(
          Object.entries(actionsByWorld[id])
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([action, count]) => [action, round(count / completed, 2)]),
        ),
      ]),
    ),
    meanActionsPerRun: Object.fromEntries(
      Object.entries(actionTotals)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([action, count]) => [action, round(count / completed, 2)]),
    ),
  };
}

function compareToDefault(row, baseline, worldIds) {
  return {
    allSavedRate: round(row.allSavedRate - baseline.allSavedRate),
    meanSavedWorlds: round(row.meanSavedWorlds - baseline.meanSavedWorlds, 2),
    meanEndDay: round(row.meanEndDay - baseline.meanEndDay, 2),
    worldSaveRates: Object.fromEntries(
      worldIds.map((id) => [id, round(row.worldSaveRates[id] - baseline.worldSaveRates[id])]),
    ),
  };
}

function runMatrix(samples) {
  const runs = [];

  for (const runNumber of [1, 2, 3]) {
    const template = Engine.fresh(`strategy-matrix-default-r${runNumber}`, runNumber, false);
    const worldIds = template.worlds.map((world) => world.id);
    const defaults = Object.fromEntries(template.worlds.map((world) => [world.id, world.strategy]));
    const defaultProfileId = profileId(worldIds, defaults);
    const profiles = buildStrategyProfiles(worldIds);
    const rows = profiles.map((profile) => simulateProfile(runNumber, profile, worldIds, samples));
    const baseline = rows.find((row) => row.profileId === defaultProfileId);

    if (!baseline) {
      throw new Error(`Default strategy profile missing for run ${runNumber}`);
    }

    const comparisons = rows.map((row) => ({
      profileId: row.profileId,
      strategies: row.strategies,
      isDefault: row.profileId === defaultProfileId,
      allSavedRate: row.allSavedRate,
      meanSavedWorlds: row.meanSavedWorlds,
      meanEndDay: row.meanEndDay,
      worldSaveRates: row.worldSaveRates,
      deltaFromDefault: compareToDefault(row, baseline, worldIds),
    }));
    const leadingProfiles = [...rows]
      .sort(
        (a, b) =>
          b.allSavedRate - a.allSavedRate ||
          b.meanSavedWorlds - a.meanSavedWorlds ||
          a.meanEndDay - b.meanEndDay,
      )
      .slice(0, 5)
      .map((row) => ({
        profileId: row.profileId,
        strategies: row.strategies,
        allSavedRate: row.allSavedRate,
        meanSavedWorlds: row.meanSavedWorlds,
        meanEndDay: row.meanEndDay,
        worldSaveRates: row.worldSaveRates,
      }));

    runs.push({
      runNumber,
      worldIds,
      samplesPerProfile: samples,
      defaultProfileId,
      expectedProfileCount: STRATEGY_IDS.length ** worldIds.length,
      profiles: rows,
      comparisons,
      leadingProfiles,
    });
  }

  return {
    engineVersion: Engine.VERSION,
    samplesPerProfile: samples,
    strategyIds: STRATEGY_IDS,
    strategyLabels: LABELS,
    simulationMode: "战潮关闭；不执行玩家主动干预；每个世界固定使用指定长期策略。",
    interpretation:
      "各策略组合使用相同的初始种子编号；策略导致行动分歧后，后续随机流可能不同。结果用于描述策略组合，不构成玩家行为或严格因果保证。",
    runs,
  };
}

function assertMatrix(result) {
  for (const run of result.runs) {
    if (run.profiles.length !== run.expectedProfileCount) {
      throw new Error(`Strategy profile count mismatch in run ${run.runNumber}`);
    }
    if (!run.profiles.some((row) => row.profileId === run.defaultProfileId)) {
      throw new Error(`Default profile missing in run ${run.runNumber}`);
    }
    if (
      run.profiles.some(
        (row) =>
          row.incomplete > 0 ||
          row.unknownFailures > 0 ||
          row.completed !== result.samplesPerProfile,
      )
    ) {
      throw new Error(`Incomplete run or unclassified failure in run ${run.runNumber}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runMatrix(seeds);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (shouldAssert) assertMatrix(result);
}
