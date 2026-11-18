import Engine from "../engine.js";
import { assertRestorableSnapshot } from "../services/persistence.js";
import { sortieIdentity, sortieSeed } from "./sortie-trace.js";
import { SORTIE } from "../config/sortie-data.js";

export const SORTIE_ARCHIVE_VERSION = "sortie-world-v1";

/** Candidate only: no production purchase until 2L-A verifies guarded salvage. */
export const SORTIE_2L_BEACON = Object.freeze({
  id: "salvage-beacon",
  cost: 2,
  proposedContactBonus: 20,
});

function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

/** Separate namespace; the permanent profile and official run remain untouched. */
export function createSortieArchive(seed = "sortie-first-camp") {
  return {
    version: SORTIE_ARCHIVE_VERSION,
    run: { ...Engine.fresh(seed, 1, false), sortieCamp: { forgeLevel: 0, buildReceipt: null } },
    pending: null,
    lastReceipt: null,
  };
}

export function assertSortieArchive(archive) {
  if (!archive || typeof archive !== "object" || Array.isArray(archive) ||
    archive.version !== SORTIE_ARCHIVE_VERSION ||
    !archive.run || typeof archive.run !== "object" ||
    !Object.prototype.hasOwnProperty.call(archive, "pending") ||
    !Object.prototype.hasOwnProperty.call(archive, "lastReceipt")) {
    throw new Error("出击试验档结构或版本不兼容");
  }
  assertRestorableSnapshot({ run: archive.run, profile: null }, Engine.VERSION);
  const camp = archive.run.sortieCamp;
  // Missing is valid for a prototype archive saved before the forge existed.
  if (camp !== undefined &&
    (!camp || typeof camp !== "object" || Array.isArray(camp) ||
      !Number.isInteger(camp.forgeLevel) ||
      camp.forgeLevel < 0 || camp.forgeLevel > SORTIE.forge.maxLevel ||
      (camp.forgeLevel === 1 && (!camp.buildReceipt ||
        typeof camp.buildReceipt.operationId !== "string" ||
        camp.buildReceipt.cost !== SORTIE.forge.cost ||
        !Number.isInteger(camp.buildReceipt.beforeStats?.defeated) ||
        !Number.isInteger(camp.buildReceipt.beforeStats?.day) ||
        camp.buildReceipt.weaponDamage !== SORTIE.weapon.damage +
          SORTIE.forge.damageBonus)) ||
      (camp.forgeLevel === 0 && camp.buildReceipt != null))) {
    throw new Error("护灵剑台试验档结构无效");
  }
  const mission = camp?.missionSelection;
  if (mission != null &&
    (mission.missionId !== "safe" ||
      !Number.isInteger(mission.day) || mission.day < 1 ||
      mission.day > archive.run.day ||
      typeof mission.operationId !== "string" ||
      !/^[A-Za-z0-9:_/.-]{1,128}$/.test(mission.operationId))) {
    throw new Error("营地任务选择记录无效");
  }
  if (archive.pending?.missionId != null && archive.pending.missionId !== "safe") {
    throw new Error("险地任务权威重放尚未接入");
  }
  if (archive.pending !== null &&
    (!archive.pending || typeof archive.pending.sortieId !== "string" ||
      archive.pending.sortieId !== sortieIdentity(archive.run) ||
      archive.pending.day !== archive.run.day)) {
    throw new Error("未完成出击记录无效");
  }
  const last = archive.lastReceipt;
  if (last !== null &&
    (!last || typeof last.sortieId !== "string" ||
      !Number.isInteger(last.day) || last.day < 1 ||
      !Array.isArray(last.worlds) || last.worlds.length !== archive.run.worlds.length ||
      last.worlds.some((world) => !world || typeof world.id !== "string") ||
      !last.battle || !Number.isFinite(last.battle.stones) ||
      !Number.isFinite(last.battle.experience) ||
      !Number.isFinite(last.battle.progress))) {
    throw new Error("出击回执结构无效");
  }
  const ledger = archive.run.sortieLedger;
  if (ledger && (typeof ledger !== "object" || Array.isArray(ledger) ||
    Object.entries(ledger).some(([id, value]) =>
      !value || typeof value.fingerprint !== "string" ||
      value.receipt?.sortieId !== id))) {
    throw new Error("出击结算账本无效");
  }
  return validateSortieArchiveStructure(archive);
}

/**
 * A refresh abandons an uncommitted battle without awarding or advancing days.
 * The next prepare writes a new pending snapshot, replacing the abandoned one.
 */
export function recoverSortieArchive(archive) {
  assertSortieArchive(archive);
  return {
    archive: { ...snapshot(archive), pending: null },
    interrupted: Boolean(archive.pending),
  };
}

