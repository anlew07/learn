import {
  createSortie,
  stepSortie,
  chooseSortieSkill,
  castSortieSkill,
  retreatSortie,
  DURATION_TICKS,
} from "./sortie-sim.js";

export const MAX_TRACE_ACTIONS = DURATION_TICKS + 64;

/** A deterministic identity tied to this run/day; no UI-supplied reward numbers. */
export function sortieIdentity(run) {
  return run.id + "/lingzai/day-" + run.day;
}

export function sortieSeed(run) {
  return run.seed + "/run-" + run.runNumber + "/lingzai/day-" + run.day;
}

/**
 * Re-evaluate an action prefix from a new battlefield.
 * A prefix may end while the encounter is running or at a skill-choice pause.
 */
function replayActions(
  seed,
  danger,
  actions,
  forgeLevel,
  missionId,
  skillReleaseMode,
  requireFinished,
) {
  if (
    !Array.isArray(actions) ||
    actions.length > MAX_TRACE_ACTIONS ||
    (requireFinished && actions.length < 1)
  ) {
    return { ok: false, error: "出击记录长度不合法" };
  }
  if (!Number.isInteger(forgeLevel) || forgeLevel < 0 || forgeLevel > 1) {
    return { ok: false, error: "护灵剑台状态不合法" };
  }
  if (!["safe", "salvage"].includes(missionId)) {
    return { ok: false, error: "Invalid sortie mission" };
  }
  if (!["auto", "manual"].includes(skillReleaseMode)) {
    return { ok: false, error: "战技释放方式不合法" };
  }

  const battle = createSortie(seed, danger, forgeLevel, missionId, {
    skillReleaseMode,
  });
  for (const action of actions) {
    if (
      !Array.isArray(action) ||
      !["tick", "skill", "cast", "retreat"].includes(action[0])
    ) {
      return { ok: false, error: "出击记录格式无效" };
    }
    if (action[0] === "tick") {
      if (
        action.length !== 3 ||
        !Number.isFinite(action[1]) ||
        !Number.isFinite(action[2]) ||
        Math.abs(action[1]) > 1 ||
        Math.abs(action[2]) > 1 ||
        battle.skillChoicePending ||
        battle.outcome !== "running"
      ) {
        return { ok: false, error: "无效的战场移动记录" };
      }
      const before = battle.tick;
      stepSortie(battle, { x: action[1], y: action[2] });
      if (battle.tick !== before + 1) {
        return { ok: false, error: "战场时钟未按规定推进" };
      }
    } else if (action[0] === "skill") {
      if (
        action.length !== 2 ||
        !chooseSortieSkill(battle, action[1]).ok
      ) {
        return { ok: false, error: "战技选择记录不合法" };
      }
    } else if (action[0] === "cast") {
      if (
        action.length !== 2 ||
        action[1] !== battle.skillId ||
        !castSortieSkill(battle).ok
      ) {
        return { ok: false, error: "战技释放记录不合法" };
      }
    } else if (action.length !== 1 || !retreatSortie(battle).ok) {
      return { ok: false, error: "撤离记录不合法" };
    }
  }

  if (
    requireFinished &&
    (battle.outcome === "running" ||
      battle.skillChoicePending ||
      battle.tick > DURATION_TICKS)
  ) {
    return { ok: false, error: "出击尚未结束，不能结算" };
  }
  return { ok: true, battle };
}

/** Restore a saved, possibly incomplete encounter without trusting its snapshot. */
export function replaySortieProgress(
  seed,
  danger,
  actions,
  forgeLevel = 0,
  missionId = "safe",
  skillReleaseMode = "auto",
) {
  return replayActions(
    seed,
    danger,
    actions,
    forgeLevel,
    missionId,
    skillReleaseMode,
    false,
  );
}

/** Strict authoritative replay used only when a finished encounter is settled. */
export function replaySortieTrace(
  seed,
  danger,
  actions,
  forgeLevel = 0,
  missionId = "safe",
  skillReleaseMode = "auto",
) {
  return replayActions(
    seed,
    danger,
    actions,
    forgeLevel,
    missionId,
    skillReleaseMode,
    true,
  );
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
