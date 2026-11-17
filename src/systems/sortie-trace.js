import { createSortie, stepSortie, chooseSortieSkill, retreatSortie, DURATION_TICKS } from "./sortie-sim.js";

export const MAX_TRACE_ACTIONS = DURATION_TICKS + 2;

/** A deterministic identity tied to this run/day; no UI-supplied reward numbers. */
export function sortieIdentity(run) {
  return run.id + "/lingzai/day-" + run.day;
}

export function sortieSeed(run) {
  return run.seed + "/run-" + run.runNumber + "/lingzai/day-" + run.day;
}

/**
 * Re-evaluate each fixed movement tick from a new battlefield and the recorded
 * one-time skill choice/retreat. Invalid traces never reach the world engine.
 */
export function replaySortieTrace(seed, danger, actions, forgeLevel = 0) {
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > MAX_TRACE_ACTIONS) {
    return { ok: false, error: "出击记录长度不合法" };
  }
  if (!Number.isInteger(forgeLevel) || forgeLevel < 0 || forgeLevel > 1) {
    return { ok: false, error: "护灵剑台状态不合法" };
  }
  const battle = createSortie(seed, danger, forgeLevel);
  let moveCount = 0;
  for (const action of actions) {
    if (!Array.isArray(action) || !["tick", "skill", "retreat"].includes(action[0])) {
      return { ok: false, error: "出击记录格式无效" };
    }
    if (action[0] === "tick") {
      if (action.length !== 3 || !Number.isFinite(action[1]) ||
        !Number.isFinite(action[2]) || Math.abs(action[1]) > 1 ||
        Math.abs(action[2]) > 1 || battle.skillChoicePending ||
        battle.outcome !== "running") {
        return { ok: false, error: "无效的战场移动记录" };
      }
      const before = battle.tick;
      stepSortie(battle, { x: action[1], y: action[2] });
      if (battle.tick !== before + 1) {
        return { ok: false, error: "战场时钟未按规定推进" };
      }
      moveCount++;
    } else if (action[0] === "skill") {
      if (action.length !== 2 || !chooseSortieSkill(battle, action[1]).ok) {
        return { ok: false, error: "战技选择记录不合法" };
      }
    } else if (action.length !== 1 || !retreatSortie(battle).ok) {
      return { ok: false, error: "撤离记录不合法" };
    }
  }
  if (battle.outcome === "running" || battle.skillChoicePending ||
    battle.tick !== moveCount || battle.tick > DURATION_TICKS) {
    return { ok: false, error: "出击尚未结束，不能结算" };
  }
  return { ok: true, battle };
}

/** Lightweight idempotence check, not a cryptographic anti-cheat guarantee. */
export function sortieTraceFingerprint(actions) {
  const payload = JSON.stringify(actions);
  let value = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    value = Math.imul(value ^ payload.charCodeAt(i), 16777619);
  }
  return payload.length + ":" + (value >>> 0).toString(16);
}
