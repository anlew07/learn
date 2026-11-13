import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";

describe("suppression reward and action boundaries", () => {
  it("never grants stage-two relief without four crystals and one full action", () => {
    const state = Engine.fresh("beast-suppression-shortage", 3, false);
    const world = Engine.byId(state, "beast");
    state.day = 35;
    world.level = 4;
    world.p = 80;
    world.d = 50;
    world.resource = 3;
    world.suppression = 1;
    world.threat = { id: "active-nest", status: "active", progress: 0, retryDay: 1 };

    expect(Engine.step(state).ok).toBe(true);
    expect(world.lastDecision.actionId).toBe("suppress");
    expect(world.suppression).toBe(1);
    expect(world.resource).toBe(6);
    expect(world.d).toBeGreaterThan(50);

    expect(Engine.step(state).ok).toBe(true);
    expect(world.lastDecision.actionId).toBe("suppress");
    expect(world.suppression).toBe(2);
    expect(world.resource).toBe(2);
    expect(Engine.canFinal(state, world, 0)).toBe(false);

    expect(Engine.step(state).ok).toBe(true);
    expect(world.suppression).toBe(2);
    expect(world.metrics.actions.suppress).toBe(2);
  });
});
