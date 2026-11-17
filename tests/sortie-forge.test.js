import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { SORTIE } from "../src/config/sortie-data.js";
import { STORAGE_KEYS } from "../src/services/persistence.js";
import { createSortieRepository } from "../src/services/sortie-persistence.js";
import {
  createSortieArchive, assertSortieArchive, recoverSortieArchive,
  prepareSortieArchive, settleSortieArchive, previewSortieForge, buildSortieForge,
} from "../src/systems/sortie-session.js";
import { createSortie, stepSortie, chooseSortieSkill, DURATION_TICKS } from "../src/systems/sortie-sim.js";

const clone = (obj) => JSON.parse(JSON.stringify(obj));
const retreat = [["retreat"]];

function finishedBattle(run) {
  const ling = Engine.byId(run, "lingzai");
  const seed = run.seed + "/run-" + run.runNumber + "/lingzai/day-" + run.day;
  const battle = createSortie(seed, ling.d, run.sortieCamp?.forgeLevel ?? 0);
  const actions = [];
  for (let t = 0; t < DURATION_TICKS && battle.outcome === "running"; t++) {
    if (battle.skillChoicePending) {
      expect(chooseSortieSkill(battle, "thunder").ok).toBe(true);
      actions.push(["skill", "thunder"]);
    }
    const input = { x: Math.cos(t / 70), y: Math.sin(t / 70) };
    stepSortie(battle, input);
    actions.push(["tick", input.x, input.y]);
  }
  expect(battle.outcome).toBe("won");
  return actions;
}

