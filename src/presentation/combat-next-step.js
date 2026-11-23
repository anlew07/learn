import { getRecentEncounter } from "./encounter-view.js";
import { pendingDecisions } from "./decision-attention.js";

/**
 * A read-only bridge from an already settled battle to existing player
 * commands. Never offers a retroactive battle action or spends AP by itself.
 */
export function getCombatNextStep(run, world, tacticPreview) {
  if (!run?.active || world?.status !== "running") return null;
  const encounter = getRecentEncounter(world, run.day);
  if (!encounter) return null;

  const remaining = encounter.encountered - encounter.defeated;
  let panel;
  let label;
  let description;

  if (pendingDecisions(run).length) {
    panel = "event";
    label = "处理待选";
    description = "有关键决策待处理；先处理，再安排下一次行动。";
  } else if (tacticPreview?.armed) {
    panel = "tactic";
    label = "查看待命战术";
    description = "集中火力已待命，将在下一次真正自动排险时生效。";
  } else if (remaining === 0) {
    panel = "strategy";
    label = "查看策略";
    description = "本场全部击退；可检查是否继续排险，或转向资源与救援。";
  } else if (tacticPreview?.available) {
    panel = "tactic";
    label = "预览下次支援";
    description = "本场还有" + remaining + "个目标未击退。可预览花费" +
      tacticPreview.apCost + " AP 的下次支援，确认后才会扣费。";
  } else {
    panel = "strategy";
    label = "查看策略";
    description = "本场还有" + remaining + "个目标未击退；当前无法布置战术支援，可查看行动策略和费用。";
  }

  // This receipt is already in the one authoritative engine settlement.
  const settled = world.lastCombat?.tactic;
  const impact = Number.isFinite(settled?.extraDefeated) &&
    Number.isFinite(settled?.dangerRelief) &&
    settled.extraDefeated >= 0 && settled.dangerRelief >= 0
    ? { extraDefeated: settled.extraDefeated, dangerRelief: settled.dangerRelief }
    : null;

  return { day: encounter.day, panel, label, description, impact };
}
