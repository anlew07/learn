import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  getEncounterMissionResult,
  getEncounterMissionView,
} from "../src/presentation/encounter-mission.js";

describe("2AG-H formal recovery objective HUD", () => {
  it("shows a countdown before the recovery site appears", () => {
    const view = getEncounterMissionView({
      id: "salvage", status: "scheduled", appearsAtTick: 600,
      requiredTicks: 60, progressTicks: 0,
    }, 0);
    expect(view).toMatchObject({
      state: "scheduled", label: "回收点 10秒后出现",
      progress: 0, canBankObjective: false,
    });
  });

  it("shows real guardian hold progress without inventing completion", () => {
    const view = getEncounterMissionView({
      id: "salvage", status: "available", appearsAtTick: 600,
      requiredTicks: 60, progressTicks: 30, guardTriggeredTick: 600,
    }, 630);
    expect(view).toMatchObject({
      state: "active", label: "守卫来袭 · 回收 50%",
      progress: 50, canBankObjective: false,
    });
  });

  it("exposes the extraction bonus only after the authoritative objective is complete", () => {
    const view = getEncounterMissionView({
      id: "salvage", status: "completed", requiredTicks: 60, progressTicks: 60,
    }, 700, SORTIE.mission.rewardStones);
    expect(view).toMatchObject({
      state: "completed", label: "回收完成 · 撤离保留 +2灵石",
      progress: 100, canBankObjective: true,
    });
  });

  it("does not show salvage UI for the safe mission and marks expired objectives", () => {
    expect(getEncounterMissionView({ id: "safe", status: "inactive" }, 0)).toBeNull();
    expect(getEncounterMissionView({
      id: "salvage", status: "expired", requiredTicks: 60, progressTicks: 0,
    }, 3000)).toMatchObject({
      state: "expired", label: "回收点失效 · 无任务奖励", canBankObjective: false,
    });
  });

  it("explains the actual settlement for extraction, victory and death", () => {
    expect(getEncounterMissionResult({
      missionId: "salvage", objectiveStatus: "completed",
      objectiveStones: 2, outcome: "retreated",
    })).toEqual({ state: "banked", label: "回收完成 · 撤离兑现 +2灵石" });
    expect(getEncounterMissionResult({
      missionId: "salvage", objectiveStatus: "completed",
      objectiveStones: 2, outcome: "won",
    })).toEqual({ state: "banked", label: "回收完成 · 胜利兑现 +2灵石" });
    expect(getEncounterMissionResult({
      missionId: "salvage", objectiveStatus: "completed",
      objectiveStones: 0, outcome: "lost",
    })).toEqual({ state: "lost", label: "回收完成，但分身倒下 · 目标奖励未兑现" });
    expect(getEncounterMissionResult({
      missionId: "salvage", objectiveStatus: "available",
      objectiveStones: 0, outcome: "retreated",
    })).toEqual({ state: "incomplete", label: "回收未完成 · 无目标奖励" });
  });
});