export function prepareSortieArchive(archive) {
  assertSortieArchive(archive);
  const run = archive.run;
  const ling = Engine.byId(run, "lingzai");
  if (archive.pending || !run.active || !ling || ling.status !== "running" ||
    ling.retreat) {
    return { ok: false, error: "当前不可开启灵灾出击" };
  }
  const sortieId = sortieIdentity(run);
  // The legacy archive defaults to safe; only A's future verified replay can
  // enable salvage. A UI-provided mission string cannot grant reward stones.
  const selected = run.sortieCamp?.missionSelection;
  const pending = {
    sortieId, day: run.day, missionId: "safe",
    missionOperationId: selected?.day === run.day ? selected.operationId : null,
    preparationId: null,
  };
  return {
    ok: true,
    seed: sortieSeed(run),
    danger: ling.d,
    forgeLevel: run.sortieCamp?.forgeLevel ?? 0,
    sortieId,
    archive: { ...snapshot(archive), pending },
  };
}

export function settleSortieArchive(archive, actions) {
  assertSortieArchive(archive);
  if (!archive.pending) return { ok: false, error: "没有已准备的出击" };
  const settled = Engine.settleSortie(archive.run, {
    sortieId: archive.pending.sortieId,
    actions,
  });
  if (!settled.ok) return settled;
  return {
    ok: true,
    receipt: settled.receipt,
    archive: {
      ...snapshot(archive),
      run: settled.run,
      pending: null,
      lastReceipt: settled.receipt,
    },
  };
}


/**
 * Exactly one optional long-term upgrade in the isolated prototype.
 * No world day or AP is consumed. Resource cost is not refundable because
 * it competes with the existing Lingzai finale reserve.
 */
export function previewSortieForge(archive) {
  assertSortieArchive(archive);
  const level = archive.run.sortieCamp?.forgeLevel ?? 0;
  const world = Engine.byId(archive.run, "lingzai");
  const cost = SORTIE.forge.cost;
  const stones = world?.resource ?? 0;
  const built = level === SORTIE.forge.maxLevel;
  const eligible = Boolean(archive.lastReceipt && !archive.pending && archive.run.active &&
    world?.status === "running" && !world.retreat && !built && stones >= cost);
  let reason = "";
  if (built) reason = "护灵剑台已经修复，不能重复投入";
  else if (archive.pending) reason = "出击进行中，不可建设";
  else if (!archive.lastReceipt) reason = "首次完成出击后才可修复剑台";
  else if (!archive.run.active || world?.status !== "running" || world.retreat)
    reason = "灵灾已结束或当前不可建设";
  else if (stones < cost) reason = "灵石不足，还需 " + (cost - stones);
  return {
    available: eligible, built, reason, cost, stones,
    remaining: stones - cost, level, nextDamage: SORTIE.weapon.damage +
      (built ? level : SORTIE.forge.maxLevel) * SORTIE.forge.damageBonus,
  };
}

/** Pure candidate: the caller must atomically persist it before showing success. */
export function buildSortieForge(archive, operationId) {
  const preview = previewSortieForge(archive);
  const previous = archive.run.sortieCamp?.buildReceipt;
  if (typeof operationId !== "string" ||
    !/^[A-Za-z0-9:_/.-]{1,128}$/.test(operationId)) {
    return { ok: false, error: "建造操作 ID 不合法" };
  }
  if (previous && previous.operationId === operationId) {
    return { ok: true, replayed: true, archive, receipt: previous };
  }
  if (!preview.available) return { ok: false, error: preview.reason };
  const next = snapshot(archive);
  const world = Engine.byId(next.run, "lingzai");
  const before = world.resource;
  world.resource = Math.round((before - preview.cost) * 100) / 100;
  const receipt = {
    operationId, day: next.run.day, cost: preview.cost,
    beforeStones: before, afterStones: world.resource,
    forgeLevel: SORTIE.forge.maxLevel, weaponDamage: preview.nextDamage,
    beforeStats: {
      day: archive.lastReceipt.day,
      defeated: archive.lastReceipt.battle.defeated,
      weaponDamage: archive.lastReceipt.battle.weaponDamage ?? SORTIE.weapon.damage,
    },
  };
  next.run.sortieCamp = { forgeLevel: SORTIE.forge.maxLevel, buildReceipt: receipt };
  return { ok: true, archive: next, receipt };
}

/**
 * Safe-only mission command, recorded in the isolated archive.
 * "salvage" is a reserved ID, NOT a reward instruction or enabled button.
 */
