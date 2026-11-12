import { describe, expect, it } from "vitest";
import { selectAutonomousAction, ACTION_LABELS } from "../src/systems/action-policy.js";

function world(overrides = {}) {
  return {
    id: "lingzai",
    level: 1, p: 0, d: 0, resource: 4, strategy: "growth",
    threat: null, repairUsed: false, suppression: 0,
    ...overrides,
  };
}

function choose(w, overrides = {}) {
  return selectAutonomousAction(w, {
    reserve: 10,
    bossLevel: 4,
    threatActive: Boolean(w.threat && w.threat.status !== "cleared"),
    nextRandom: () => 0.5,
    ...overrides,
  });
}

describe("explainable, pure autonomous strategy", () => {
  it("responds differently to initial growth and rescue strategies", () => {
    expect(choose(world()).actionId).toBe("growth");
    const rescue = choose(world({ strategy: "rescue" }));
    expect(rescue.actionId).toBe("explore");
    expect(rescue.reason).toContain("灾变源");
  });

  it("respects late-stage goals rather than blindly choosing growth", () => {
    expect(choose(world({ level: 3, p: 72, strategy: "growth" })).actionId).toBe("rescue");
    expect(choose(world({ level: 4, p: 100, resource: 0 })).actionId).toBe("gather");
  });

  it("prioritizes one-time zombie repair when doom is critical", () => {
    const decision = choose(world({ id: "zombie", d: 91, resource: 15 }));
    expect(decision.actionId).toBe("repair");
    expect(decision.reason).toContain("防线");
  });

  it("retains deterministic beast suppression independent of rare events", () => {
    const decision = choose(world({
      id: "beast", level: 4, p: 100, resource: 18, suppression: 0,
      strategy: "rescue",
    }), { reserve: 18, bossLevel: 5 });
    expect(decision.actionId).toBe("suppress");
  });

  it("does not mutate world data when producing a recommendation", () => {
    const w = world({ level: 2, strategy: "clear", threat: { progress: 1, status: "active" } });
    const before = JSON.stringify(w);
    const first = choose(w);
    expect(JSON.stringify(w)).toBe(before);
    expect(first).toEqual(choose(w));
    expect(first.alternatives.every((id) => ACTION_LABELS[id])).toBe(true);
  });
});
