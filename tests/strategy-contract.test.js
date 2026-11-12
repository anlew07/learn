import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { previewStrategyChange } from "../src/systems/strategy-contract.js";

describe("long-term strategy changes have truthful costs and UI eligibility", () => {
  it("allows free switching during the first three days", () => {
    const run = Engine.fresh("strategy-free", 1, false);
    const before = JSON.stringify(run);
    const preview = Engine.previewStrategy(run, "lingzai", "clear");
    expect(preview.available).toBe(true);
    expect(preview.cost).toBe(0);
    expect(JSON.stringify(run)).toBe(before);
    expect(Engine.setStrategy(run, "lingzai", "clear").ok).toBe(true);
    expect(run.ap).toBe(2);
  });

  it("charges exactly one AP from day four onward", () => {
    const run = Engine.fresh("strategy-paid", 1, false);
    run.day = 4;
    expect(Engine.previewStrategy(run, "zombie", "growth").cost).toBe(1);
    expect(Engine.setStrategy(run, "zombie", "growth").ok).toBe(true);
    expect(run.ap).toBe(1);
    expect(Engine.setStrategy(run, "zombie", "growth").ok).toBe(true);
    expect(run.ap).toBe(1);
  });

  it("never spends an AP reserved by retreat", () => {
    const run = Engine.fresh("strategy-reserved", 1, false);
    run.day = 5;
    run.ap = 1;
    run.apReserved = 1;
    const before = JSON.stringify(run);
    const preview = Engine.previewStrategy(run, "lingzai", "rescue");
    expect(preview.available).toBe(false);
    expect(preview.reason).toContain("闭关预留");
    expect(Engine.setStrategy(run, "lingzai", "rescue").ok).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
  });

  it("rejects unknown choices without state mutation", () => {
    const run = Engine.fresh("strategy-invalid", 1, false);
    const before = JSON.stringify(run);
    expect(Engine.previewStrategy(run, "lingzai", "infinite-power").available).toBe(false);
    expect(Engine.setStrategy(run, "lingzai", "infinite-power").ok).toBe(false);
    expect(JSON.stringify(run)).toBe(before);
  });

  it("is identical to its pure exported contract", () => {
    const run = Engine.fresh("strategy-pure", 2, false);
    const snapshot = JSON.stringify(run);
    expect(Engine.previewStrategy(run, "zombie", "clear")).toEqual(
      previewStrategyChange(run, "zombie", "clear"),
    );
    expect(JSON.stringify(run)).toBe(snapshot);
  });
});
