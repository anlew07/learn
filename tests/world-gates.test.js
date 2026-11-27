import { describe, expect, it } from "vitest";
import { getWorldGateView, worldGatePanelHtml } from "../src/world-gates.js";

function makeWorld(overrides = {}) {
  return {
    id: "lingzai",
    name: "灵灾",
    worldNumber: 1,
    slotId: 1,
    status: "running",
    p: 35,
    d: 12,
    level: 2,
    resource: 5,
    deadline: 76,
    ...overrides,
  };
}

function makeRun(overrides = {}) {
  return {
    day: 12,
    worldSlots: 1,
    worldsVisitedThisRun: 1,
    worldsSavedThisRun: 0,
    worlds: [makeWorld()],
    ...overrides,
  };
}

describe("read-only cross-world gate view", () => {
  it("shows one active gate and two locked gates for a new run", () => {
    const run = makeRun();
    const before = JSON.stringify(run);
    const view = getWorldGateView(run, "lingzai");

    expect(view).toMatchObject({
      activeCount: 1,
      unlockedSlots: 1,
      visitedCount: 1,
      slots: [
        { slotId: 1, state: "active", worldNumber: 1, selected: true },
        { slotId: 2, state: "locked", lockHint: "再成功救援 1 个世界后开启" },
        { slotId: 3, state: "locked", lockHint: "再成功救援 2 个世界后开启" },
      ],
    });
    expect(JSON.stringify(run)).toBe(before);
  });

  it("maps the first rescue arrivals into the two real active slots", () => {
    const run = makeRun({
      day: 2,
      worldSlots: 2,
      worldsVisitedThisRun: 3,
      worldsSavedThisRun: 1,
      worlds: [
        makeWorld({
          status: "saved",
          p: 100,
          d: 0,
          transitionSettled: true,
          endDay: 1,
        }),
        makeWorld({
          id: "zombie",
          name: "废土救援",
          worldNumber: 2,
          slotId: 1,
          p: 18,
          d: 41,
          level: 1,
        }),
        makeWorld({
          id: "beast",
          name: "生态守护",
          worldNumber: 3,
          slotId: 2,
          p: 4,
          d: 8,
          level: 1,
        }),
      ],
    });

    const view = getWorldGateView(run, "zombie");
    expect(view.activeCount).toBe(2);
    expect(view.slots.map((slot) => slot.state)).toEqual([
      "active",
      "active",
      "locked",
    ]);
    expect(view.slots[0]).toMatchObject({
      worldId: "zombie",
      worldNumber: 2,
      selected: true,
      risk: "warning",
    });
    expect(view.slots[1]).toMatchObject({
      worldId: "beast",
      worldNumber: 3,
      selected: false,
    });
    expect(view.history[0]).toMatchObject({
      worldNumber: 1,
      title: "灵灾",
      statusLabel: "已救援",
    });
  });

  it("keeps all three active gates when a rescued slot is replaced", () => {
    const run = makeRun({
      worldSlots: 3,
      worldsVisitedThisRun: 7,
      worldsSavedThisRun: 4,
      worlds: [
        makeWorld({ status: "saved", worldNumber: 4, endDay: 8 }),
        makeWorld({ id: "zombie", name: "废土救援", worldNumber: 5, slotId: 1 }),
        makeWorld({ id: "beast", name: "生态守护", worldNumber: 6, slotId: 2 }),
        makeWorld({ id: "lingzai", name: "灵灾", worldNumber: 7, slotId: 3 }),
      ],
    });

    const view = getWorldGateView(run, "lingzai");
    expect(view.activeCount).toBe(3);
    expect(view.slots.map((slot) => slot.state)).toEqual([
      "active",
      "active",
      "active",
    ]);
    expect(view.nextHint).toContain("其他世界继续演化");
  });

  it("keeps a failed unlocked slot visible without making up a replacement world", () => {
    const run = makeRun({
      worldSlots: 2,
      worlds: [
        makeWorld({ status: "failed", endDay: 6 }),
        makeWorld({ id: "zombie", name: "废土救援", worldNumber: 2, slotId: 2 }),
      ],
    });

    const view = getWorldGateView(run, "zombie");
    expect(view.slots[0]).toMatchObject({
      state: "empty",
      latestStatus: "failed",
      emptyHint: "该名额已失守，当前没有运行中的世界",
    });
    expect(view.slots[1].state).toBe("active");
  });

  it("renders active gates as real view-switch controls and escapes world names", () => {
    const view = getWorldGateView(
      makeRun({
        worlds: [makeWorld({ name: '<script>alert("x")</script>' })],
      }),
      "lingzai",
    );
    const html = worldGatePanelHtml(view);

    expect(html).toContain('data-action="scene-world" data-world="lingzai"');
    expect(html).toContain('data-gate-state="locked"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("正在查看");
  });

  it("does not offer a world-switch action during first-run focus", () => {
    const html = worldGatePanelHtml(
      getWorldGateView(makeRun(), "lingzai"),
      { canSwitch: false },
    );

    expect(html).toContain("入门后可切换");
    expect(html).not.toContain('data-action="scene-world"');
    expect(html).toContain('data-gate-state="active"');
  });
});
