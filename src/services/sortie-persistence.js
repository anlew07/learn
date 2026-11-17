import { get, set } from "idb-keyval";

/**
 * One prototype snapshot in one atomic IndexedDB put. This never reads/writes
 * the official run/profile keys. A failed queued write cannot be overtaken.
 */
export const SORTIE_ARCHIVE_KEY = "simultaneous-apocalypse-sortie-prototype-v1";

export function createSortieRepository(driver = { get, set }) {
  let tail = Promise.resolve();
  let failureEpoch = 0;
  let lastError = null;
  return {
    async load() {
      return (await driver.get(SORTIE_ARCHIVE_KEY)) ?? null;
    },
    enqueueSave(snapshot) {
      // A settled receipt and both world states are in the SAME immutable write.
      const copy = JSON.parse(JSON.stringify(snapshot));
      const epoch = failureEpoch;
      const operation = tail.then(async () => {
        if (epoch !== failureEpoch) throw lastError;
        try {
          await driver.set(SORTIE_ARCHIVE_KEY, copy);
        } catch (error) {
          lastError = error;
          failureEpoch++;
          throw error;
        }
      });
      tail = operation.catch(() => {});
      return operation;
    },
  };
}

export const sortieRepository = createSortieRepository();
