import { ACTION_LABELS } from "../systems/action-policy.js";

function objectiveStatusLabel(status, outcome) {
  if (status === "available" && outcome === "retreated") return "撤离时未完成";
  if (status === "available" && outcome === "lost") return "失败时未完成";
  switch (status) {
    case "scheduled":
      return "目标尚未出现";
    case "available":
      return "未完成";
    case "completed":
      return "已完成";
    case "expired":
      return "已超时";
    default:
      return "状态待核验";
  }
}

/** Convert internal world action IDs to player-facing Chinese labels. */
export function formatWorldActionLabel(actionId) {
  if (typeof actionId !== "string" || !actionId) return "未执行";
  if (actionId === "sortie") return "雾谷出击";
  const label = ACTION_LABELS[actionId];
  return typeof label === "string" ? label : "其他行动";
}

/** Describe the selected sortie objective using only its authoritative receipt. */
export function formatSortieMissionSummary(reward) {
  if (reward?.missionId !== "salvage") return "稳妥巡护：无额外回收目标";

  const status = objectiveStatusLabel(reward.objectiveStatus, reward.outcome);
  const stones = Number.isFinite(reward.objectiveStones) ?
    Math.max(0, Math.floor(reward.objectiveStones)) : 0;
  const guardDamage = Number.isFinite(reward.objectiveGuardDamage) ?
    Math.max(0, Math.floor(reward.objectiveGuardDamage)) : 0;

  return "险地回收：" + status + " · 任务奖金 +" + stones + " 灵石" +
    (guardDamage > 0 ? " · 守卫造成 " + guardDamage + " 次受击" : "");
}
