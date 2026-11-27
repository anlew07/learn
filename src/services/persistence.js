import { getMany, setMany } from "idb-keyval";
import { LEGACY_DOCTRINES } from "../config/legacy-doctrines.js";

const LEGACY_IDS = new Set(LEGACY_DOCTRINES.map((item) => item.id));

/**
 * Keep a single IndexedDB transaction for run + profile.
 * The driver is injectable so race/failure behavior is tested without a browser.
 */
export const STORAGE_KEYS = Object.freeze({
  run: "simultaneous-apocalypse-simulator-v1",
  profile: "simultaneous-apocalypse-profile-v1",
});

function hasValidLegacyProfile(profile) {
  if (profile.legacyUnlocks !== undefined) {
    if (
      !Array.isArray(profile.legacyUnlocks) ||
      new Set(profile.legacyUnlocks).size !== profile.legacyUnlocks.length ||
      profile.legacyUnlocks.some((id) => typeof id !== "string" || !LEGACY_IDS.has(id))
    ) {
      return false;
    }
  }
  if (profile.activeLegacyId !== undefined) {
    if (
      typeof profile.activeLegacyId !== "string" ||
      (profile.activeLegacyId !== "" &&
        (!Array.isArray(profile.legacyUnlocks) ||
          !profile.legacyUnlocks.includes(profile.activeLegacyId)))
    ) {
      return false;
    }
  }
  return true;
}

export function createSaveRepository(driver = { getMany, setMany }) {
  let tail = Promise.resolve();
  let failureEpoch = 0;
  let lastWriteError = null;

  return {
    async load() {
      const [run, profile] = await driver.getMany([
        STORAGE_KEYS.run,
        STORAGE_KEYS.profile,
      ]);
      return { run: run ?? null, profile: profile ?? null };
    },

    enqueueSave(run, profile) {
      // Snapshot at command time, not when the asynchronous write starts.
      const runSnapshot = run === null ? null : JSON.parse(JSON.stringify(run));
      const profileSnapshot = JSON.parse(JSON.stringify(profile));
      // Commands can queue additional snapshots before an IndexedDB rejection
      // becomes visible. Never let those stale, already-queued operations
      // silently clear the failure banner by succeeding afterward.
      const queuedEpoch = failureEpoch;
      const operation = tail.then(async () => {
        if (queuedEpoch !== failureEpoch) throw lastWriteError;
        try {
          await driver.setMany([
            [STORAGE_KEYS.run, runSnapshot],
            [STORAGE_KEYS.profile, profileSnapshot],
          ]);
        } catch (error) {
          lastWriteError = error;
          failureEpoch += 1;
          throw error;
        }
      });

      // Failed operations reject their own callers. Only a newly enqueued
      // save after the failure (the UI's explicit retry) can write again.
      tail = operation.catch(() => {});
      return operation;
    },
  };
}

export const saveRepository = createSaveRepository();

function isValidPendingEncounter(pending, day) {
  if (
    !pending ||
    typeof pending !== "object" ||
    Array.isArray(pending) ||
    typeof pending.id !== "string" ||
    pending.worldId !== "lingzai" ||
    pending.day !== day ||
    typeof pending.seed !== "string" ||
    !Number.isFinite(pending.danger) ||
    pending.danger < 0 ||
    pending.danger > 100 ||
    !Number.isInteger(pending.forgeLevel) ||
    pending.forgeLevel < 0 ||
    pending.forgeLevel > 1 ||
    (pending.combatLevel !== undefined &&
      (!Number.isInteger(pending.combatLevel) || pending.combatLevel < 1 || pending.combatLevel > 4)) ||
    !["safe", "salvage"].includes(pending.missionId) ||
    typeof pending.reason !== "string" ||
    !["choice", "player", "ai"].includes(pending.controller) ||
    !Array.isArray(pending.actions) ||
    pending.actions.length > 4564
  ) return false;

  return pending.actions.every((action) => {
    if (!Array.isArray(action) || typeof action[0] !== "string") return false;
    if (action[0] === "tick") {
      return action.length === 3 &&
        Number.isFinite(action[1]) && Math.abs(action[1]) <= 1 &&
        Number.isFinite(action[2]) && Math.abs(action[2]) <= 1;
    }
    if (action[0] === "skill" || action[0] === "cast") {
      return action.length === 2 && typeof action[1] === "string";
    }
    return action[0] === "retreat" && action.length === 1;
  });
}

/**
 * Reject incompatible or malformed snapshots before enabling a new writer.
 * This intentionally does not repair, delete or overwrite browser data.
 */
