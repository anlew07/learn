import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { getStageView } from "../src/presentation/stage-view.js";

describe("2Y truthful formal-stage action feedback", () => {
  it("does not label an unsettled first-day action as completed", () => {
    const run = Engine.fresh("2y-opening", 1, true);
    const view = getStageView(run, "lingzai");
    expect(view.recentAction).toBeNull();
    expect(view.encounter).toBeNull();
    expect(view.action).toBe("正在观察灾变");
  });

  it("projects only the confirmed last action and never changes the run", () => {
    const run = Engine.fresh("2y-real-day", 1, true);
    expect(Engine.step(run).ok).toBe(true);
    const world = Engine.byId(run, "lingzai");
    const snapshot = JSON.stringify(run);
    const view = getStageView(run, "lingzai");
    expect(view.recentAction).toEqual({
      day: run.day - 1, label: "上日行动", text: world.action,
    });
    for (let i = 0; i < 10; i++) getStageView(run, "lingzai");
    expect(JSON.stringify(run)).toBe(snapshot);
    const stale = structuredClone(run);
    stale.day += 3;
    expect(getStageView(stale, "lingzai").recentAction).toBeNull();
    stale.worlds[0].lastDecision = null;
    expect(getStageView(stale, "lingzai").recentAction).toBeNull();
  });

  it("preserves a finished world's final-day action but never invents a fight", () => {
    const run = Engine.fresh("2y-final", 1, true);
    run.active = false;
    run.day = 9;
    run.worlds[0].status = "failed";
    run.worlds[0].lastDecision = { day: 9, actionId: "explore" };
    run.worlds[0].action = "调查灵脉";
    const before = JSON.stringify(run);
    const view = getStageView(run, "lingzai");
    expect(view.recentAction).toEqual({
      day: 9, label: "本日结算", text: "调查灵脉",
    });
    expect(view.encounter).toBeNull();
    expect(JSON.stringify(run)).toBe(before);
  });
});
