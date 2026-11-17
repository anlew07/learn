import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { STORAGE_KEYS } from "../src/services/persistence.js";
import {
  SORTIE_ARCHIVE_KEY,
  createSortieRepository,
} from "../src/services/sortie-persistence.js";
import {
  createSortieArchive,
  assertSortieArchive,
  prepareSortieArchive,
  recoverSortieArchive,
  settleSortieArchive,
} from "../src/systems/sortie-session.js";
import {
  sortieIdentity,
  sortieSeed,
  replaySortieTrace,
} from "../src/systems/sortie-trace.js";
import { createSortie, stepSortie, chooseSortieSkill, DURATION_TICKS } from "../src/systems/sortie-sim.js";

const copied = (value) => JSON.parse(JSON.stringify(value));
const retreatTrace = [["retreat"]];

function winTrace(run) {
  const world = Engine.byId(run, "lingzai");
  const battle = createSortie(sortieSeed(run), world.d);
  const actions = [];
  for (let i = 0; i < DURATION_TICKS && battle.outcome === "running"; i++) {
    if (battle.skillChoicePending) {
      expect(chooseSortieSkill(battle, "thunder").ok).toBe(true);
      actions.push(["skill", "thunder"]);
    }
    const x = Math.cos(i / 70);
    const y = Math.sin(i / 70);
    stepSortie(battle, { x, y });
    actions.push(["tick", x, y]);
  }
  expect(battle.outcome).toBe("won");
  return actions;
}

