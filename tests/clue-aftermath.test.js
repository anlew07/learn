import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { dailyDoomPressure } from "../src/config/balance.js";
import {
  CLUE_SAFETY,
  cautiousMitigation,
  cautiousAftermathSummary,
  settleCautiousAftermath,
} from "../src/systems/clue-aftermath.js";

function withClue() {
  const state = Engine.fresh("safe-aftermath", 1, false);
  const world = Engine.byId(state, "lingzai");
  world.pendingEvent = {
    id: "lingzai/clue/test",
    type: "clue",
    title: "雾谷古碑",
    state: "active",
    expiresDay: state.day + 3,
  };
  return { state, world };
}

describe("cautious clue aftermath", () => {
  it("advertises the exact four-day mitigation and preserves immediate P+2", () => {
    const { state, world } = withClue();
    const preview = Engine.previewMajorEvent(state, world);
    expect(preview.options.find((item) => item.id === "safe").summary).toContain("4日");
    const initialAP = state.ap;
    const initialRng = JSON.stringify(world.rng);
    expect(Engine.resolveEvent(state, world.id, "safe").ok).toBe(true);
    expect(world.p).toBe(2);
    expect(state.ap).toBe(initialAP);
    expect(JSON.stringify(world.rng)).toBe(initialRng);
    expect(world.clueSafety).toMatchObject({
      start: 2,
      until: 5,
      perDay: 0.2,
      resolved: false,
    });
    expect(Engine.resolveEvent(state, world.id, "safe").ok).toBe(false);
  });

  it("does not apply on settlement day or outside the four valid days", () => {
    const { state, world } = withClue();
    Engine.resolveEvent(state, world.id, "safe");
    const before = JSON.stringify(world);
    expect(cautiousMitigation(world, 1)).toBe(0);
    for (const day of [2, 3, 4, 5]) {
      expect(cautiousMitigation(world, day)).toBe(CLUE_SAFETY.naturalDoomReduction);
      expect(cautiousAftermathSummary(world, day)).toContain("剩余");
    }
    expect(cautiousMitigation(world, 6)).toBe(0);
    expect(JSON.stringify(world)).toBe(before);
    expect(settleCautiousAftermath(world, 4)).toBeNull();
    expect(settleCautiousAftermath(world, 5)).toContain("防护部署");
    expect(settleCautiousAftermath(world, 5)).toBeNull();
    expect(cautiousMitigation({ ...world, status: "saved" }, 3)).toBe(0);
  });

  it("actually reduces natural pressure once, without changing other resources", () => {
    const { state, world } = withClue();
    Engine.resolveEvent(state, world.id, "safe");
    world.p = 0;
    world.resource = 5;
    world.strategy = "growth";
    world.xp = 0;
    state.day = 2;
    const expected = dailyDoomPressure(2, state.runNumber);
    Engine.step(state);
    expect(world.d).toBeCloseTo(Math.max(0, expected - 0.2), 2);
    expect(world.clueSafety.resolved).toBe(false);
    const saved = JSON.parse(JSON.stringify(state));
    expect(cautiousMitigation(Engine.byId(saved, "lingzai"), 3)).toBe(0.2);
  });

  it("leaves risky and declined routes without a cautious shield", () => {
    const declined = withClue();
    expect(Engine.resolveEvent(declined.state, declined.world.id, "decline").ok).toBe(true);
    expect(declined.world.clueSafety).toBeUndefined();
    const risky = withClue();
    risky.state.ap = 2;
    expect(Engine.resolveEvent(risky.state, risky.world.id, "push").ok).toBe(true);
    expect(risky.world.clueSafety).toBeUndefined();
  });
});
