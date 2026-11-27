import { SORTIE } from "../config/sortie-data.js";

const clampPercent = (value) => Math.max(0, Math.min(100, Math.floor(value)));

export function getEncounterMissionView(
  mission,
  tick = 0,
  rewardStones = SORTIE.mission.rewardStones,
) {
  if (mission?.id !== "salvage") return null;
  const safeTick = Number.isFinite(tick) ? Math.max(0, tick) : 0;
  const reward = Number.isFinite(rewardStones) ? Math.max(0, Math.floor(rewardStones)) : 0;
  const requiredTicks = Number.isFinite(mission.requiredTicks) ?
    Math.max(1, mission.requiredTicks) : 1;
  const progress = clampPercent(
    (Number.isFinite(mission.progressTicks) ? mission.progressTicks : 0) /
      requiredTicks * 100,
  );

  if (mission.status === "completed") {
    return {
      state: "completed",
      label: "回收完成 · 撤离保留 +" + reward + "灵石",
      progress: 100,
      canBankObjective: true,
    };
  }
  if (mission.status === "expired") {
    return {
      state: "expired",
      label: "回收点失效 · 无任务奖励",
      progress: 0,
      canBankObjective: false,
    };
  }
  if (mission.status === "scheduled" || safeTick < (mission.appearsAtTick ?? 0)) {
    const remaining = Math.max(0, Math.ceil(
      ((mission.appearsAtTick ?? 0) - safeTick) / SORTIE.ticksPerSecond,
    ));
    return {
      state: "scheduled",
      label: "回收点 " + remaining + "秒后出现",
      progress: 0,
      canBankObjective: false,
    };
  }
  if (mission.guardTriggeredTick !== null && mission.guardTriggeredTick !== undefined) {
    return {
      state: "active",
      label: "守卫来袭 · 回收 " + progress + "%",
      progress,
      canBankObjective: false,
    };
  }
  return {
    state: "available",
    label: "靠近回收点 · 完成可得 +" + reward + "灵石",
    progress: 0,
    canBankObjective: false,
  };
}

export function getEncounterMissionResult(battle) {
  if (battle?.missionId !== "salvage") return null;
  const completed = battle.objectiveStatus === "completed";
  const stones = Number.isFinite(battle.objectiveStones) ?
    Math.max(0, Math.floor(battle.objectiveStones)) : 0;
  if (completed && stones > 0 && battle.outcome === "retreated") {
    return { state: "banked", label: "回收完成 · 撤离兑现 +" + stones + "灵石" };
  }
  if (completed && stones > 0 && battle.outcome === "won") {
    return { state: "banked", label: "回收完成 · 胜利兑现 +" + stones + "灵石" };
  }
  if (completed) {
    return { state: "lost", label: "回收完成，但分身倒下 · 目标奖励未兑现" };
  }
  if (battle.objectiveStatus === "expired") {
    return { state: "expired", label: "回收点已失效 · 无目标奖励" };
  }
  return { state: "incomplete", label: "回收未完成 · 无目标奖励" };
}
