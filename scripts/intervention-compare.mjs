import Engine from "../src/engine.js";

/**
 * Matched-seed, descriptive A/B report for manual interventions.
 *
 * These are scripted choices, not randomized trials with real users.
 * Effects are measured at settlement; differences in final outcomes are
 * observations for these seeds, never promised "days saved".
 */
const params = process.argv.slice(2);
const seeds = Number(params.find((value) => value.startsWith("--seeds="))?.split("=")[1] ?? 40);
const assert = params.includes("--assert");
if (!Number.isInteger(seeds) || seeds < 10 || seeds > 1000) {
  throw new RangeError("--seeds must be an integer between 10 and 1000");
}

const scenarios = ["idle", "early-progress-aid", "reactive-doom-aid", "strategy-shift"];
const rows = [];

for (const runNumber of [1, 3]) {
  for (const scenario of scenarios) {
    let allSaved = 0;
    let savedWorlds = 0;
    let endDays = 0;
    let applied = 0;
    let pending = 0;
    let replayFailures = 0;
    let totalP = 0;
    let totalD = 0;

    for (let i = 0; i < seeds; i++) {
      const state = Engine.fresh(`intervention-compare-r${runNumber}-s${i}`, runNumber, true);
      let tried = false;
      let ticks = 0;
      while (state.active && ticks++ < 200) {
        const eligibleDay = scenario === "early-progress-aid" ? 1 :
          scenario === "reactive-doom-aid" ? 25 :
          scenario === "strategy-shift" ? 4 : -1;
        if (!tried && state.day === eligibleDay) {
          tried = true;
          const command = {
            operationId: `compare:${scenario}:${i}`,
            type: scenario === "strategy-shift" ? "strategy" : "aid",
            args: scenario === "strategy-shift"
              ? ["zombie", "growth"]
              : ["lingzai", "zombie", scenario === "early-progress-aid" ? "p" : "d"],
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
            if (!Engine.applyCommand(state, command).replayed ||
                state.interventions.length !== 1) {
              replayFailures++;
            }
          }
        }
        Engine.step(state);
      }
      if (state.active || !state.result) {
        pending++;
        continue;
      }
      allSaved += Number(state.result.saved === state.worlds.length);
      savedWorlds += state.result.saved;
      endDays += state.result.endedDay;
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

const comparisons = rows.filter((row) => row.scenario !== "idle").map((row) => {
  const idle = rows.find((candidate) =>
    candidate.runNumber === row.runNumber && candidate.scenario === "idle");
  return {
    ...row,
    deltaAllSavedRate: Number((row.allSavedRate - idle.allSavedRate).toFixed(3)),
    deltaMeanSavedWorlds: Number((row.meanSavedWorlds - idle.meanSavedWorlds).toFixed(3)),
    deltaMeanEndDay: Number((row.meanEndDay - idle.meanEndDay).toFixed(2)),
  };
});

process.stdout.write(JSON.stringify({
  engineVersion: Engine.VERSION,
  samplesPerScenario: seeds,
  interpretation: "Paired-seed scripted contrasts only; end-day differences are not causal guarantees.",
  rows,
  comparisons,
}, null, 2) + "\n");

if (assert && (
  rows.some((row) => row.incomplete > 0 || row.replayFailures > 0) ||
  rows.some((row) => row.scenario === "early-progress-aid" && row.applied !== seeds)
)) {
  throw new Error("Manual intervention smoke check failed: stalled run, duplicate charge or missing early aid.");
}
