import { SORTIE } from "../config/sortie-data.js";

/**
 * Read-only mission deadline presentation. All values come from the current
 * fixed-tick battlefield, including its paused skill-choice state.
 */
export function previewSortieDeadline(battle) {
  const mission = battle?.mission;
  if (!mission || mission.id !== "salvage") return null;

  const ticksPerSecond = SORTIE.ticksPerSecond;
  const seconds = Math.ceil(
    Math.max(0, mission.expiresAtTick - battle.tick) / ticksPerSecond,
  );
  const availableAfter = Math.ceil(
    Math.max(0, mission.appearsAtTick - battle.tick) / ticksPerSecond,
  );

  if (mission.status === "completed") {
    return {
      phase: "completed", seconds, text: "回收完成 · 仍需活到 " + SORTIE.durationSeconds + " 秒",
      notice: "回收已完成，生存到 " + SORTIE.durationSeconds + " 秒才能领取任务奖金",
    };
  }
  if (mission.status === "expired") {
    return {
      phase: "expired", seconds: 0, text: "回收已截止 · 任务奖金 +0",
      notice: "回收点已失效，本场无法领取任务奖金",
    };
  }
  if (mission.status === "scheduled") {
    return {
      phase: "waiting", seconds,
      text: "回收点 " + availableAfter + " 秒后开放 · 距截止 " + seconds + " 秒",
      notice: "",
    };
  }

  const urgent = seconds <= 10;
  return {
    phase: urgent ? "urgent" : "available",
    seconds,
    text: urgent ? "回收仅剩 " + seconds + " 秒 · 尽快停留 1 秒" :
      "回收截止剩余 " + seconds + " 秒",
    notice: urgent ? "回收点即将失效，需停留 1 秒完成回收" : "",
  };
}
