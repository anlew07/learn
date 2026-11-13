import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import Engine from "../src/engine.js";
import { BALANCE } from "../src/config/balance.js";
import { readWorldTerminal } from "./balance-outcome.mjs";

const strategies = ["default", "growth", "clear", "rescue"];
const worldIds = ["lingzai", "zombie", "beast"];

function average(value, count) {
  return Number((value / count).toFixed(3));
}

function runScenario(seeds, strategy, waves) {
  const totals = {};
  for (const id of worldIds) {
    totals[id] = {
      saved: 0,
      endDay: 0,
      resource: 0,
      p: 0,
      d: 0,
      actions: {},
      failureReasons: {},
    };
  }

  let completed = 0;
  let allSaved = 0;
  let totalRunDay = 0;

  for (let index = 0; index < seeds; index++) {
    const state = Engine.fresh("balance-v2-r3-" + index, 3, waves);
    const ends = {};
    if (strategy !== "default") {
      for (const world of state.worlds) world.strategy = strategy;
    }

    let ticks = 0;
    while (state.active && ticks++ < 200) {
      const currentDay = state.day;
      Engine.step(state);
      for (const world of state.worlds) {
        if (world.status !== "running" && !ends[world.id]) {
          ends[world.id] = readWorldTerminal(world, state.logs, currentDay);
        }
      }
    }
    if (state.active || !state.result) continue;

    completed++;
    allSaved += Number(state.result.saved === state.worlds.length);
    totalRunDay += state.result.endedDay;
    for (const world of state.worlds) {
      const row = totals[world.id];
      row.saved += Number(world.status === "saved");
      row.endDay += ends[world.id]?.day ?? state.result.endedDay;
      row.resource += world.resource;
      row.p += world.p;
      row.d += world.d;
      for (const [action, count] of Object.entries(world.metrics?.actions || {})) {
        row.actions[action] = (row.actions[action] || 0) + count;
      }
      if (world.status !== "saved") {
        const reason = ends[world.id]?.reason ?? "未知原因";
        row.failureReasons[reason] = (row.failureReasons[reason] || 0) + 1;
      }
    }
  }

  const worlds = {};
  for (const id of worldIds) {
    const row = totals[id];
    const actions = {};
    const failureReasons = {};
    for (const [action, count] of Object.entries(row.actions)) {
      actions[action] = completed ? average(count, completed) : null;
    }
    for (const [reason, count] of Object.entries(row.failureReasons)) {
      failureReasons[reason] = completed ? average(count, completed) : null;
    }
    worlds[id] = {
      savedRate: completed ? average(row.saved, completed) : null,
      meanEndDay: completed ? average(row.endDay, completed) : null,
      meanRemainingResources: completed ? average(row.resource, completed) : null,
      meanP: completed ? average(row.p, completed) : null,
      meanD: completed ? average(row.d, completed) : null,
      meanActions: actions,
      failureReasons,
    };
  }
  return {
    completed,
    incomplete: seeds - completed,
    allSavedRate: completed ? average(allSaved, completed) : null,
    meanRunEndDay: completed ? average(totalRunDay, completed) : null,
    worlds,
  };
}

/**
 * Pair identical seeds. The baseline disables the two PR #30 bonuses;
 * the candidate uses the current values. Always restore shared tuning.
 */
export function compareBeastSuppression(seeds = 100, { waves = false } = {}) {
  if (!Number.isInteger(seeds) || seeds < 10 || seeds > 1000) {
    throw new RangeError("seeds must be an integer between 10 and 1000");
  }

  const actions = BALANCE.actions;
  const relief = actions.beastSuppressionDoomRelief;
  const mitigation = actions.beastSuppressionThreatMitigation;
  const rows = [];
  try {
    for (const mode of ["baseline", "candidate"]) {
      actions.beastSuppressionDoomRelief = mode === "baseline" ? 0 : relief;
      actions.beastSuppressionThreatMitigation = mode === "baseline" ? 0 : mitigation;
      for (const strategy of strategies) {
        rows.push({ mode, strategy, ...runScenario(seeds, strategy, waves) });
      }
    }
  } finally {
    actions.beastSuppressionDoomRelief = relief;
    actions.beastSuppressionThreatMitigation = mitigation;
  }

  const comparisons = [];
  for (const strategy of strategies) {
    const baseline = rows.find((row) => row.mode === "baseline" && row.strategy === strategy);
    const candidate = rows.find((row) => row.mode === "candidate" && row.strategy === strategy);
    const difference = candidate.worlds.beast.savedRate - baseline.worlds.beast.savedRate;
    comparisons.push({
      strategy,
      beastSaveRateBaseline: baseline.worlds.beast.savedRate,
      beastSaveRateCandidate: candidate.worlds.beast.savedRate,
      deltaBeastSaveRate: Number(difference.toFixed(3)),
      deltaAllSavedRate: Number((candidate.allSavedRate - baseline.allSavedRate).toFixed(3)),
      otherWorldRatesUnchanged: worldIds
        .filter((id) => id !== "beast")
        .every((id) => baseline.worlds[id].savedRate === candidate.worlds[id].savedRate),
    });
  }
  return {
    samplesPerVariant: seeds,
    runNumber: 3,
    waves,
    tuning: { relief, mitigation },
    rows,
    comparisons,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const params = process.argv.slice(2);
  const seedsText = params.find((arg) => arg.startsWith("--seeds="));
  const seeds = Number(seedsText?.split("=")[1] ?? 100);
  const report = compareBeastSuppression(seeds, { waves: params.includes("--waves") });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (
    params.includes("--assert") &&
    (report.rows.some((row) => row.incomplete > 0) ||
      report.comparisons.some((row) => row.deltaBeastSaveRate < 0))
  ) {
    throw new Error("Beast A/B check failed: stalled run or lower rescue rate.");
  }
}
