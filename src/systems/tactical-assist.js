/**
 * 2X: one paid, single-use tactical order for the *next real autonomous fight*.
 * Display helpers have no effects on the run, RNG or persistence.
 */
export const TACTICAL_ASSIST = Object.freeze({
  id: "focus",
  apCost: 1,
  wavePower: 4,
  dangerPerExtraDefeat: 0.25,
  dangerCap: 2.5,
});

export function previewTacticalAssist(run, world, freeAP = 0) {
  let reason = "";
  if (!run?.active || !world || world.status !== "running") {
    reason = "本世界目前不能安排战术支援";
  } else if (!run.waves) {
    reason = "本局未启用三波防线，战术支援不可用";
  } else if (world.tacticalAssist?.kind === TACTICAL_ASSIST.id) {
    reason = "集中火力已待命，将在下一次自动排险时生效";
  } else if (freeAP < TACTICAL_ASSIST.apCost) {
    reason = "干预点不足，需要 1 点 AP";
  }
  return {
    available: !reason,
    reason,
    armed: world?.tacticalAssist?.kind === TACTICAL_ASSIST.id,
    apCost: TACTICAL_ASSIST.apCost,
    wavePower: TACTICAL_ASSIST.wavePower,
    dangerCap: TACTICAL_ASSIST.dangerCap,
  };
}

/**
 * Exact change produced by two deterministic runs of the *same* combat.
 * No free reduction if all the extra attack power was overkill.
 */
export function tacticalAssistImpact(base, boosted) {
  const extraDefeated = Math.max(0, boosted.defeated - base.defeated);
  const dangerRelief = Math.min(
    TACTICAL_ASSIST.dangerCap,
    Math.round(extraDefeated * TACTICAL_ASSIST.dangerPerExtraDefeat * 100) / 100,
  );
  return { kind: TACTICAL_ASSIST.id, extraDefeated, dangerRelief, apCost: TACTICAL_ASSIST.apCost };
}