describe("sortie authority: one action, one day, independent world", () => {
  it("uses the real Engine world pressure, skips Lingzai autonomous action and advances zombie", () => {
    const archive = createSortieArchive("first-day");
    const before = copied(archive.run);
    const first = prepareSortieArchive(archive);
    expect(first.ok).toBe(true);
    expect(first.archive.pending.sortieId).toBe(sortieIdentity(archive.run));
    expect(archive.pending).toBeNull();

    const result = settleSortieArchive(first.archive, retreatTrace);
    expect(result.ok).toBe(true);
    expect(archive.run).toEqual(before);
    expect(result.archive.run.day).toBe(2);
    expect(result.archive.pending).toBeNull();
    expect(result.receipt.worlds.map((world) => world.id)).toEqual(["lingzai", "zombie"]);
    expect(result.receipt.worlds[0].actionId).toBe("sortie");
    expect(result.receipt.worlds[1].actionId).not.toBe("sortie");

    const ling = Engine.byId(result.archive.run, "lingzai");
    const zombie = Engine.byId(result.archive.run, "zombie");
    expect(ling.metrics.actions.sortie).toBe(1);
    expect(Object.values(ling.metrics.actions).reduce((a, v) => a + v, 0)).toBe(1);
    expect(Object.values(zombie.metrics.actions).reduce((a, v) => a + v, 0)).toBe(1);
    expect(ling.lastSortie.outcome).toBe("retreated");
    expect(ling.lastCombat).toBeNull();
    expect(result.receipt.battle.stones).toBe(0);
    expect(result.receipt.battle.experience).toBe(0);
    expect(result.receipt.battle.progress).toBe(0);

    const ordinary = copied(before);
    Engine.step(ordinary);
    const zombieBaseline = Engine.byId(ordinary, "zombie");
    expect(zombie.rng).toEqual(zombieBaseline.rng);
    expect(zombie.lastDecision).toEqual(zombieBaseline.lastDecision);
    expect(zombie.xp).toBe(zombieBaseline.xp);
    expect(zombie.resource).toBe(zombieBaseline.resource);
    expect(zombie.p).toBe(zombieBaseline.p);
    expect(zombie.d).toBe(zombieBaseline.d);
  });

  it("validates 75-second success and awards actual XP, P and resource in one action", () => {
    const archive = createSortieArchive("closed-loop-award");
    const prepared = prepareSortieArchive(archive);
    const actions = winTrace(archive.run);
    const result = settleSortieArchive(prepared.archive, actions);
    expect(result.ok).toBe(true);
    expect(result.receipt.battle.outcome).toBe("won");
    expect(result.receipt.battle.stones).toBeGreaterThanOrEqual(3);
    expect(result.receipt.battle.stones).toBeLessThanOrEqual(5);
    expect(result.receipt.battle.experience).toBe(2);
    expect(result.receipt.battle.progress).toBe(2);
    const ling = Engine.byId(result.archive.run, "lingzai");
    expect(ling.resource).toBe(4 + result.receipt.battle.stones);
    expect(ling.xp).toBeGreaterThanOrEqual(2);
    expect(ling.p).toBeGreaterThanOrEqual(2);
    expect(ling.metrics.actions.sortie).toBe(1);
    expect(ling.metrics.waveCombats).toBe(0);
    expect(ling.lastCombat).toBeNull();
    expect(result.receipt.worlds[0].resourceDelta).toBe(result.receipt.battle.stones);
    expect(result.receipt.worlds[0].pDelta).toBe(2);
  });

  it("replaying identical sortieId cannot grant resources or advance two days", () => {
    const prepared = prepareSortieArchive(createSortieArchive("duplicate"));
    const first = settleSortieArchive(prepared.archive, retreatTrace);
    expect(first.ok).toBe(true);
    const saved = copied(first.archive.run);
    const twice = Engine.settleSortie(first.archive.run, {
      sortieId: prepared.sortieId,
      actions: retreatTrace,
    });
    expect(twice.ok).toBe(true);
    expect(twice.replayed).toBe(true);
    expect(twice.run).toEqual(saved);
    const inconsistent = Engine.settleSortie(first.archive.run, {
      sortieId: prepared.sortieId,
      actions: [["tick", 0, 0], ["retreat"]],
    });
    expect(inconsistent.ok).toBe(false);
    expect(first.archive.run).toEqual(saved);
    const newDay = prepareSortieArchive(first.archive);
    expect(newDay.ok).toBe(true);
    expect(newDay.sortieId).not.toBe(prepared.sortieId);
    const second = settleSortieArchive(newDay.archive, retreatTrace);
    expect(second.ok).toBe(true);
    expect(second.archive.run.day).toBe(3);
    expect(Object.keys(second.archive.run.sortieLedger)).toHaveLength(2);
  });

  it("rejects premature, malformed and forged combat traces without mutating any world", () => {
    const original = createSortieArchive("tamper");
    const { archive, sortieId } = prepareSortieArchive(original);
    const baseline = copied(archive);
    for (const actions of [
      [],
      [["tick", 0, 0]],
      [["tick", Number.NaN, 0]],
      [["tick", 9, 0], ["retreat"]],
      [["skill", "thunder"], ["retreat"]],
      [["retreat"], ["retreat"]],
      Array.from({ length: DURATION_TICKS + 3 }, () => ["tick", 0, 0]),
    ]) {
      const outcome = settleSortieArchive(archive, actions);
      expect(outcome.ok).toBe(false);
      expect(archive).toEqual(baseline);
    }
    expect(Engine.settleSortie(archive.run, {
      sortieId: sortieId + "-forged",
      actions: retreatTrace,
    }).ok).toBe(false);
    expect(archive).toEqual(baseline);
    expect(replaySortieTrace(sortieSeed(archive.run), 0, retreatTrace).battle.outcome).toBe("retreated");
  });

  it("does not pretend a successful battle overrides a world reaching its doom/deadline", () => {
    const archive = createSortieArchive("last-day");
    archive.run.day = 76;
    const ling = Engine.byId(archive.run, "lingzai");
    ling.d = 99.9;
    const prepared = prepareSortieArchive(archive);
    expect(prepared.ok).toBe(true);
    const result = settleSortieArchive(prepared.archive, retreatTrace);
    expect(result.ok).toBe(true);
    expect(Engine.byId(result.archive.run, "lingzai").status).toBe("failed");
    expect(result.receipt.worlds[0].status).toBe("failed");
  });
});

