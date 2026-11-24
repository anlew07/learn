import Engine from "../src/engine.js";
import {
  OPENING_WORLD_MAX_DAYS,
  collectOpeningWorlds,
  getOpeningWorlds,
  isOpeningWorldCohortComplete,
  openingWorldEndDay,
} from "./world-cohort.mjs";

/**
 * Reproducible scripted contrasts, not a claim about actual players.
 * "Ended on day X" is an observation, never a guaranteed number of days saved.
 */
const params = process.argv.slice(2);
const seeds = Number(params.find((arg) => arg.startsWith("--seeds="))?.split("=")[1] ?? 40);
const shouldAssert = params.includes("--assert");

if (!Number.isInteger(seeds) || seeds < 10 || seeds > 1000) {
  throw new RangeError("--seeds must be an integer between 10 and 1000");
}

const scenarioDays = {
  idle: -1,
  "early-progress-aid": 1,
  "reactive-doom-aid": 25,
  "strategy-shift": 4,
};
const rows = [];

for (const runNumber of [2, 3]) {
  for (const scenario of Object.keys(scenarioDays)) {
    let allSaved = 0;
    let savedWorlds = 0;
    let endDays = 0;
    let applied = 0;
    let pending = 0;
    let replayFailures = 0;
    let totalP = 0;
    let totalD = 0;

    for (let i = 0; i < seeds; i++) {
      const state = Engine.fresh(
        `intervention-compare-r${runNumber}-s${i}`,
        runNumber,
        true,
        "",
        runNumber - 1,
      );
      let tried = false;
      let ticks = 0;
      const cohort = collectOpeningWorlds(state);

      while (state.active && !isOpeningWorldCohortComplete(state, cohort) && ticks++ < OPENING_WORLD_MAX_DAYS) {
        if (!tried && state.day === scenarioDays[scenario]) {
          tried = true;
          const isStrategy = scenario === "strategy-shift";
          const args = isStrategy
            ? ["zombie", "growth"]
            : ["lingzai", "zombie", scenario === "early-progress-aid" ? "p" : "d"];
          const command = {
            operationId: `compare:${scenario}:${i}`,
            type: isStrategy ? "strategy" : "aid",
            args,
          };
          const outcome = Engine.applyCommand(state, command);
          if (outcome.ok) {
            applied++;
            const entry = state.interventions.at(-1);
            if (entry) {
              for (const changed of entry.changes) {
                totalP += changed.effects.p;
                totalD += changed.effects.d;
              }
            }
            if (!Engine.applyCommand(state, command).replayed || state.interventions.length !== 1) {
              replayFailures++;
            }
          }
        }
        Engine.step(state);
        collectOpeningWorlds(state, cohort);
      }

      const cohortWorlds = getOpeningWorlds(state, cohort);
      if (!isOpeningWorldCohortComplete(state, cohort)) {
        pending++;
        continue;
      }
      const cohortSaved = cohortWorlds.filter((world) => world.status === "saved").length;
      allSaved += Number(cohortWorlds.length > 0 && cohortSaved === cohortWorlds.length);
      savedWorlds += cohortSaved;
      endDays += openingWorldEndDay(cohortWorlds);
    }

    rows.push({
      runNumber,
      scenario,
      trials: seeds,
      applied,
      incomplete: pending,
      allSavedRate: Number((allSaved / seeds).toFixed(3)),
      meanSavedWorlds: Number((savedWorlds / seeds).toFixed(3)),
      meanEndDay: Number((endDays / seeds).toFixed(2)),
      actualAverageP: Number((totalP / seeds).toFixed(2)),
      actualAverageD: Number((totalD / seeds).toFixed(2)),
      replayFailures,
    });
  }
}

const comparisons = rows
  .filter((row) => row.scenario !== "idle")
  .map((row) => {
    const idle = rows.find(
      (candidate) => candidate.runNumber === row.runNumber && candidate.scenario === "idle",
    );
    return {
      ...row,
      deltaAllSavedRate: Number((row.allSavedRate - idle.allSavedRate).toFixed(3)),
      deltaMeanSavedWorlds: Number((row.meanSavedWorlds - idle.meanSavedWorlds).toFixed(3)),
      deltaMeanEndDay: Number((row.meanEndDay - idle.meanEndDay).toFixed(2)),
    };
  });

process.stdout.write(
  JSON.stringify(
    {
      engineVersion: Engine.VERSION,
      samplesPerScenario: seeds,
      interpretation: "Scripted paired-seed contrasts, not causal guarantees.",
      rows,
      comparisons,
    },
    null,
    2,
  ) + "\n",
);

if (
  shouldAssert &&
  (rows.some((row) => row.incomplete > 0 || row.replayFailures > 0) ||
    rows.some((row) => row.scenario === "early-progress-aid" && row.applied !== seeds))
) {
  throw new Error("Intervention smoke check failed: stalled run, duplicate charge or missing aid.");
}
