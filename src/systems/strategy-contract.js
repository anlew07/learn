import { LABELS } from "../config/game-data.js";

/**
 * Authoritative, read-only rule for changing a world's long-term strategy.
 * The engine and its UI share the same cost/eligibility preview.
 */
export function previewStrategyChange(state, worldId, strategy) {
  const world = state?.worlds?.find((candidate) => candidate.id === worldId);
  const cost = state?.day > 3 ? 1 : 0;
  if (!state?.active || !world || world.status !== "running") {
    return { available: false, cost, changed: false, reason: "世界当前不可调整策略" };
  }
  if (!Object.prototype.hasOwnProperty.call(LABELS, strategy)) {
    return { available: false, cost, changed: false, reason: "未知的策略类型" };
  }
  if (world.strategy === strategy) {
    return { available: true, cost: 0, changed: false, reason: "当前已采用该策略" };
  }
  const freeAP = state.ap - state.apReserved;
  if (freeAP < cost) {
    return {
      available: false,
      cost,
      changed: false,
      reason: "切换策略需要" + cost + "个可用行动点（闭关预留不可使用）",
    };
  }
  return { available: true, cost, changed: true, reason: "" };
}
