import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { STORAGE_KEYS } from "../src/services/persistence.js";
import { createSortieRepository } from "../src/services/sortie-persistence.js";
import {
  buildSortieForge,
  createSortieArchive,
  prepareSortieArchive,
  recoverSortieArchive,
  settleSortieArchive,
} from "../src/systems/sortie-session.js";
import {
  chooseSortieSkill,
  createSortie,
  DURATION_TICKS,
  stepSortie,
} from "../src/systems/sortie-sim.js";
import { previewSortieRewards } from "../src/systems/sortie-rewards.js";
import { sortieSeed } from "../src/systems/sortie-trace.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const seeds = Array.from({ length: 40 }, (_, i) => "sortie-2l-c-qa-" + i);

function fullTrace(run, skill = "rune") {
  const battle = createSortie(
    sortieSeed(run),
    Engine.byId(run, "lingzai").d,
    run.sortieCamp?.forgeLevel ?? 0,
  );
  const actions = [];
  let choiceCount = 0;
  for (let tick = 0; tick < DURATION_TICKS && battle.outcome === "running"; tick++) {
    if (battle.skillChoicePending) {
      const pausedAt = battle.tick;
      stepSortie(battle, { x: 0, y: 0 });
      expect(battle.tick).toBe(pausedAt);
      expect(pausedAt).toBe(1500);
      expect(chooseSortieSkill(battle, skill).ok).toBe(true);
      actions.push(["skill", skill]);
      choiceCount++;
    }
    const input = { x: Math.cos(tick / 70), y: Math.sin(tick / 70) };
    stepSortie(battle, input);
    actions.push(["tick", input.x, input.y]);
  }
  return { battle, actions, choiceCount };
}

