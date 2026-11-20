import { describe, expect, it } from "vitest";
import {
  formatSortieMissionSummary,
  formatWorldActionLabel,
} from "../src/ui/sortie-receipt-labels.js";

describe("formatWorldActionLabel", () => {
  it("translates the sortie action and reuses known world action labels", () => {
    expect(formatWorldActionLabel("sortie")).toBe("雾谷出击");
    expect(formatWorldActionLabel("explore")).toBe("探索");
    expect(formatWorldActionLabel("gather")).toBe("采集");
  });

  it("never exposes missing or unknown internal action IDs", () => {
    expect(formatWorldActionLabel(null)).toBe("未执行");
    expect(formatWorldActionLabel("future-internal-action")).toBe("其他行动");
  });
});

describe("formatSortieMissionSummary", () => {
  it("describes the safe route without inventing an extra objective", () => {
    expect(formatSortieMissionSummary({
      missionId: "safe",
      objectiveStatus: "inactive",
      objectiveStones: 0,
    })).toBe("稳妥巡护：无额外回收目标");
  });

  it("shows the completed salvage status and authoritative reward", () => {
    expect(formatSortieMissionSummary({
      missionId: "salvage",
      objectiveStatus: "completed",
      objectiveStones: 2,
      objectiveGuardDamage: 3,
      outcome: "won",
    })).toBe("险地回收：已完成 · 任务奖金 +2 灵石 · 守卫造成 3 次受击");
  });

  it("keeps completed objectives distinct from unpaid retreat or defeat", () => {
    expect(formatSortieMissionSummary({
      missionId: "salvage",
      objectiveStatus: "completed",
      objectiveStones: 0,
      outcome: "retreated",
    })).toContain("已完成，但撤离未获奖金");
    expect(formatSortieMissionSummary({
      missionId: "salvage",
      objectiveStatus: "completed",
      objectiveStones: 0,
      outcome: "lost",
    })).toContain("已完成，但倒下后未获奖金");
  });

  it("does not mislabel an unknown future mission as the safe route", () => {
    expect(formatSortieMissionSummary({
      missionId: "future-objective",
      objectiveStones: 0,
    })).toBe("额外任务：状态待核验");
  });

  it("distinguishes retreat and defeat from successful completion", () => {
    expect(formatSortieMissionSummary({
      missionId: "salvage",
      objectiveStatus: "available",
      objectiveStones: 0,
      outcome: "retreated",
    })).toContain("撤离时未完成");
    expect(formatSortieMissionSummary({
      missionId: "salvage",
      objectiveStatus: "available",
      objectiveStones: 0,
      outcome: "lost",
    })).toContain("失败时未完成");
  });

  it("explains targets that did not appear or expired", () => {
    expect(formatSortieMissionSummary({
      missionId: "salvage",
      objectiveStatus: "scheduled",
      objectiveStones: 0,
      outcome: "lost",
    })).toContain("目标尚未出现");
    expect(formatSortieMissionSummary({
      missionId: "salvage",
      objectiveStatus: "expired",
      objectiveStones: 0,
      outcome: "won",
    })).toContain("已超时");
  });
});
