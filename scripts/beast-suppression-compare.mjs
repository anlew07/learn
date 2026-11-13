import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import Engine from "../src/engine.js";
import { BALANCE } from "../src/config/balance.js";
import { readWorldTerminal } from "./balance-outcome.mjs";

const STRATEGIES = ["default", "growth", "clear", "rescue"];
const WORLD_IDS = ["lingzai", "zombie", "beast"];

function mean(value, samples) {
  return Number((value / samples).toFixed(3));
}

function simulateStrategy(strategy, seeds, waves) {
  const worlds = Object.fromEntries(
    WORLD_IDS.map((id) => [
      id,
      {
        saved: 0,
        totalD: 0,
        totalP: 0,
        totalResources: 0,
        totalEndDay: 0,
        actions: {},
        failures: {},
      },
    ]),
  );
  let fullySaved = 0;
  let totalRunEndDay = 0;
  let incomplete = 0;

  for (let index = 0; index < seeds; index++) {
    // Reuse the exact seed scheme used by balance-report.mjs.
    const state = Engine.fresh("balance-v2-r3-" + index, 3, waves);
    const terminalByWorld = {};
    if (strategy !== "default") {
      state.worlds.forEach((world) => {
        world.strategy = strategy;
      });
    }

    let ticks = 0;
    while (state.active && ticks++ < 200) {
      const day = state.day;
      Engine.step(state);
      for (const world of state.worlds) {
        if (world.status !== "running" && !terminalByWorld[world.id]) {
          terminalByWorld[world.id] = readWorldTerminal(world, state.logs, day);
        }
      }
    }
    if (state.active || !state.result) {
      incomplete++;
      continue;
    }
    fullySaved += Number(state.result.saved === state.worlds.length);
    totalRunEndDay += state.result.endedDay;
    for (const world of state.worlds) {
      const row = worlds[world.id];
      row.saved += Number(world.status === "saved");
      row.totalD += world.d;
      row.totalP += world.p;
      row.totalResources += world.resource;
      row.totalEndDay += terminalByWorld[world.id]?.day ?? state.result.endedDay;
      for (const [action, count] of Object.entries(world.metrics?.actions || {})) {
        row.actions[action] = (row.actions[action] || 0) + count;
      }
      if (world.status === "failed") {
        const reason = terminalByWorld[world.id]?.reason ?? "未知原因";
        row.failures[reason] = (row.failures[reason] || 0) + 1;
      }
    }
  }

  const completed = seeds - incomplete;
  return {
    strategy,
    completed,
    incomplete,
    allSavedRate: completed ? mean(fullySaved, completed) : null,
    meanRunEndDay: completed ? mean(totalRunEndDay, completed) : null,
    worlds: Object.fromEntries(
      WORLD_IDS.map((id) => {
        const data = worlds[id];
        return [
          id,
          {
            savedRate: completed ? mean(data.saved, completed) : null,
            meanD: completed ? mean(data.totalD, completed) : null,
            meanP: completed ? mean(data.totalP, completed) : null,
            meanRemainingResources: completed ? mean(data.totalResources, completed) : null,
            meanEndDay: completed ? mean(data.totalEndDay, completed) : null,
            meanActions: Object.fromEntries(
              Object.entries(data.actions).map(([action, count]) => [
                action,
                completed ? mean(count, completed) : null,
              ]),
            ),
            failureReasons: Object.fromEntries(
              Object.entries(data.failures).map(([reason, count]) => [
                reason,
                completed ? mean(count, completed) : null,
              ]),
            ),
          },
        ];
      }),
    ),
  };
}

/**
 * Pair runs with the same seeds and no extra random draws. The baseline sets
 * the two #30 suppression bonuses to zero, not other gameplay properties.
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
      for (const strategy of STRATEGIES) {
        rows.push({ mode, ...simulateStrategy(strategy, seeds, waves) });
      }
    }
  } finally {
    actions.beastSuppressionDoomRelief = relief;
    actions.beastSuppressionThreatMitigation = mitigation;
  }

  const comparisons = STRATEGIES.map((strategy) => {
    const baseline = rows.find((row) => row.mode === "baseline" && row.strategy === strategy);
    const candidate = rows.find((row) => row.mode === "candidate" && row.strategy === strategy);
    return {
      strategy,
      beastSaveRateBaseline: baseline.worlds.beast.savedRate,
      beastSaveRateCandidate: candidate.worlds.beast.savedRate,
      deltaBeastSaveRate: Number(
        (candidate.worlds.beast.savedRate - baseline.worlds.beast.savedRate).toFixed(3),
      ),
      deltaAllSavedRate: Number(
        (candidate.allSavedRate - baseline.allSavedRate).toFixed(3),
      ),
      otherWorldRatesUnchanged: WORLD_IDS.filter((id) => id !== "beast").every(
        (id) => baseline.worlds[id].savedRate === candidate.worlds[id].savedRate,
      ),
    };
  });
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
  const seeds = Number(params.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] ?? 100);
  const report = compareBeastSuppression(seeds, { waves: params.includes("--waves") });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (
    params.includes("--assert") &&
    (report.rows.some((row) => row.incomplete > 0) ||
      report.comparisons.some((row) => row.deltaBeastSaveRate < 0))
  ) {
    throw new Error("Beast A/B check failed: stalled run or worse beast rescue rate.");
  }
}
