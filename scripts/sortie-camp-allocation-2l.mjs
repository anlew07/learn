import Engine from "../src/engine.js";
import { sortieIdentity } from "../src/systems/sortie-trace.js";
import { assertSortieArchive, previewSortieCampAllocation } from "../src/systems/sortie-session.js";
import { assertForgeRoiExperiment, runForgeRoiExperiment } from "./sortie-forge-roi-2h.mjs";

// This model is NEVER imported by sortie.js or the live sortie session.
// No guarded-recovery objective exists in 2G; no purchase grants any bonus.
export const SHADOW_BEACON_COST = 2;
export const SHADOW_BEACON_ID = "salvage-beacon";
const clone = (value) => JSON.parse(JSON.stringify(value));
const validOperationId = (id) => typeof id === "string" && /^[A-Za-z0-9:_/.-]{1,128}$/.test(id);

// prettier-ignore
export function assertShadowBeaconArchive(archive) {
  assertSortieArchive(archive);
  const receipt = archive.run.sortieCamp?.shadowBeacon;
  if (receipt === undefined) return true;
  if (!receipt || receipt.preparationId !== SHADOW_BEACON_ID ||
    !validOperationId(receipt.operationId) ||
    !Number.isInteger(receipt.day) || receipt.day < 2 ||
    ![0, 1].includes(receipt.charges) ||
    receipt.cost !== SHADOW_BEACON_COST ||
    !Number.isFinite(receipt.beforeStones) ||
    !Number.isFinite(receipt.afterStones) ||
    Math.abs(receipt.beforeStones - receipt.afterStones - receipt.cost) > 1e-7 ||
    typeof receipt.sortieId !== "string" ||
    (receipt.charges === 1 && receipt.usedOn !== null) ||
    (receipt.charges === 0 && receipt.usedOn !== receipt.sortieId)) {
    throw new Error("2L-B shadow beacon receipt rejected");
  }
  return true;
}

/** Price-only shadow preview: do not imply the battle engine supports a beacon. */
// prettier-ignore
export function previewShadowBeacon(archive) {
  assertShadowBeaconArchive(archive);
  const budget = previewSortieCampAllocation(archive);
  const world = Engine.byId(archive.run, "lingzai");
  const existing = archive.run.sortieCamp?.shadowBeacon;
  const canPay = Boolean(archive.lastReceipt && !archive.pending &&
    archive.run.active && world.status === "running" && !world.retreat &&
    budget.stones >= SHADOW_BEACON_COST &&
    archive.run.sortieCamp?.forgeLevel === 0 && !existing);
  return {
    available: canPay,
    cost: SHADOW_BEACON_COST,
    beforeStones: budget.stones,
    afterStones: budget.stones - SHADOW_BEACON_COST,
    oneUseOnly: true,
    engineEffectVerified: false,
    reason: canPay ? "" : "需要完成首场、拥有 2 灵石、无剑台且无待结算出击或已有准备",
  };
}

/** Returns a cloned mock archive; NEVER save this object through live sortieRepository. */
// prettier-ignore
export function buyShadowBeacon(archive, operationId) {
  assertShadowBeaconArchive(archive);
  if (!validOperationId(operationId))
    return { ok: false, error: "Invalid operationId" };
  const previous = archive.run.sortieCamp?.shadowBeacon;
  if (previous?.operationId === operationId) {
    return { ok: true, replayed: true, archive, receipt: previous };
  }
  if (previous) return { ok: false, error: "Already purchased once" };
  const preview = previewShadowBeacon(archive);
  if (!preview.available) return { ok: false, error: preview.reason };
  const next = clone(archive);
  const world = Engine.byId(next.run, "lingzai");
  world.resource = Math.round((world.resource - SHADOW_BEACON_COST) * 100) / 100;
  const receipt = {
    preparationId: SHADOW_BEACON_ID,
    operationId,
    day: next.run.day,
    sortieId: sortieIdentity(next.run),
    cost: SHADOW_BEACON_COST,
    beforeStones: preview.beforeStones,
    afterStones: world.resource,
    charges: 1,
    usedOn: null,
  };
  next.run.sortieCamp = { ...next.run.sortieCamp, shadowBeacon: receipt };
  return { ok: true, replayed: false, archive: next, receipt };
}

