import Engine from "../src/engine.js";
import { BALANCE } from "../src/config/balance.js";
import { readWorldTerminal } from "./balance-outcome.mjs";
import { collectOpeningWorlds, getOpeningWorlds, isOpeningWorldCohortComplete, openingWorldEndDay } from "./world-cohort.mjs";

const strategies = ["default", "growth", "clear", "rescue"];

function average(total, count) {
  return Number((total / count).toFixed(3));
}

function emptyWorld() {
  return {
    visits: 0,
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
  const ids = ["lingzai", "zombie", "beast"];
  for (const id of ids) totals[id] = emptyWorld();
  let incomplete = 0;
  let allSaved = 0;
  let runDay = 0;

  for (let index = 0; index < samples; index++) {
    // A run's initial slots now follow the permanent rescue progression:
    // first run = one world, second = two, third and later = three.
    const savedBeforeRun = Math.min(2, Math.max(0, runNumber - 1));
    const state = Engine.fresh(
      "balance-v2-r" + runNumber + "-" + index,
      runNumber,
      waves,
      "",
      savedBeforeRun,
    );
    if (strategy !== "default") {
      for (const world of state.worlds) world.strategy = strategy;
    }
    const terminal = new Map();
    const cohort = collectOpeningWorlds(state);
    let steps = 0;
    while (state.active && !isOpeningWorldCohortComplete(state, cohort) && steps++ < 200) {
      const day = state.day;
      Engine.step(state);
      // Apply the same policy to every new world while measuring only the
      // first three world instances, which form the opening progression cohort.
      if (strategy !== "default") {
        for (const world of state.worlds) {
          if (world.status === "running") world.strategy = strategy;
        }
      }
      collectOpeningWorlds(state, cohort);
      for (const world of getOpeningWorlds(state, cohort)) {
        const instanceId = world.worldNumber;
        if (!terminal.has(instanceId) && world.status !== "running") {
          terminal.set(instanceId, readWorldTerminal(world, state.logs, day));
        }
      }
    }
    const cohortWorlds = getOpeningWorlds(state, cohort);
    if (!isOpeningWorldCohortComplete(state, cohort)) {
      incomplete++;
      continue;
    }

    allSaved += Number(cohortWorlds.length > 0 && cohortWorlds.every((world) => world.status === "saved"));
    runDay += openingWorldEndDay(cohortWorlds);
    for (const world of cohortWorlds) {
      const instanceId = world.worldNumber;
      const row = totals[world.id];
      if (!row) continue;
      const outcome = terminal.get(instanceId);
      const metrics = world.metrics || {};
      row.visits++;
      row.saved += Number(world.status === "saved");
      row.day += outcome?.day ?? state.result.endedDay;
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
        const reason = outcome?.reason ?? "未知原因";
        row.reasons[reason] = (row.reasons[reason] || 0) + 1;
      }
    }
  }
  const completed = samples - incomplete;
  const worlds = {};
  for (const id of ids) {
    const row = totals[id];
    const count = row.visits;
    const counts = {};
    const reasons = {};
    for (const [action, value] of Object.entries(row.actions)) {
      counts[action] = count ? average(value, count) : null;
    }
    for (const [reason, value] of Object.entries(row.reasons)) {
      reasons[reason] = count ? average(value, count) : null;
    }
    worlds[id] = {
      visits: count,
      saveRate: count ? average(row.saved, count) : null,
      meanEndDay: count ? average(row.day, count) : null,
      meanResources: count ? average(row.resources, count) : null,
      meanP: count ? average(row.p, count) : null,
      meanD: count ? average(row.d, count) : null,
      meanFights: count ? average(row.fights, count) : null,
      eliteClearRate: count ? average(row.clears, count) : null,
      meanSuppressionStages: count ? average(row.suppressions, count) : null,
      meanWaveBattles: count ? average(row.waveBattles, count) : null,
      meanWaveXp: count ? average(row.waveXp, count) : null,
      meanWaveResources: count ? average(row.waveResources, count) : null,
      meanWaveDoomRelief: count ? average(row.waveDoomRelief, count) : null,
      meanEvolutions: count ? average(row.evolutions, count) : null,
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
        const candidateRate = candidate.worlds[id].saveRate;
        const baselineRate = baseline.worlds[id].saveRate;
        worldDeltas[id] =
          Number.isFinite(candidateRate) && Number.isFinite(baselineRate)
            ? Number((candidateRate - baselineRate).toFixed(3))
            : null;
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

/** Quick scenario-specific sweep before choosing a candidate threshold. */
export function probeRescueNestThresholds(samples = 50, thresholds = [90, 91, 92, 93, 94, 95]) {
  const previous = BALANCE.actions.beastRescueNestPriorityDoom;
  const rows = [];
  try {
    for (const threshold of thresholds) {
      BALANCE.actions.beastRescueNestPriorityDoom = threshold;
      const baseline = simulate(3, "default", false, samples);
      const rescue = simulate(3, "rescue", false, samples);
      rows.push({
        threshold,
        default: baseline.worlds.beast.saveRate,
        rescue: rescue.worlds.beast.saveRate,
        defaultFights: baseline.worlds.beast.meanFights,
        rescueFights: rescue.worlds.beast.meanFights,
        eliteClear: rescue.worlds.beast.eliteClearRate,
      });
    }
  } finally {
    BALANCE.actions.beastRescueNestPriorityDoom = previous;
  }
  return rows;
}
