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
      const operation = tail.then(() =>
        driver.setMany([
          [STORAGE_KEYS.run, runSnapshot],
          [STORAGE_KEYS.profile, profileSnapshot],
        ]),
      );

      // A failed operation must be visible to its caller, but must not poison
      // subsequent saves. The next successful save writes both records.
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
      run.worlds.some(
        (world) =>
          !world ||
          typeof world.id !== "string" ||
          !["running", "saved", "failed"].includes(world.status),
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