export function selectSortieCampMission(archive, missionId, operationId) {
  assertSortieArchive(archive);
  if (!["safe", "salvage"].includes(missionId)) {
    return { ok: false, error: "出击任务 ID 不合法" };
  }
  if (typeof operationId !== "string" ||
    !/^[A-Za-z0-9:_/.-]{1,128}$/.test(operationId)) {
    return { ok: false, error: "任务选择操作 ID 不合法" };
  }
  if (missionId === "salvage") {
    return { ok: false, error: "险地回收的战场实体与权威回放接口尚未接通，不能接取" };
  }
  const world = Engine.byId(archive.run, "lingzai");
  if (archive.pending || !archive.run.active || world?.status !== "running" ||
    world.retreat) {
    return { ok: false, error: "当前不可更改出击任务" };
  }
  const old = archive.run.sortieCamp?.missionSelection;
  if (old?.day === archive.run.day) {
    if (old.operationId === operationId && old.missionId === missionId) {
      return { ok: true, replayed: true, archive, receipt: old };
    }
    return { ok: false, error: "本日任务已确定，不能使用另一操作重复选择" };
  }
  const next = snapshot(archive);
  const receipt = { missionId, operationId, day: next.run.day };
  next.run.sortieCamp = { ...next.run.sortieCamp, missionSelection: receipt };
  return { ok: true, replayed: false, archive: next, receipt };
}

/** One source of truth for the budget, eligibility and the *blocked* candidate. */
export function previewSortieCampAllocation(archive) {
  const forge = previewSortieForge(archive);
  const world = Engine.byId(archive.run, "lingzai");
  const ready = archive.run.active && world?.status === "running" &&
    !world.retreat && !archive.pending;
  return {
    day: archive.run.day,
    stones: forge.stones,
    missionId: "safe",
    safe: { available: Boolean(ready), cost: 0, remaining: forge.stones },
    salvage: {
      available: false, cost: 0,
      reason: "需先接入真实守卫、可接触回收点与权威任务回执",
    },
    keep: { cost: 0, remaining: forge.stones, available: Boolean(ready) },
    forge: {
      ...forge,
      effect: "永久灵刃单次命中伤害 1 → 2（不保证资源回本）",
    },
    beacon: {
      id: SORTIE_2L_BEACON.id,
      cost: SORTIE_2L_BEACON.cost,
      remaining: forge.stones - SORTIE_2L_BEACON.cost,
      affordable: forge.stones >= SORTIE_2L_BEACON.cost,
      available: false,
      effect: "候选：下次险地回收接触半径 +20px；不加生命、不直接给灵石",
      reason: "未有 2L-A 任务引擎与权威回放证明；禁止正式扣费",
    },
  };
}

function validateSortieArchiveStructure(archive) {
  const run = archive.run;
  if (typeof run.id !== "string" || !run.id ||
    typeof run.seed !== "string" || run.runNumber !== 1 ||
    run.worlds.length !== 2 ||
    run.worlds[0].id !== "lingzai" || run.worlds[1].id !== "zombie") {
    throw new Error();
  }

  const ledger = run.sortieLedger;
  if (ledger !== undefined &&
    (!ledger || typeof ledger !== "object" || Array.isArray(ledger))) {
    throw new Error();
  }
  const entries = ledger ?? {};
  if (Object.entries(entries).some(([id, value]) =>
    !value || !value.receipt ||
    id !== sortieIdentity({ ...run, day: value.receipt.day }))) {
    throw new Error();
  }

  const last = archive.lastReceipt;
  if (last !== null &&
    (!Number.isInteger(last.nextDay) ||
      last.nextDay < last.day || last.nextDay > last.day + 1 ||
      last.nextDay !== run.day ||
      last.sortieId !== sortieIdentity({ ...run, day: last.day }) ||
      last.worlds.length !== run.worlds.length ||
      last.worlds.some((world, index) =>
        world.id !== run.worlds[index].id ||
        world.status !== run.worlds[index].status ||
        !["resourceDelta", "xpDelta", "pDelta", "dDelta"].every(
          (field) => Number.isFinite(world[field]),
        )) ||
      typeof last.battle !== "object" || Array.isArray(last.battle) ||
      last.battle.stones < 0 || last.battle.experience < 0 ||
      last.battle.progress < 0 ||
      !Number.isInteger(last.battle.defeated) || last.battle.defeated < 0)) {
    throw new Error();
  }
  if ((last === null && Object.keys(entries).length > 0) ||
    (last !== null &&
      (!entries[last.sortieId] ||
        JSON.stringify(entries[last.sortieId].receipt) !== JSON.stringify(last)))) {
    throw new Error();
  }
  return true;
}
