import { describe, expect, it } from "vitest";
import {
  collectOpeningWorlds,
  getOpeningWorlds,
  isOpeningWorldCohortComplete,
} from "../scripts/world-cohort.mjs";

describe("opening world cohort", () => {
  it("finishes after the first three instances end, even if successor history is trimmed", () => {
    const state = {
      active: true,
      worlds: [
        { worldNumber: 1, status: "saved", endDay: 12 },
        { worldNumber: 2, status: "running", endDay: null },
        { worldNumber: 3, status: "running", endDay: null },
      ],
    };
    const cohort = collectOpeningWorlds(state);

    expect(isOpeningWorldCohortComplete(state, cohort)).toBe(false);
    state.worlds[1].status = "saved";
    state.worlds[1].endDay = 30;
    state.worlds[2].status = "failed";
    state.worlds[2].endDay = 42;
    collectOpeningWorlds(state, cohort);

    // Later successor instances may replace old terminal history in the run.
    state.worlds = [{ worldNumber: 4, status: "running", endDay: null }];
    expect(isOpeningWorldCohortComplete(state, cohort)).toBe(true);
    expect(getOpeningWorlds(state, cohort).map((world) => world.worldNumber)).toEqual([1, 2, 3]);
  });

  it("accepts a campaign that ends before all three world types are visited", () => {
    const state = {
      active: false,
      worlds: [{ worldNumber: 1, status: "failed", endDay: 76 }],
    };
    const cohort = collectOpeningWorlds(state);

    expect(isOpeningWorldCohortComplete(state, cohort)).toBe(true);
    expect(getOpeningWorlds(state, cohort)).toHaveLength(1);
  });
});
