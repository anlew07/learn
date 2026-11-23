import { LEGACY_DOCTRINES, getLegacyDoctrine } from "../config/legacy-doctrines.js";

/**
 * Profile-only progression. Unlocks are permanent; one doctrine may be
 * equipped for the next expedition. Respec never refunds the unlock cost.
 */
export function normalizeLegacyProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const known = new Set(LEGACY_DOCTRINES.map((item) => item.id));
  const legacyUnlocks = LEGACY_DOCTRINES
    .filter((item) => Array.isArray(source.legacyUnlocks) && source.legacyUnlocks.includes(item.id))
    .map((item) => item.id);
  const activeLegacyId = legacyUnlocks.includes(source.activeLegacyId) ? source.activeLegacyId : "";
  return {
    ...source,
    runCount: Number.isInteger(source.runCount) && source.runCount >= 0 ? source.runCount : 0,
    worldsSaved: Number.isInteger(source.worldsSaved) && source.worldsSaved >= 0 ? source.worldsSaved : 0,
    shards: Number.isFinite(source.shards) && source.shards >= 0 ? source.shards : 0,
    legacyUnlocks: legacyUnlocks.filter((id) => known.has(id)),
    activeLegacyId,
  };
}

export function previewLegacyProgress(profile) {
  const current = normalizeLegacyProfile(profile);
  const unlocked = new Set(current.legacyUnlocks);
  const nodes = LEGACY_DOCTRINES.map((doctrine) => {
    const isUnlocked = unlocked.has(doctrine.id);
    const active = current.activeLegacyId === doctrine.id;
    const requirementsMet = current.runCount >= doctrine.minRuns;
    const shortfall = Math.max(0, doctrine.cost - current.shards);
    const status = isUnlocked
      ? active ? "active" : "unlocked"
      : !requirementsMet ? "locked" : shortfall > 0 ? "insufficient" : "ready";
    return {
      ...doctrine,
      unlocked: isUnlocked,
      active,
      requirementsMet,
      shortfall,
      canUnlock: !isUnlocked && requirementsMet && shortfall === 0,
      status,
    };
  });
  const active = nodes.find((node) => node.active) ?? null;
  return {
    nodes,
    active,
    activeId: current.activeLegacyId,
    unlockedCount: nodes.filter((node) => node.unlocked).length,
    total: nodes.length,
    next: nodes.find((node) => node.status === "ready") ??
      nodes.find((node) => node.status === "insufficient") ??
      nodes.find((node) => node.status === "locked") ?? null,
  };
}

export function unlockLegacy(profile, id) {
  const current = normalizeLegacyProfile(profile);
  const doctrine = getLegacyDoctrine(id);
  if (!doctrine) return { ok: false, reason: "未知的文明传承", profile };
  if (current.legacyUnlocks.includes(id)) {
    return { ok: false, reason: "这条传承已经永久解锁", profile };
  }
  if (current.runCount < doctrine.minRuns) {
    return {
      ok: false,
      reason: "完成第 " + doctrine.minRuns + " 次远征后才能解锁这条传承",
      profile,
    };
  }
  if (current.shards < doctrine.cost) {
    return {
      ok: false,
      reason: "世界碎片不足，还差 " + (doctrine.cost - current.shards) + " 枚",
      profile,
    };
  }
  return {
    ok: true,
    message: "永久解锁：" + doctrine.title,
    profile: {
      ...current,
      shards: current.shards - doctrine.cost,
      legacyUnlocks: [...current.legacyUnlocks, id],
    },
  };
}

export function equipLegacy(profile, id) {
  const current = normalizeLegacyProfile(profile);
  const doctrine = getLegacyDoctrine(id);
  if (!doctrine) return { ok: false, reason: "未知的文明传承", profile };
  if (!current.legacyUnlocks.includes(id)) {
    return { ok: false, reason: "请先永久解锁这条传承", profile };
  }
  if (current.activeLegacyId === id) {
    return { ok: false, reason: "这条传承已经启用", profile };
  }
  return {
    ok: true,
    message: "已启用 " + doctrine.title + "，将在下一次新远征生效",
    profile: { ...current, activeLegacyId: id },
  };
}

export function resetLegacy(profile) {
  const current = normalizeLegacyProfile(profile);
  if (!current.activeLegacyId) {
    return { ok: false, reason: "当前没有启用文明传承", profile };
  }
  return {
    ok: true,
    message: "已解除当前传承配置；永久解锁和剩余碎片均保留",
    profile: { ...current, activeLegacyId: "" },
  };
}
