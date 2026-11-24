import { pathToFileURL } from "node:url";
import Engine from "../src/engine.js";
import { LABELS } from "../src/config/game-data.js";
import { readWorldTerminal } from "./balance-outcome.mjs";
import {
  OPENING_WORLD_MAX_DAYS,
  collectOpeningWorlds,
  getOpeningWorlds,
  isOpeningWorldCohortComplete,
  openingWorldEndDay,
} from "./world-cohort.mjs";
import { buildStrategyProfiles, STRATEGY_IDS } from "./strategy-matrix-core.mjs";

const params = process.argv.slice(2);
const seeds = Number(params.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] ?? 60);
const shouldAssert = params.includes("--assert");
const trackedWorldTypes = ["lingzai", "zombie", "beast"];

if (!Number.isInteger(seeds) || seeds < 10 || seeds > 1000) {
  throw new RangeError("--seeds must be an integer between 10 and 1000");
}

function round(value, digits = 3) {
  return Number(value.toFixed(digits));
}

function profileId(worldIds, strategies) {
  return worldIds.map((worldId) => `${worldId}-${strategies[worldId]}`).join("__");
}

function simulateProfile(runNumber, profile, samples) {
  let fullySaved = 0;
  let totalSaved = 0;
  let totalEndDay = 0;
  let incomplete = 0;
  let unknownFailures = 0;
  const totals = Object.fromEntries(
    trackedWorldTypes.map((id) => [
      id,
      { visits: 0, saved: 0, actions: {}, failed: {}, endDay: 0, endDayCount: 0 },
    ]),
  );
  const actionTotals = {};

  for (let index = 0; index < samples; index++) {
    const state = Engine.fresh(
      `strategy-matrix-r${runNumber}-s${index}`,
      runNumber,
      false,
      "",
      runNumber - 1,
    );
    const applyProfile = () => {
      for (const world of state.worlds) {
        const strategy = profile.strategies[world.id];
        if (world.status === "running" && strategy) world.strategy = strategy;
      }
    };
    applyProfile();

    const cohort = collectOpeningWorlds(state);
    const terminalByInstance = new Map();
    let ticks = 0;
    while (state.active && !isOpeningWorldCohortComplete(state, cohort) && ticks < OPENING_WORLD_MAX_DAYS) {
      const terminalDay = state.day;
      Engine.step(state);
      ticks++;
      applyProfile();
      collectOpeningWorlds(state, cohort);
      for (const world of getOpeningWorlds(state, cohort)) {
        const key = world.worldNumber;
        if (world.status !== "running" && !terminalByInstance.has(key)) {
          terminalByInstance.set(key, readWorldTerminal(world, state.logs, terminalDay));
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
    totalEndDay += openingWorldEndDay(cohortWorlds);

    for (const world of cohortWorlds) {
      const key = world.worldNumber;
      const row = totals[world.id];
      const terminal = terminalByInstance.get(key);
      if (!row) continue;
      row.visits++;
      if (world.status === "saved") {
        row.saved++;
      } else {
        const reason = terminal?.reason ?? "未知原因";
        row.failed[reason] = (row.failed[reason] || 0) + 1;
        if (reason === "未知原因") unknownFailures++;
      }
      if (terminal) {
        row.endDay += terminal.day;
        row.endDayCount++;
      }
      for (const [action, count] of Object.entries(world.metrics?.actions || {})) {
        actionTotals[action] = (actionTotals[action] || 0) + count;
        row.actions[action] = (row.actions[action] || 0) + count;
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
      trackedWorldTypes.map((id) => [
        id,
        totals[id].visits ? round(totals[id].saved / totals[id].visits) : null,
      ]),
    ),
    worldVisits: Object.fromEntries(trackedWorldTypes.map((id) => [id, totals[id].visits])),
    worldOutcomeReasons: Object.fromEntries(
      trackedWorldTypes.map((id) => [
        id,
        {
          savedRate: totals[id].visits ? round(totals[id].saved / totals[id].visits) : null,
          failureReasons: Object.fromEntries(
            Object.entries(totals[id].failed)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([reason, count]) => [reason, round(count / totals[id].visits)]),
          ),
        },
      ]),
    ),
    meanWorldEndDay: Object.fromEntries(
      trackedWorldTypes.map((id) => [
        id,
        totals[id].endDayCount ? round(totals[id].endDay / totals[id].endDayCount, 2) : null,
      ]),
    ),
    meanActionsByWorld: Object.fromEntries(
      trackedWorldTypes.map((id) => [
        id,
        Object.fromEntries(
          Object.entries(totals[id].actions)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([action, count]) => [
              action,
              totals[id].visits ? round(count / totals[id].visits, 2) : 0,
            ]),
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

function compareToDefault(row, baseline) {
  return {
    allSavedRate: round(row.allSavedRate - baseline.allSavedRate),
    meanSavedWorlds: round(row.meanSavedWorlds - baseline.meanSavedWorlds, 2),
    meanEndDay: round(row.meanEndDay - baseline.meanEndDay, 2),
    worldSaveRates: Object.fromEntries(
      trackedWorldTypes.map((id) => {
        const current = row.worldSaveRates[id];
        const previous = baseline.worldSaveRates[id];
        return [id, current === null || previous === null ? null : round(current - previous)];
      }),
    ),
  };
}

function runMatrix(samples) {
  const runs = [];

  for (const runNumber of [1, 2, 3]) {
    const template = Engine.fresh(
      `strategy-matrix-default-r${runNumber}`,
      runNumber,
      false,
      "",
      runNumber - 1,
    );
    const initialWorldIds = template.worlds.map((world) => world.id);
    const defaults = Object.fromEntries(template.worlds.map((world) => [world.id, world.strategy]));
    const defaultProfileId = profileId(initialWorldIds, defaults);
    const profiles = buildStrategyProfiles(initialWorldIds);
    const rows = profiles.map((profile) => simulateProfile(runNumber, profile, samples));
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
      deltaFromDefault: compareToDefault(row, baseline),
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
      initialWorldIds,
      trackedWorldTypes,
      samplesPerProfile: samples,
      defaultProfileId,
      expectedProfileCount: STRATEGY_IDS.length ** initialWorldIds.length,
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
    simulationMode:
      "战潮关闭；不执行玩家主动干预；只统计每局最先访问的三个世界实例，新穿越的后续实例不纳入本轮样本。新世界沿用已配置的同类型策略，否则使用默认策略。",
    interpretation:
      "各策略组合使用相同的初始种子编号；策略导致行动分歧后，后续随机流可能不同。结果按世界实例访问次数归一，用于描述策略组合，不构成玩家行为或严格因果保证。",
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
