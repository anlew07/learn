import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { captureIntervention, summarizeIntervention } from "../src/systems/intervention-ledger.js";

const command = (id, type, args) => ({ operationId: id, type, args });

describe("manual intervention consequences are exact and idempotent", () => {
  it("records actual aid effects, costs, and shared cooldown, not full nominal gain", () => {
    const state = Engine.fresh("ledger-aid", 1, false);
    const target = Engine.byId(state, "zombie");
    target.p = 98;
    Engine.byId(state, "lingzai").resource = 12;
    expect(Engine.applyCommand(state, command("aid:1", "aid", ["lingzai", "zombie", "p"])).ok).toBe(true);
    expect(state.interventions).toHaveLength(1);
    const entry = state.interventions[0];
    expect(entry.apSpent).toBe(1);
    expect(entry.soulSpent).toBe(1);
    expect(entry.nextAidDay).toBe(10);
    expect(entry.changes.find((w) => w.id === "zombie").effects.p).toBe(2);
    expect(entry.changes.find((w) => w.id === "lingzai").effects.resource).toBe(-4);
    expect(Engine.applyCommand(state, command("aid:1", "aid", ["lingzai", "zombie", "p"])).replayed).toBe(true);
    expect(state.interventions).toHaveLength(1);
  });

  it("does not record failed or same-strategy no-op commands", () => {
    const state = Engine.fresh("ledger-idle", 1, false);
    expect(Engine.applyCommand(state, command("s:1", "strategy", ["zombie", "rescue"])).ok).toBe(true);
    expect(state.interventions ?? []).toHaveLength(0);
    const before = JSON.stringify(state);
    expect(Engine.applyCommand(state, command("aid:invalid", "aid", ["zombie", "zombie", "p"])).ok).toBe(false);
    expect(state.interventions ?? []).toHaveLength(0);
    expect(state.worlds[0].resource).toBe(4);
    expect(JSON.stringify(state)).not.toBe(before); // operationResults stores the failed command idempotently
  });

  it("shows a strategy transition without inventing a disaster improvement", () => {
    const state = Engine.fresh("ledger-strategy", 2, false);
    state.day = 4;
    expect(Engine.applyCommand(state, command("strategy:1", "strategy", ["zombie", "growth"])).ok).toBe(true);
    const entry = state.interventions[0];
    expect(entry.apSpent).toBe(1);
    expect(entry.changes).toHaveLength(1);
    expect(entry.changes[0].strategyFrom).toBe("rescue");
    expect(entry.changes[0].strategyTo).toBe("growth");
    expect(entry.changes[0].effects.d).toBe(0);
  });

  it("records exact defensive aid without claiming it saved a fixed number of days", () => {
    const state = Engine.fresh("ledger-doom", 1, false);
    Engine.byId(state, "zombie").d = 5.5;
    expect(Engine.applyCommand(state, command("aid:d", "aid", ["lingzai", "zombie", "d"])).ok).toBe(true);
    const entry = state.interventions[0];
    expect(entry.changes.find((w) => w.id === "zombie").effects.d).toBe(-5.5);
    expect(JSON.stringify(entry)).not.toContain("daysSaved");
  });

  it("tracks chosen skills and zero-cost safe events exactly once", () => {
    const state = Engine.fresh("ledger-event", 1, false);
    const w = Engine.byId(state, "lingzai");
    w.pendingEvent = { id: "clue:1", type: "clue", title: "古碑", state: "active", expiresDay: 4 };
    expect(Engine.applyCommand(state, command("clue:1", "event", ["lingzai", "safe"])).ok).toBe(true);
    expect(state.interventions[0].changes[0].eventResolved).toBe(true);
    expect(state.interventions[0].changes[0].effects.p).toBe(2);
    expect(state.interventions[0].apSpent).toBe(0);
    expect(Engine.applyCommand(state, command("clue:1", "event", ["lingzai", "safe"])).replayed).toBe(true);
    expect(state.interventions).toHaveLength(1);
  });

  it("bounds the persisted history and does not mutate state during preview", () => {
    const state = Engine.fresh("ledger-pure", 1, false);
    const original = JSON.stringify(state);
    const before = captureIntervention(state);
    const output = summarizeIntervention(state, command("noop", "strategy", ["zombie", "rescue"]), before);
    expect(output).toBeNull();
    expect(JSON.stringify(state)).toBe(original);
    for (let i = 0; i < 32; i++) {
      const world = Engine.byId(state, "zombie");
      const next = world.strategy === "clear" ? "growth" : "clear";
      expect(Engine.applyCommand(state, command("s:" + i, "strategy", ["zombie", next])).ok).toBe(true);
    }
    expect(state.interventions).toHaveLength(24);
    expect(state.interventions[0].id).toBe("s:8");
    expect(state.interventions[23].id).toBe("s:31");
  });
});