describe("exactly one camp forge, only in the experimental run", () => {
  it("starts with an unbuilt pedestal and never unlocks before one completed outing", () => {
    const archive = createSortieArchive("forge-initial");
    const fresh = previewSortieForge(archive);
    expect(fresh.built).toBe(false);
    expect(fresh.available).toBe(false);
    expect(fresh.stones).toBe(4);
    expect(fresh.cost).toBe(6);
    expect(fresh.nextDamage).toBe(2);
    expect(buildSortieForge(archive, "forge:first").ok).toBe(false);
    const prepared = prepareSortieArchive(archive);
    expect(prepared.forgeLevel).toBe(0);
    expect(buildSortieForge(prepared.archive, "forge:while-fighting").ok).toBe(false);
    const abandoned = recoverSortieArchive(prepared.archive);
    expect(abandoned.interrupted).toBe(true);
    expect(abandoned.archive.run.sortieCamp.forgeLevel).toBe(0);
  });

  it("success grants at least enough to repair, and payment is atomic, once, and day-neutral", () => {
    const initial = createSortieArchive("forge-award-first");
    const prepared = prepareSortieArchive(initial);
    const first = settleSortieArchive(prepared.archive, finishedBattle(initial.run));
    expect(first.ok).toBe(true);
    const before = first.archive;
    const ling = Engine.byId(before.run, "lingzai");
    expect(ling.resource).toBeGreaterThanOrEqual(7);
    expect(previewSortieForge(before).available).toBe(true);
    const firstRun = clone(before);
    const payment = buildSortieForge(before, "forge:build-1");
    expect(payment.ok).toBe(true);
    expect(before).toEqual(firstRun);
    expect(payment.archive.run.day).toBe(before.run.day);
    expect(payment.archive.run.ap).toBe(before.run.ap);
    expect(payment.archive.run.worlds[1]).toEqual(before.run.worlds[1]);
    expect(Engine.byId(payment.archive.run, "lingzai").resource).toBe(ling.resource - 6);
    expect(payment.archive.run.sortieCamp.forgeLevel).toBe(1);
    expect(payment.receipt.beforeStats.defeated).toBe(first.receipt.battle.defeated);
    expect(payment.receipt.weaponDamage).toBe(2);
    expect(payment.receipt.beforeStones).toBe(ling.resource);
    expect(payment.receipt.afterStones).toBe(ling.resource - 6);
    expect(previewSortieForge(payment.archive).built).toBe(true);
    expect(buildSortieForge(payment.archive, "forge:another-id").ok).toBe(false);
    const repeat = buildSortieForge(payment.archive, "forge:build-1");
    expect(repeat.ok).toBe(true);
    expect(repeat.replayed).toBe(true);
    expect(repeat.archive).toEqual(payment.archive);
    expect(Engine.byId(payment.archive.run, "lingzai").build).toEqual(ling.build);
    expect(payment.archive.run.day).toBe(2);
  });

  it("insufficient stones, a failed run, or invalid operation IDs cannot force payment", () => {
    const first = prepareSortieArchive(createSortieArchive("low-funds"));
    const completed = settleSortieArchive(first.archive, retreat);
    expect(completed.ok).toBe(true);
    const original = clone(completed.archive);
    expect(previewSortieForge(completed.archive).available).toBe(false);
    for (const id of ["forged", "", "invalid space", "x".repeat(129)]) {
      expect(buildSortieForge(completed.archive, id).ok).toBe(false);
    }
    expect(completed.archive).toEqual(original);
    completed.archive.run.worlds[0].resource = 6;
    expect(buildSortieForge(completed.archive, "forge:allowed").ok).toBe(true);
    expect(buildSortieForge(completed.archive, "forge:bad id").ok).toBe(false);
  });

  it("really changes the basic projectile damage and the seeded authoritative second sortie", () => {
    // Identical initial attack positions: one shot only scratches a 2-HP wolf in Lv0.
    function oneImpact(level) {
      const battle = createSortie("same-seed", 0, level);
      battle.schedule = [];
      battle.nextShotTick = Infinity;
      battle.enemies.push({ id: 555, kind: "wolf", x: 190, y: 224, hp: 2 });
      battle.shots.push({ x: 190, y: 224, vx: 0, vy: 0, ttl: 5 });
      stepSortie(battle);
      return battle;
    }
    const weak = oneImpact(0), upgraded = oneImpact(1);
    expect(weak.enemies[0].hp).toBe(1);
    expect(weak.defeated).toBe(0);
    expect(upgraded.enemies).toHaveLength(0);
    expect(upgraded.defeated).toBe(1);
    expect(weak.weaponDamage).toBe(1);
    expect(upgraded.weaponDamage).toBe(2);

    const initial = createSortieArchive("two-battle-first");
    const first = settleSortieArchive(prepareSortieArchive(initial).archive,
      finishedBattle(initial.run));
    const paid = buildSortieForge(first.archive, "forge:2nd-battle");
    expect(paid.ok).toBe(true);
    const prepared = prepareSortieArchive(paid.archive);
    expect(prepared.forgeLevel).toBe(1);
    const second = settleSortieArchive(prepared.archive, finishedBattle(paid.archive.run));
    expect(second.ok).toBe(true);
    expect(first.receipt.battle.weaponDamage).toBe(1);
    expect(second.receipt.battle.weaponDamage).toBe(2);
    expect(second.archive.lastReceipt.battle.weaponDamage).toBe(2);
    expect(second.archive.run.day).toBe(3);
    expect(second.archive.run.sortieCamp.forgeLevel).toBe(1);
    expect(Engine.byId(second.archive.run, "lingzai").metrics.actions.sortie).toBe(2);
    expect(Engine.byId(second.archive.run, "zombie").metrics.actions).toBeDefined();
  });

  it("rejects forged levels and damaged forge receipts without overwriting previous snapshots", () => {
    const base = createSortieArchive("forge-corrupt");
    for (const bad of [
      { ...base, run: { ...base.run, sortieCamp: { forgeLevel: 8, buildReceipt: null } } },
      { ...base, run: { ...base.run, sortieCamp: { forgeLevel: 1, buildReceipt: null } } },
      { ...base, run: { ...base.run, sortieCamp: { forgeLevel: 0, buildReceipt: { operationId: "x" } } } },
    ]) expect(() => assertSortieArchive(bad)).toThrow("护灵剑台");
    expect(() => createSortie("bad", 0, 2)).toThrow();
    const run = clone(base.run);
    run.sortieCamp = { forgeLevel: 2, buildReceipt: null };
    expect(Engine.settleSortie(run, { sortieId: run.id + "/lingzai/day-1",
      actions: retreat }).ok).toBe(false);
    expect(base.run.sortieCamp.forgeLevel).toBe(0);
  });

  it("failed IndexedDB forge payment never mutates committed balance; retry commits one new snapshot", async () => {
    const values = new Map([[STORAGE_KEYS.run, { id: "official" }],
      [STORAGE_KEYS.profile, { saved: true }]]);
    let deny = true;
    const repo = createSortieRepository({
      get: async key => values.get(key),
      set: async (key, value) => {
        if (deny && value.run.sortieCamp.forgeLevel === 1) {
          deny = false;
          throw new DOMException("Quota full", "QuotaExceededError");
        }
        values.set(key, value);
      },
    });
    const first = prepareSortieArchive(createSortieArchive("forge-storage"));
    const settled = settleSortieArchive(first.archive, finishedBattle(first.archive.run));
    expect(settled.ok).toBe(true);
    await repo.enqueueSave(settled.archive);
    const payment = buildSortieForge(settled.archive, "forge:pay");
    await expect(repo.enqueueSave(payment.archive)).rejects.toThrow("Quota full");
    const previous = await repo.load();
    expect(previous.run.sortieCamp.forgeLevel).toBe(0);
    expect(Engine.byId(previous.run, "lingzai").resource).toBe(
      Engine.byId(settled.archive.run, "lingzai").resource);
    await repo.enqueueSave(payment.archive);
    const persisted = await repo.load();
    expect(persisted.run.sortieCamp.forgeLevel).toBe(1);
    expect(persisted.run.sortieCamp.buildReceipt.operationId).toBe("forge:pay");
    expect(values.get(STORAGE_KEYS.run)).toEqual({ id: "official" });
    expect(values.get(STORAGE_KEYS.profile)).toEqual({ saved: true });
    const recovered = recoverSortieArchive(persisted);
    expect(previewSortieForge(recovered.archive).built).toBe(true);
  });
});
