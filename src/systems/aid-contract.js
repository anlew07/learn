import { WORLDS } from "../config/game-data.js";

/**
 * The sole read-only contract for interworld resource aid.
 * The preview, button availability and authoritative payment all use this.
 * No state changes, RNG draws or speculative future probabilities.
 */
export function previewResourceAid(state, sourceId, targetId, mode) {
  const source = state?.worlds?.find((world) => world.id === sourceId);
  const target = state?.worlds?.find((world) => world.id === targetId);
  const resourceCost = 4;
  const apCost = 1;
  const soulCost = 1;
  const freeAP = state ? state.ap - state.apReserved : 0;
  const nextEligibleDay = state?.aidNext?.[targetId] || 1;
  const validMode = mode === "p" || mode === "d";
  const raw = validMode && target ? (mode === "p" ? 100 - target.p : target.d) : 0;
  const actualDelta = Math.max(0, Math.min(12, Math.round(raw * 100) / 100));
  const sourceAfter = source ? Math.round((source.resource - resourceCost) * 100) / 100 : null;
  const finalCost = source ? WORLDS[source.id].finalCost : 0;
  const jeopardizesSourceFinale =
    Boolean(source) && source.resource >= finalCost && sourceAfter < finalCost;

  let reason = "";
  if (!state?.active) reason = "本局已经结束";
  else if (!source || !target || source.id === target.id ||
           source.status !== "running" || target.status !== "running") {
    reason = "请选择两个不同且仍在运行的世界";
  } else if (!validMode) reason = "援助类型无效";
  else if (actualDelta === 0) {
    reason = mode === "p" ? "目标已达到P100，本次援助不会增加准备进度" :
      "目标危机压力已为0，本次援助不会减灾";
  } else if (source.resource < resourceCost) reason = "来源资源不足4";
  else if (freeAP < apCost) reason = "可用行动点不足1";
  else if (state.soul <= soulCost) reason = "灵魂强度不足，援助后必须保留至少1点";
  else if (state.day < nextEligibleDay) reason = "同一目标冷却至第" + nextEligibleDay + "日";

  return {
    available: reason === "",
    reason,
    mode,
    actualDelta,
    resourceCost,
    apCost,
    soulCost,
    sourceAfter,
    sourceFinalCost: finalCost,
    jeopardizesSourceFinale,
    nextEligibleDay,
    targetDaysLeft: target ? Math.max(0, target.deadline - state.day) : null,
    targetDoom: target ? target.d : null,
  };
}
