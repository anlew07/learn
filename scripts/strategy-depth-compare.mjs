import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import Engine from "../src/engine.js";
import { BALANCE } from "../src/config/balance.js";
import { readWorldTerminal } from "./balance-outcome.mjs";

const strategies = ["default", "growth", "clear", "rescue"];

function average(total, count) {
  return Number((total / count).toFixed(3));
}

function emptyWorld() {
  return {
    saved: 0,
    day: 0,
    resources: 0,
    p: 0,
    d: 0,
    fights: 0,
    clears: 0,
    suppressions: 0,
    waveBattles: 0,
    waveXp: 0,
    waveResources: 0,
    waveDoomRelief: 0,
    evolutions: 0,
    reasons: {},
    actions: {},
  };
}

function simulate(runNumber, strategy, waves, samples) {
  const totals = {};
  const ids = runNumber >= 3 ? ["lingzai", "zombie", "beast"] : ["lingzai", "zombie"];
  for (const id of ids) totals[id] = emptyWorld();
  let incomplete = 0;
  let allSaved = 0;
  let runDay = 0;

  for (let index = 0; index < samples; index++) {
    // Intentionally use the exact same seeds as the existing balance report.
    const state = Engine.fresh("balance-v2-r" + runNumber + "-" + index, runNumber, waves);
    if (strategy !== "default") {
      for (const world of state.worlds) world.strategy = strategy;
    }
    const terminal = {};
    let steps = 0;
    while (state.active && steps++ < 200) {
      const day = state.day;
      Engine.step(state);
      for (const world of state.worlds) {
        if (!terminal[world.id] && world.status !== "running") {
          terminal[world.id] = readWorldTerminal(world, state.logs, day);
        }
      }
    }
    if (state.active || !state.result) {
      incomplete++;
      continue;
    }

    allSaved += Number(state.result.saved === state.worlds.length);
    runDay += state.result.endedDay;
    for (const world of state.worlds) {
      const row = totals[world.id];
      const metrics = world.metrics || {};
      row.saved += Number(world.status === "saved");
      row.day += terminal[world.id]?.day ?? state.result.endedDay;
      row.resources += world.resource;
      row.p += world.p;
      row.d += world.d;
      row.fights += metrics.actions?.fight || 0;
      row.clears += Number(Boolean(world.flags.bossDefeated));
      row.suppressions += world.suppression || 0;
      row.waveBattles += metrics.waveCombats || 0;
      row.waveXp += metrics.extraXp || 0;
      row.waveResources += metrics.extraResources || 0;
      row.waveDoomRelief += metrics.extraDoomReduction || 0;
      row.evolutions += metrics.evolutions || 0;
      for (const [action, count] of Object.entries(metrics.actions || {})) {
        row.actions[action] = (row.actions[action] || 0) + count;
      }
      if (world.status !== "saved") {
        const reason = terminal[world.id]?.reason ?? "未知原因";
        row.reasons[reason] = (row.reasons[reason] || 0) + 1;
      }
    }
  }
  const completed = samples - incomplete;
  const worlds = {};
  for (const id of ids) {
    const row = totals[id];
    const counts = {};
    const reasons = {};
    for (const [action, count] of Object.entries(row.actions)) {
      counts[action] = completed ? average(count, completed) : null;
    }
    for (const [reason, count] of Object.entries(row.reasons)) {
      reasons[reason] = completed ? average(count, completed) : null;
    }
    worlds[id] = {
      saveRate: completed ? average(row.saved, completed) : null,
      meanEndDay: completed ? average(row.day, completed) : null,
      meanResources: completed ? average(row.resources, completed) : null,
      meanP: completed ? average(row.p, completed) : null,
      meanD: completed ? average(row.d, completed) : null,
      meanFights: completed ? average(row.fights, completed) : null,
      eliteClearRate: completed ? average(row.clears, completed) : null,
      meanSuppressionStages: completed ? average(row.suppressions, completed) : null,
      meanWaveBattles: completed ? average(row.waveBattles, completed) : null,
      meanWaveXp: completed ? average(row.waveXp, completed) : null,
      meanWaveResources: completed ? average(row.waveResources, completed) : null,
      meanWaveDoomRelief: completed ? average(row.waveDoomRelief, completed) : null,
      meanEvolutions: completed ? average(row.evolutions, completed) : null,
      failureReasons: reasons,
      meanActions: counts,
    };
  }
  return {
    runNumber,
    strategy,
    completed,
    incomplete,
    allSavedRate: completed ? average(allSaved, completed) : null,
    meanRunDay: completed ? average(runDay, completed) : null,
    worlds,
  };
}

/**
 * Same-seed comparison of the current nest priority with the earlier policy.
 * Reuses Engine.fresh, existing saved RNG streams, and existing metrics.
 * Restores all tuning even if a simulated run throws.
 */
export function compareRescueNestPriority(samples = 100, { waves = false } = {}) {
  if (!Number.isInteger(samples) || samples < 10 || samples > 500) {
    throw new RangeError("samples must be an integer between 10 and 500");
  }
  const current = BALANCE.actions.beastRescueNestPriorityDoom;
  const rows = [];
  try {
    for (const mode of ["baseline", "candidate"]) {
      BALANCE.actions.beastRescueNestPriorityDoom = mode === "baseline" ? 101 : current;
      for (const runNumber of [1, 2, 3]) {
        for (const strategy of strategies) {
          rows.push({ mode, ...simulate(runNumber, strategy, waves, samples) });
        }
      }
    }
  } finally {
    BALANCE.actions.beastRescueNestPriorityDoom = current;
  }

  const differences = [];
  for (const runNumber of [1, 2, 3]) {
    for (const strategy of strategies) {
      const baseline = rows.find(
        (row) => row.mode === "baseline" &&
          row.runNumber === runNumber &&
          row.strategy === strategy,
      );
      const candidate = rows.find(
        (row) => row.mode === "candidate" &&
          row.runNumber === runNumber &&
          row.strategy === strategy,
      );
      const worldDeltas = {};
      for (const id of Object.keys(baseline.worlds)) {
        worldDeltas[id] = Number(
          (candidate.worlds[id].saveRate - baseline.worlds[id].saveRate).toFixed(3),
        );
      }
      differences.push({ runNumber, strategy, worldDeltas });
    }
  }
  return {
    samples,
    waves,
    policy: { threshold: current },
    rows,
    differences,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = process.argv.slice(2);
  const sampleArg = options.find((arg) => arg.startsWith("--seeds="));
  const samples = Number(sampleArg?.split("=")[1] ?? 100);
  const report = compareRescueNestPriority(samples, { waves: options.includes("--waves") });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (
    options.includes("--assert") &&
    report.rows.some((row) => row.incomplete > 0)
  ) {
    throw new Error("Seeded balance runs did not reach a terminal state.");
  }
}
