import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  runMissionEconomyScenario,
  summarizeMissionEconomySamples,
} from "../scripts/encounter-mission-economy-2ag-j.mjs";

describe("2AG-J formal mission economy comparison", () => {
  it("keeps safe patrol free of salvage objective rewards", () => {
    const result = runMissionEconomyScenario("2ag-f-build-0-0", 0, 1, "safe-ai");
    expect(result.missionId).toBe("safe");
    expect(result.objectiveCompleted).toBe(false);
    expect(result.objectiveStones).toBe(0);
  });

  it("banks the official objective reward on completed formal extraction", () => {
    const result = runMissionEconomyScenario("2ag-f-build-0-0", 0, 1, "salvage-now");
    expect(result.missionId).toBe("salvage");
    expect(result.outcome).toBe("retreated");
    expect(result.objectiveCompleted).toBe(true);
    expect(result.objectiveStones).toBe(SORTIE.mission.rewardStones);
    expect(result.stones).toBeGreaterThanOrEqual(SORTIE.mission.rewardStones);
  });

  it("repeats the same paired scenario deterministically", () => {
    const first = runMissionEconomyScenario("2ag-f-build-45-7", 45, 4, "salvage-after-15s");
    const second = runMissionEconomyScenario("2ag-f-build-45-7", 45, 4, "salvage-after-15s");
    expect(second).toEqual(first);
  });

  it("summarizes reward, survival and objective outcomes", () => {
    const samples = [
      {
        outcome: "won",
        objectiveCompleted: true,
        survivedSeconds: 75,
        collectedShards: 6,
        defeated: 12,
        hurt: 2,
        hpRemaining: 6,
        hpRatio: 0.75,
        shardStones: 2,
        baseStones: 3,
        objectiveStones: 2,
        stones: 7,
        stonesPerBattleMinute: 5.6,
        experience: 2,
        progress: 2,
      },
      {
        outcome: "retreated",
        objectiveCompleted: true,
        survivedSeconds: 12,
        collectedShards: 0,
        defeated: 2,
        hurt: 1,
        hpRemaining: 7,
        hpRatio: 0.875,
        shardStones: 0,
        baseStones: 0,
        objectiveStones: 2,
        stones: 2,
        stonesPerBattleMinute: 10,
        experience: 0,
        progress: 0,
      },
    ];
    const summary = summarizeMissionEconomySamples(samples);
    expect(summary).toMatchObject({
      samples: 2,
      wins: 1,
      retreats: 1,
      objectiveCompleted: 2,
      avgStones: 4.5,
      avgHpRatio: 0.813,
    });
  });
});
