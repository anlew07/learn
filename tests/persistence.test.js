import { describe, expect, it } from "vitest";
import { createSaveRepository, STORAGE_KEYS, assertRestorableSnapshot } from "../src/services/persistence.js";

describe("atomic, queued run persistence", () => {
  it("saves run and permanent rewards in one batch per operation", async () => {
    const values = new Map();
    const batches = [];
    const repository = createSaveRepository({
      getMany: async (keys) => keys.map((key) => values.get(key)),
      setMany: async (entries) => {
        batches.push(entries);
        for (const [key, value] of entries) values.set(key, value);
      },
    });
    const run = { id: "a", day: 7, rewarded: true };
    const profile = { runCount: 1, shards: 4 };
    const promise = repository.enqueueSave(run, profile);
    run.day = 99;
    profile.shards = 900;
    await promise;

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect((await repository.load()).run.day).toBe(7);
    expect((await repository.load()).profile.shards).toBe(4);
    expect(values.get(STORAGE_KEYS.run).rewarded).toBe(true);
  });

  it("serializes rapid writes and does not let old saves overwrite new ones", async () => {
    const order = [];
    const values = new Map();
    const repository = createSaveRepository({
      getMany: async (keys) => keys.map((key) => values.get(key)),
      setMany: async (entries) => {
        await Promise.resolve();
        order.push(entries[0][1].day);
        for (const [key, value] of entries) values.set(key, value);
      },
    });

    await Promise.all([
      repository.enqueueSave({ day: 2 }, { runCount: 0 }),
      repository.enqueueSave({ day: 3 }, { runCount: 1 }),
      repository.enqueueSave({ day: 4 }, { runCount: 2 }),
    ]);

    expect(order).toEqual([2, 3, 4]);
    expect((await repository.load()).run.day).toBe(4);
    expect((await repository.load()).profile.runCount).toBe(2);
  });

  it("does not swallow a failed save, then recovers on the next operation", async () => {
    let fails = true;
    const values = new Map();
    const repository = createSaveRepository({
      getMany: async (keys) => keys.map((key) => values.get(key)),
      setMany: async (entries) => {
        if (fails) {
          fails = false;
          throw new Error("IDB unavailable");
        }
        for (const [key, value] of entries) values.set(key, value);
      },
    });

    await expect(repository.enqueueSave({ day: 3 }, { shards: 0 })).rejects.toThrow(
      "IDB unavailable",
    );
    expect((await repository.load()).run).toBeNull();
    await repository.enqueueSave({ day: 4 }, { shards: 3 });
    expect((await repository.load()).run.day).toBe(4);
    expect((await repository.load()).profile.shards).toBe(3);
  });
});

describe("save recovery guard", () => {
  const valid = () => ({
    run: {
      version: "0.2.0",
      day: 3,
      ap: 2,
      soul: 7,
      worlds: [
        { id: "lingzai", status: "running" },
        { id: "zombie", status: "saved" },
      ],
    },
    profile: { runCount: 1, shards: 3 },
  });

  it("accepts fresh storage, including a missing profile, and a valid run", () => {
    expect(() => assertRestorableSnapshot({ run: null, profile: null }, "0.2.0")).not.toThrow();
    expect(() => assertRestorableSnapshot({ ...valid(), profile: null }, "0.2.0")).not.toThrow();
    expect(() => assertRestorableSnapshot(valid(), "0.2.0")).not.toThrow();
  });

  it("fails closed on incompatible and corrupt runs without modifying the input", () => {
    const cases = [
      { ...valid(), run: { ...valid().run, version: "0.1.0" } },
      { ...valid(), run: { ...valid().run, worlds: [] } },
      { ...valid(), run: { ...valid().run, worlds: [{ id: "lingzai" }, null] } },
      { ...valid(), run: { ...valid().run, day: NaN } },
      { ...valid(), run: "not-json-state" },
    ];
    for (const snapshot of cases) {
      const before = JSON.stringify(snapshot);
      expect(() => assertRestorableSnapshot(snapshot, "0.2.0")).toThrow(/RunState/);
      expect(JSON.stringify(snapshot)).toBe(before);
    }
  });

  it("rejects invalid permanent profile rather than replacing it with an empty one", () => {
    for (const profile of [{ runCount: -1, shards: 0 }, { runCount: 1 }, "invalid"]) {
      expect(() => assertRestorableSnapshot({ ...valid(), profile }, "0.2.0")).toThrow(
        /ProfileState/,
      );
    }
  });

  it("propagates an IndexedDB read rejection and preserves stored values", async () => {
    const original = { run: { day: 4 }, profile: { shards: 8 } };
    const store = new Map([
      [STORAGE_KEYS.run, original.run],
      [STORAGE_KEYS.profile, original.profile],
    ]);
    let failRead = true;
    const repository = createSaveRepository({
      getMany: async (keys) => {
        if (failRead) throw new DOMException("Access denied", "SecurityError");
        return keys.map((key) => store.get(key));
      },
      setMany: async (entries) => {
        for (const [key, value] of entries) store.set(key, value);
      },
    });
    await expect(repository.load()).rejects.toMatchObject({ name: "SecurityError" });
    expect(store.get(STORAGE_KEYS.run)).toEqual(original.run);
    failRead = false;
    expect(await repository.load()).toEqual(original);
  });
});
