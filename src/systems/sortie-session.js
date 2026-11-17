import Engine from "../engine.js";
import { assertRestorableSnapshot } from "../services/persistence.js";
import { sortieIdentity, sortieSeed } from "./sortie-trace.js";
import { SORTIE } from "../config/sortie-data.js";

export const SORTIE_ARCHIVE_VERSION = "sortie-world-v1";

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
  return true;
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
  const pending = { sortieId, day: run.day };
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