describe("prototype persistence and interruption safety", () => {
  const createMemoryDriver = () => {
    const data = new Map();
    return {
      data,
      driver: {
        get: async (key) => data.get(key),
        set: async (key, value) => { data.set(key, value); },
      },
    };
  };

  it("uses exactly one isolated key and preserves official Run/Profile values", async () => {
    const { data, driver } = createMemoryDriver();
    data.set(STORAGE_KEYS.run, { precious: "official-run" });
    data.set(STORAGE_KEYS.profile, { precious: "official-profile" });
    const repo = createSortieRepository(driver);
    const first = prepareSortieArchive(createSortieArchive("storage-isolated"));
    await repo.enqueueSave(first.archive);
    expect(data.has(SORTIE_ARCHIVE_KEY)).toBe(true);
    expect(await repo.load()).toEqual(first.archive);
    expect(data.get(STORAGE_KEYS.run)).toEqual({ precious: "official-run" });
    expect(data.get(STORAGE_KEYS.profile)).toEqual({ precious: "official-profile" });
  });

  it("abandoned pending battle rolls back without world-day progress or rewards", async () => {
    const { driver } = createMemoryDriver();
    const repo = createSortieRepository(driver);
    const prepared = prepareSortieArchive(createSortieArchive("refresh"));
    await repo.enqueueSave(prepared.archive);
    const recovered = recoverSortieArchive(await repo.load());
    expect(recovered.interrupted).toBe(true);
    expect(recovered.archive.pending).toBeNull();
    expect(recovered.archive.run.day).toBe(1);
    expect(Engine.byId(recovered.archive.run, "lingzai").resource).toBe(4);
    expect(recovered.archive.lastReceipt).toBeNull();
    expect(prepareSortieArchive(recovered.archive).ok).toBe(true);
  });

  it("failed write cannot grant staged reward, then explicit retry stores once", async () => {
    const { data, driver } = createMemoryDriver();
    let failOnce = true;
    const repo = createSortieRepository({
      get: driver.get,
      set: async (key, value) => {
        if (failOnce && value.lastReceipt) {
          failOnce = false;
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        }
        await driver.set(key, value);
      },
    });
    const first = prepareSortieArchive(createSortieArchive("quota"));
    await repo.enqueueSave(first.archive);
    const staged = settleSortieArchive(first.archive, retreatTrace);
    expect(staged.ok).toBe(true);
    await expect(repo.enqueueSave(staged.archive)).rejects.toMatchObject({
      name: "QuotaExceededError",
    });
    expect((await repo.load()).pending).not.toBeNull();
    expect((await repo.load()).run.day).toBe(1);
    expect((await repo.load()).lastReceipt).toBeNull();
    await repo.enqueueSave(staged.archive);
    expect((await repo.load()).run.day).toBe(2);
    expect((await repo.load()).lastReceipt).toEqual(staged.receipt);
    expect(data.size).toBe(1);
  });

  it("does not let a queued stale write overwrite a commit after a failure", async () => {
    const { driver } = createMemoryDriver();
    let failOnce = true;
    const repo = createSortieRepository({
      get: driver.get,
      set: async (key, snapshot) => {
        if (failOnce) {
          failOnce = false;
          throw new Error("IDB denied");
        }
        await driver.set(key, snapshot);
      },
    });
    const first = prepareSortieArchive(createSortieArchive("queued-fail"));
    const next = settleSortieArchive(first.archive, retreatTrace);
    const rejected = repo.enqueueSave(first.archive);
    const stale = repo.enqueueSave(next.archive);
    await expect(rejected).rejects.toThrow("IDB denied");
    await expect(stale).rejects.toThrow("IDB denied");
    expect(await repo.load()).toBeNull();
    await repo.enqueueSave(next.archive);
    expect((await repo.load()).run.day).toBe(2);
  });

  it("rejects damaged or mismatched prototype without destroying anything", () => {
    const original = createSortieArchive("damaged");
    expect(assertSortieArchive(original)).toBe(true);
    for (const invalid of [
      { ...original, version: "other" },
      { ...original, run: { ...original.run, worlds: [] } },
      { ...original, pending: { sortieId: "wrong", day: 1 } },
      { ...original, lastReceipt: "fake" },
    ]) {
      const snapshot = copied(invalid);
      expect(() => recoverSortieArchive(invalid)).toThrow();
      expect(invalid).toEqual(snapshot);
    }
  });
});