export function assertRestorableSnapshot({ run, profile }, version) {
  if (
    run !== null &&
    (typeof run !== "object" ||
      Array.isArray(run) ||
      run.version !== version ||
      (run.legacyId !== undefined &&
        (typeof run.legacyId !== "string" ||
          (run.legacyId !== "" && !LEGACY_IDS.has(run.legacyId)))) ||
      !Number.isInteger(run.day) ||
      run.day < 1 ||
      !Number.isFinite(run.ap) ||
      !Number.isFinite(run.soul) ||
      !Array.isArray(run.worlds) ||
      run.worlds.length < 1 ||
      (run.worldsSavedCount !== undefined && (!Number.isInteger(run.worldsSavedCount) || run.worldsSavedCount < 0)) ||
      (run.worldSlots !== undefined && (!Number.isInteger(run.worldSlots) || run.worldSlots < 1 || run.worldSlots > 3)) ||
      (run.worldsSavedThisRun !== undefined && (!Number.isInteger(run.worldsSavedThisRun) || run.worldsSavedThisRun < 0)) ||
      (run.worldsFailedThisRun !== undefined && (!Number.isInteger(run.worldsFailedThisRun) || run.worldsFailedThisRun < 0)) ||
      (run.worldsVisitedThisRun !== undefined && (!Number.isInteger(run.worldsVisitedThisRun) || run.worldsVisitedThisRun < 1)) ||
      (run.worldTypesSeen !== undefined && (!Array.isArray(run.worldTypesSeen) || run.worldTypesSeen.some((id) => !["lingzai", "zombie", "beast"].includes(id)))) ||
      (run.worldDiscoveryArchive !== undefined && (!Array.isArray(run.worldDiscoveryArchive) || run.worldDiscoveryArchive.some((id) => typeof id !== "string"))) ||
      !Array.isArray(run.logs) ||
      !Array.isArray(run.echoes) ||
      typeof run.active !== "boolean" ||
      typeof run.paused !== "boolean" ||
      (run.encounterPreference !== undefined &&
        !["ask", "player", "ai"].includes(run.encounterPreference)) ||
      (run.pendingEncounter !== undefined &&
        run.pendingEncounter !== null &&
        !isValidPendingEncounter(run.pendingEncounter, run.day)) ||
      (run.lastEncounter !== undefined && run.lastEncounter !== null &&
        (typeof run.lastEncounter !== "object" ||
          Array.isArray(run.lastEncounter) ||
          typeof run.lastEncounter.id !== "string" ||
          !Number.isInteger(run.lastEncounter.day) ||
          !Number.isInteger(run.lastEncounter.nextDay) ||
          !run.lastEncounter.battle ||
          !Array.isArray(run.lastEncounter.worlds))) ||
      run.worlds.some(
        (world) =>
          !world ||
          !["lingzai", "zombie", "beast"].includes(world.id) ||
          !["running", "saved", "failed"].includes(world.status) ||
          (world.slotId !== undefined && (!Number.isInteger(world.slotId) || world.slotId < 1)) ||
          (world.worldNumber !== undefined && (!Number.isInteger(world.worldNumber) || world.worldNumber < 1)) ||
          (world.transitionSettled !== undefined && typeof world.transitionSettled !== "boolean") ||
          (world.bornDay !== undefined && (!Number.isInteger(world.bornDay) || world.bornDay < 1)) ||
          !Number.isInteger(world.level) ||
          world.level < 1 ||
          !Number.isFinite(world.resource) ||
          !Number.isFinite(world.p) ||
          !Number.isFinite(world.d) ||
          !world.flags ||
          typeof world.flags !== "object" ||
          Array.isArray(world.flags) ||
          !world.build ||
          typeof world.build !== "object" ||
          !Array.isArray(world.build.attack) ||
          !Array.isArray(world.build.support) ||
          [...world.build.attack, ...world.build.support].some(
            (power) =>
              !power || typeof power !== "object" || typeof power.id !== "string",
          ),
      ))
  ) {
    throw new Error("RunState is incompatible or malformed");
  }
  if (
    profile !== null &&
    (typeof profile !== "object" ||
      Array.isArray(profile) ||
      !Number.isInteger(profile.runCount) ||
      profile.runCount < 0 ||
      !Number.isFinite(profile.shards) ||
      profile.shards < 0 ||
      (profile.worldsSaved !== undefined && (!Number.isInteger(profile.worldsSaved) || profile.worldsSaved < 0)) ||
      !hasValidLegacyProfile(profile))
  ) {
    throw new Error("ProfileState is malformed");
  }
}