/**
 * Mark the single mock charge consumed only AFTER an actual settled sortie.
 * This changes no battle state, enemy, objective, resource or reward; it is
 * explicitly not the final 2L-A/B preparation integration.
 */
// prettier-ignore
export function consumeShadowBeacon(archive, settledArchive) {
  assertShadowBeaconArchive(archive);
  assertShadowBeaconArchive(settledArchive);
  const prep = archive.run.sortieCamp?.shadowBeacon;
  if (!prep || prep.charges !== 1 || archive.pending ||
    prep.sortieId !== sortieIdentity(archive.run) ||
    settledArchive.run.day !== archive.run.day + 1 ||
    settledArchive.lastReceipt?.sortieId !== prep.sortieId ||
    settledArchive.lastReceipt?.day !== archive.run.day ||
    settledArchive.run.sortieCamp?.shadowBeacon?.operationId !== prep.operationId) {
    return { ok: false, error: "No matching authoritative sortie for consumption" };
  }
  const next = clone(settledArchive);
  next.run.sortieCamp.shadowBeacon.charges = 0;
  next.run.sortieCamp.shadowBeacon.usedOn = prep.sortieId;
  assertShadowBeaconArchive(next);
  return { ok: true, archive: next, receipt: next.run.sortieCamp.shadowBeacon };
}

/**
 * 40 fixed seeds × D 0/40/75 × two skills × three routes.
 * The reference Engine replays both worlds through runForgeRoiExperiment.
 * This produces HOLD vs REAL FORGE evidence ONLY. The beacon has zero
 * verified battlefield effect, so reporting its ROI as if playable is banned.
 */
// prettier-ignore
export function runCampAllocation2L(seedCount = 40, maxSorties = 6) {
  const reference = runForgeRoiExperiment(seedCount, maxSorties);
  assertForgeRoiExperiment(reference);
  return {
    metadata: {
      seedCount, maxSorties, pairs: reference.pairs.length,
      dangerLevels: reference.metadata.dangerLevels,
      skills: reference.metadata.skills,
      routes: reference.metadata.routes,
      forgeCost: reference.metadata.forgeCost,
      beaconCost: SHADOW_BEACON_COST,
      authoritative: "Engine.settleSortie: hold vs 6-stone permanent forge",
      unavailable: "salvage task and one-time beacon effects require 2L-A",
    },
    overall: reference.overall.filter((row) =>
      row.sortie === 2 || row.sortie === 6),
    byDangerSkill: reference.byDangerSkill.filter((row) =>
      row.sortie === 2 || row.sortie === 6),
    byRoute: reference.byRoute.filter((row) =>
      row.sortie === 2 || row.sortie === 6),
    checks: {
      authoritativeDoubleWorldForge: true,
      sameFixedSeedPairs: true,
      beaconOutcomeVerified: false,
      beaconPurchaseEnabledInUI: false,
    },
  };
}

// prettier-ignore
if (process.argv[1]?.endsWith("sortie-camp-allocation-2l.mjs")) {
  const seedArg = process.argv.find((part) => part.startsWith("--seeds="));
  const sortieArg = process.argv.find((part) => part.startsWith("--sorties="));
  const seeds = seedArg ? Number(seedArg.slice("--seeds=".length)) : 40;
  const sorties = sortieArg ? Number(sortieArg.slice("--sorties=".length)) : 6;
  const result = runCampAllocation2L(seeds, sorties);
  console.log("CAMP_ALLOCATION_2L_JSON=" + JSON.stringify(result));
}
