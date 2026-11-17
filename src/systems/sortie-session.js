import Engine from "../engine.js";
import { assertRestorableSnapshot } from "../services/persistence.js";
import { sortieIdentity, sortieSeed } from "./sortie-trace.js";

export const SORTIE_ARCHIVE_VERSION = "sortie-world-v1";

function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

/** Separate namespace; the permanent profile and official run remain untouched. */
export function createSortieArchive(seed = "sortie-first-camp") {
  return {
    version: SORTIE_ARCHIVE_VERSION,
    run: Engine.fresh(seed, 1, false),
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
  if (archive.pending !== null &&
    (!archive.pending || typeof archive.pending.sortieId !== "string" ||
      archive.pending.sortieId !== sortieIdentity(archive.run) ||
      archive.pending.day !== archive.run.day)) {
    throw new Error("未完成出击记录无效");
  }
  if (archive.lastReceipt !== null &&
    (!archive.lastReceipt || typeof archive.lastReceipt.sortieId !== "string" ||
      !Array.isArray(archive.lastReceipt.worlds))) {
    throw new Error("出击回执结构无效");
  }
  if (archive.run.sortieLedger && (typeof archive.run.sortieLedger !== "object" ||
    Array.isArray(archive.run.sortieLedger))) {
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
