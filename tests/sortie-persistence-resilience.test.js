import { describe, expect, it } from "vitest";
import {
  SORTIE_ARCHIVE_KEY,
  createSortieRepository,
} from "../src/services/sortie-persistence.js";
import {
  assertSortieArchive,
  createSortieArchive,
  prepareSortieArchive,
  recoverSortieArchive,
  settleSortieArchive,
} from "../src/systems/sortie-session.js";

const copy = (value) => JSON.parse(JSON.stringify(value));

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("sortie archive persistence resilience", () => {
  it("propagates IndexedDB read failures instead of treating them as an empty archive", async () => {
    const failure = new DOMException("IndexedDB read denied", "UnknownError");
    let writes = 0;
    const repository = createSortieRepository({
      get: async () => {
        throw failure;
      },
      set: async () => {
        writes++;
      },
    });

    await expect(repository.load()).rejects.toBe(failure);
    expect(writes).toBe(0);
  });

  it("serializes successful writes and makes load wait for the latest queued snapshot", async () => {
    const firstWriteGate = deferred();
    const firstWriteStarted = deferred();
    const values = new Map();
    const writeOrder = [];
    const repository = createSortieRepository({
      get: async (key) => values.get(key),
      set: async (key, value) => {
        writeOrder.push(value.revision);
        if (value.revision === 1) {
          firstWriteStarted.resolve();
          await firstWriteGate.promise;
        }
        values.set(key, value);
      },
    });

    const firstSnapshot = { revision: 1 };
    const firstWrite = repository.enqueueSave(firstSnapshot);
    const secondWrite = repository.enqueueSave({ revision: 2 });
    // The repository must capture the command-time value, not this later mutation.
    firstSnapshot.revision = 99;

    await firstWriteStarted.promise;
    const readAfterWrites = repository.load();
    firstWriteGate.resolve();

    await Promise.all([firstWrite, secondWrite]);
    expect(writeOrder).toEqual([1, 2]);
    expect(await readAfterWrites).toEqual({ revision: 2 });
    expect(values.get(SORTIE_ARCHIVE_KEY)).toEqual({ revision: 2 });
  });

  it("recovers a pending outing after a fresh repository instance simulates page close and reload", async () => {
    const values = new Map();
    const driver = {
      get: async (key) => values.get(key),
      set: async (key, value) => {
        values.set(key, value);
      },
    };
    const pageBeforeClose = createSortieRepository(driver);
    const prepared = prepareSortieArchive(createSortieArchive("closed-page"));
    expect(prepared.ok).toBe(true);
    await pageBeforeClose.enqueueSave(prepared.archive);

    // A new repository instance models a new page load after the old one closed.
    const pageAfterReload = createSortieRepository(driver);
    const recovered = recoverSortieArchive(await pageAfterReload.load());
    expect(recovered.interrupted).toBe(true);
    expect(recovered.archive.pending).toBeNull();
    expect(recovered.archive.run.day).toBe(1);
    expect(recovered.archive.lastReceipt).toBeNull();
    expect(recovered.archive.run.sortieLedger).toBeUndefined();
    expect(recovered.archive.run.worlds[0].resource).toBe(4);
    expect(values.get(SORTIE_ARCHIVE_KEY).pending).not.toBeNull();
  });

  it("rejects a duplicated or foreign world roster without repairing or overwriting it", async () => {
    const original = createSortieArchive("bad-world-roster");
    const duplicateWorld = copy(original);
    duplicateWorld.run.worlds[1].id = "lingzai";
    const foreignWorld = copy(original);
    foreignWorld.run.worlds[1].id = "beast";

    for (const invalid of [duplicateWorld, foreignWorld]) {
      expect(() => assertSortieArchive(invalid)).toThrow("世界结构");
    }

    const stored = copy(duplicateWorld);
    const values = new Map([[SORTIE_ARCHIVE_KEY, stored]]);
    let writes = 0;
    const repository = createSortieRepository({
      get: async (key) => values.get(key),
      set: async (key, value) => {
        writes++;
        values.set(key, value);
      },
    });
    const loaded = await repository.load();
    expect(() => recoverSortieArchive(loaded)).toThrow("世界结构");
    expect(await repository.load()).toEqual(stored);
    expect(writes).toBe(0);
  });

  it("rejects a receipt that no longer matches its authoritative settlement ledger", () => {
    const prepared = prepareSortieArchive(createSortieArchive("receipt-ledger"));
    const settled = settleSortieArchive(prepared.archive, [["retreat"]]);
    expect(settled.ok).toBe(true);

    const damaged = copy(settled.archive);
    damaged.lastReceipt.battle.stones += 1;
    expect(() => recoverSortieArchive(damaged)).toThrow("回执与结算账本");
    expect(() => assertSortieArchive(settled.archive)).not.toThrow();
  });

  it("rejects a non-empty settlement ledger when the display receipt is missing", () => {
    const prepared = prepareSortieArchive(createSortieArchive("missing-receipt"));
    const settled = settleSortieArchive(prepared.archive, [["retreat"]]);
    const damaged = copy(settled.archive);
    damaged.lastReceipt = null;

    expect(() => assertSortieArchive(damaged)).toThrow("回执与结算账本");
    expect(settled.archive.lastReceipt).not.toBeNull();
  });
});
