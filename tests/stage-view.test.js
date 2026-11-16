import { describe, expect, it } from "vitest";
import { getStageView, getWorldSceneState } from "../src/presentation/stage-view.js";

const makeState = () => ({
  day: 12, paused: true, active: true, ap: 4, apReserved: 1, soul: 7,
  worlds: [
    { id: "lingzai", name: "灵灾", p: 32, d: 78, level: 3, resource: 9,
      deadline: 40, action: "探索遗迹", status: "running", strategy: "clear",
      pendingEvent: { state: "active" }, build: { pending: null },
      threat: { status: "active", progress: 2 } },
    { id: "zombie", name: "废土救援", p: 100, d: 9, level: 4, resource: 1,
      deadline: 50, action: "安置幸存者", status: "saved", strategy: "rescue",
      build: {} },
  ],
});

describe("read-only mobile pixel HUD", () => {
  it("summarizes real world status, risk, event, resources and saved count", () => {
    const run = makeState();
    const view = getStageView(run, "lingzai");
    expect(view).toMatchObject({
      worldId: "lingzai", day: 12, saved: 1, total: 2, ap: 3, soul: 7,
      rescue: 32, danger: 78, level: 3, deadline: 28,
      hasEvent: true, threatActive: true, threatProgress: 2,
      paused: true, action: "探索遗迹",
    });
    expect(view.worlds.map((x) => x.id)).toEqual(["lingzai", "zombie"]);
  });

  it("switching viewed worlds is derived only and does not consume resources", () => {
    const run = makeState();
    const before = JSON.stringify(run);
    const selected = getStageView(run, "zombie");
    expect(selected).toMatchObject({
      worldId: "zombie", saved: 1, statusCode: "saved",
      status: "救援完成", danger: 9, rescue: 100,
    });
    expect(JSON.stringify(run)).toBe(before);
  });

  it("uses safe clamps for missing and corrupt optional display values", () => {
    const run = { day: 2, worlds: [{
      id: "lingzai", status: "running", p: 1000, d: -100,
      deadline: 1, build: null, threat: null,
    }] };
    const view = getStageView(run, "missing");
    expect(view.rescue).toBe(100);
    expect(view.danger).toBe(0);
    expect(view.deadline).toBe(0);
    expect(view.hasEvent).toBe(false);
    expect(view.hasBuild).toBe(false);
    expect(getStageView(null, "lingzai")).toBeNull();
  });
});


describe("living world scene semantics", () => {
  it("shows calm, worsening and critical phases using real crisis levels", () => {
    const world = makeState().worlds[0];
    world.d = 18;
    expect(getWorldSceneState(world, 12).phase).toBe("stable");
    world.d = 55;
    expect(getWorldSceneState(world, 12).phase).toBe("warning");
    world.d = 89;
    expect(getWorldSceneState(world, 12)).toMatchObject({
      phase: "critical", summary: "重大事件 · 等待决策",
      activeThreat: true, hasEvent: true,
    });
    world.pendingEvent = null;
    expect(getWorldSceneState(world, 12).summary).toBe("高危 · 请关注局势");
    world.build.pending = { options: ["a"] };
    expect(getWorldSceneState(world, 12).summary).toBe("战技机会 · 可以选择");
    world.threat.status = "awaiting_alpha";
    expect(getWorldSceneState(world, 12).activeThreat).toBe(true);
  });

  it("separates rescue preparations (P100) from a genuinely saved world", () => {
    const world = makeState().worlds[0];
    world.p = 100;
    world.d = 16;
    world.resource = 13;
    world.level = 4;
    const before = getWorldSceneState(world, 12);
    expect(before).toMatchObject({
      phase: "stable", progressTier: 3, supplyTier: 2, growthTier: 2,
    });
    world.status = "saved";
    expect(getWorldSceneState(world, 12).phase).toBe("restored");
    world.status = "failed";
    expect(getWorldSceneState(world, 12).phase).toBe("lost");
  });

  it("shows observed actions only, recent combat only and never mutates state", () => {
    const world = makeState().worlds[0];
    world.lastDecision = { day: 11, actionId: "gather" };
    world.lastCombat = { day: 10, stages: ["实际结算"] };
    const before = JSON.stringify(world);
    const scene = getWorldSceneState(world, 12);
    expect(scene).toMatchObject({ activity: "gathering", recentCombat: true });
    expect(getWorldSceneState(world, 14).recentCombat).toBe(false);
    expect(JSON.stringify(world)).toBe(before);
  });

  it("handles invalid optional data without inventing events or danger", () => {
    expect(getWorldSceneState(null, 1)).toBeNull();
    expect(getWorldSceneState({status:"running",d:NaN,p:Infinity,level:1},1)).toMatchObject({
      phase: "stable", progressTier: 0, supplyTier: 0, growthTier: 0,
      activeThreat: false, hasEvent: false,
    });
  });
});
