import { getMany, setMany } from "idb-keyval";

/**
 * Keep a single IndexedDB transaction for run + profile.
 * The driver is injectable so race/failure behavior is tested without a browser.
 */
export const STORAGE_KEYS = Object.freeze({
  run: "simultaneous-apocalypse-simulator-v1",
  profile: "simultaneous-apocalypse-profile-v1",
});

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
      !Number.isInteger(run.day) ||
      run.day < 1 ||
      !Number.isFinite(run.ap) ||
      !Number.isFinite(run.soul) ||
      !Array.isArray(run.worlds) ||
      run.worlds.length < 2 ||
      !Array.isArray(run.logs) ||
      !Array.isArray(run.echoes) ||
      typeof run.active !== "boolean" ||
      typeof run.paused !== "boolean" ||
      run.worlds.some(
        (world) =>
          !world ||
          !["lingzai", "zombie", "beast"].includes(world.id) ||
          !["running", "saved", "failed"].includes(world.status) ||
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
      profile.shards < 0)
  ) {
    throw new Error("ProfileState is malformed");
  }
}