describe("2L-C fixed-seed regression: existing safe outing (no mission feature yet)", () => {
  it("keeps 75s, exactly one 25s choice and ordinary rewards over 40 seeds / 3 danger bands / 2 skills", () => {
    const outcomes = { won: 0, lost: 0 };
    for (const danger of [0, 40, 75]) {
      for (const skill of ["thunder", "rune"]) {
        for (const seed of seeds) {
          const battle = createSortie(seed, danger);
          let choices = 0;
          for (let tick = 0; tick < DURATION_TICKS && battle.outcome === "running"; tick++) {
            if (battle.skillChoicePending) {
              const pausedAt = battle.tick;
              stepSortie(battle, { x: 0, y: 0 });
              expect(battle.tick).toBe(pausedAt);
              expect(pausedAt).toBe(1500);
              expect(chooseSortieSkill(battle, skill).ok).toBe(true);
              choices++;
            }
            stepSortie(battle, { x: Math.cos(tick / 70), y: Math.sin(tick / 70) });
          }
          expect(["won", "lost"]).toContain(battle.outcome);
          outcomes[battle.outcome]++;
          expect(choices).toBe(battle.tick >= 1500 ? 1 : 0);
          expect(battle.tick).toBeLessThanOrEqual(DURATION_TICKS);
          if (battle.outcome === "won") expect(battle.tick).toBe(DURATION_TICKS);
          const reward = previewSortieRewards(battle);
          const baseStones = battle.outcome === "won" ? 3 : 0;
          expect(reward.baseStones).toBe(baseStones);
          expect(reward.shardStones).toBe(
            Math.min(2, Math.floor(battle.collectedShards / 3)),
          );
          expect(reward.stones).toBe(baseStones + reward.shardStones);
          expect(reward.objectiveStones ?? 0).toBe(0);
          expect(reward.collectedShards + reward.uncollectedShards).toBe(
            Math.floor(battle.defeated / 3),
          );
        }
      }
    }
    expect(outcomes.won + outcomes.lost).toBe(240);
    expect(outcomes.won).toBeGreaterThan(0);
  });

  it("persists two real days, pays 6 stones once and replays both receipts idempotently", () => {
    for (const seed of seeds.slice(0, 5)) {
      const initial = createSortieArchive(seed);
      const baseline = clone(initial);
      const firstStart = prepareSortieArchive(initial);
      expect(firstStart.ok).toBe(true);
      const firstBattle = fullTrace(initial.run, "thunder");
      expect(firstBattle.battle.outcome).toBe("won");
      expect(firstBattle.choiceCount).toBe(1);
      const first = settleSortieArchive(firstStart.archive, firstBattle.actions);
      expect(first.ok).toBe(true);
      expect(initial).toEqual(baseline);
      expect(first.archive.run.day).toBe(2);
      expect(first.receipt.worlds).toHaveLength(2);
      expect(first.receipt.battle.stones).toBeGreaterThanOrEqual(3);
      expect(first.receipt.battle.stones).toBeLessThanOrEqual(5);
      expect(Engine.byId(first.archive.run, "lingzai").resource).toBe(
        4 + first.receipt.battle.stones,
      );

      const beforePayment = clone(first.archive);
      const operationId = "2l-c-forge:" + seed;
      const payment = buildSortieForge(first.archive, operationId);
      expect(payment.ok).toBe(true);
      expect(first.archive).toEqual(beforePayment);
      expect(payment.archive.run.day).toBe(2);
      expect(Engine.byId(payment.archive.run, "lingzai").resource).toBe(
        Engine.byId(first.archive.run, "lingzai").resource - 6,
      );
      expect(payment.archive.run.worlds[1]).toEqual(first.archive.run.worlds[1]);
      expect(buildSortieForge(payment.archive, operationId).replayed).toBe(true);
      expect(buildSortieForge(payment.archive, operationId + "-duplicate").ok).toBe(false);

      const secondStart = prepareSortieArchive(payment.archive);
      expect(secondStart.ok).toBe(true);
      const recovered = recoverSortieArchive(clone(secondStart.archive));
      expect(recovered.interrupted).toBe(true);
      expect(recovered.archive.run.day).toBe(2);
      expect(recovered.archive.run).toEqual(payment.archive.run);
      expect(recovered.archive.lastReceipt).toEqual(first.receipt);
      const retry = prepareSortieArchive(recovered.archive);
      expect(retry.ok).toBe(true);
      expect(retry.sortieId).toBe(secondStart.sortieId);

      const secondBattle = fullTrace(payment.archive.run, "rune");
      expect(secondBattle.battle.outcome).toBe("won");
      const second = settleSortieArchive(retry.archive, secondBattle.actions);
      expect(second.ok).toBe(true);
      expect(second.archive.run.day).toBe(3);
      expect(second.archive.pending).toBeNull();
      expect(second.archive.run.sortieCamp.forgeLevel).toBe(1);
      expect(second.receipt.battle.weaponDamage).toBe(2);
      expect(second.receipt.worlds.map((world) => world.id)).toEqual(["lingzai", "zombie"]);
      expect(Object.keys(second.archive.run.sortieLedger)).toHaveLength(2);
      expect(Engine.byId(second.archive.run, "lingzai").metrics.actions.sortie).toBe(2);
      const day3 = clone(second.archive.run);
      const duplicate = Engine.settleSortie(second.archive.run, {
        sortieId: retry.sortieId,
        actions: secondBattle.actions,
      });
      expect(duplicate.ok).toBe(true);
      expect(duplicate.replayed).toBe(true);
      expect(duplicate.run).toEqual(day3);
    }
  });

  it("isolates the archived payment from official Run/Profile even across interrupted replay", async () => {
    const values = new Map([
      [STORAGE_KEYS.run, { id: "formal-run-canary" }],
      [STORAGE_KEYS.profile, { id: "formal-profile-canary" }],
    ]);
    const store = createSortieRepository({
      get: async (key) => values.get(key),
      set: async (key, value) => { values.set(key, value); },
    });
    const initial = createSortieArchive("2l-c-isolated");
    const first = settleSortieArchive(
      prepareSortieArchive(initial).archive,
      fullTrace(initial.run, "rune").actions,
    );
    expect(first.ok).toBe(true);
    const paid = buildSortieForge(first.archive, "2l-c-persist");
    expect(paid.ok).toBe(true);
    await store.enqueueSave(paid.archive);
    const interrupted = prepareSortieArchive(await store.load());
    await store.enqueueSave(interrupted.archive);
    const recovered = recoverSortieArchive(await store.load());
    await store.enqueueSave(recovered.archive);
    expect((await store.load()).run.day).toBe(2);
    expect((await store.load()).run.sortieCamp.forgeLevel).toBe(1);
    expect(values.get(STORAGE_KEYS.run)).toEqual({ id: "formal-run-canary" });
    expect(values.get(STORAGE_KEYS.profile)).toEqual({ id: "formal-profile-canary" });
  });
});

describe("2L-A/B integration contract: NOT IMPLEMENTED in the 2K baseline", () => {
  it.todo("safe/salvage missionId is persisted and invalid mission IDs are rejected");
  it.todo("real guarded recovery contact is verified by authoritative fixed-tick trace");
  it.todo("objectiveStones is independently awarded only on a completed successful salvage");
  it.todo("failed/retreated salvage keeps the existing ordinary reward contract");
  it.todo("one-time camp preparation has real payment, idempotence and next-outing effects");
});
