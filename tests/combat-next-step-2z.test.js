import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { getCombatNextStep } from "../src/presentation/combat-next-step.js";

const fight = (defeated = 7) => {
  const run = Engine.fresh("2z-next-step", 1, true);
  run.day = 8;
  const world = Engine.byId(run, "lingzai");
  world.lastDecision = { day: 7, actionId: "fight" };
  world.lastCombat = {
    day: 7,
    spectacle: {
      encountered: 10, defeated, grade: "守住防线",
      waves: [{ encountered: 10, defeated }],
    },
  };
  return { run, world };
};

describe("2Z post-combat decision bridge", () => {
  it("prefers a preview of one-use support only after a genuine partial clear", () => {
    const { run, world } = fight(7);
    const before = JSON.stringify(run);
    const preview = Engine.previewTactic(run, world.id);
    expect(preview).toMatchObject({ available: true, armed: false, apCost: 1 });
    const next = getCombatNextStep(run, world, preview);
    expect(next).toMatchObject({
      day: 7, panel: "tactic", label: "预览下次支援", impact: null,
    });
    expect(next.description).toContain("3个目标未击退");
    expect(next.description).toContain("确认后才会扣费");
    for (let i = 0; i < 10; i++) getCombatNextStep(run, world, preview);
    expect(JSON.stringify(run)).toBe(before);
  });

  it("prioritizes pending events and does not auto-pay or alter tactics", () => {
    const { run, world } = fight();
    world.pendingEvent = { state: "active", id: "example" };
    expect(getCombatNextStep(run, world, Engine.previewTactic(run, world.id))).toMatchObject({
      panel: "event", label: "处理待选",
    });
    expect(world.tacticalAssist).toBeUndefined();
    expect(run.ap).toBe(2);
  });

  it("never recommends paying again for an already-armed tactic", () => {
    const { run, world } = fight();
    expect(Engine.applyCommand(run, {
      operationId: "2z-arm", type: "tactic", args: ["lingzai"],
    }).ok).toBe(true);
    expect(getCombatNextStep(run, world, Engine.previewTactic(run, world.id))).toMatchObject({
      panel: "tactic", label: "查看待命战术",
    });
  });

  it("offers strategy inspection for fully repelled waves or blocked support", () => {
    const full = fight(10);
    expect(getCombatNextStep(full.run, full.world,
      Engine.previewTactic(full.run, full.world.id))).toMatchObject({
        panel: "strategy", label: "查看策略",
    });
    const blocked = fight(4);
    blocked.run.ap = 0;
    expect(getCombatNextStep(blocked.run, blocked.world,
      Engine.previewTactic(blocked.run, blocked.world.id))).toMatchObject({
        panel: "strategy", label: "查看策略",
    });
  });

  it("only displays an existing same-day-relevant receipt, never stale or finished fights", () => {
    const { run, world } = fight();
    const preview = Engine.previewTactic(run, world.id);
    world.lastCombat.tactic = { extraDefeated: 2, dangerRelief: 0.5 };
    expect(getCombatNextStep(run, world, preview).impact).toEqual({
      extraDefeated: 2, dangerRelief: 0.5,
    });
    run.day += 1;
    expect(getCombatNextStep(run, world, preview)).toBeNull();
    run.day = 8;
    world.lastDecision.actionId = "gather";
    expect(getCombatNextStep(run, world, preview)).toBeNull();
    world.lastDecision.actionId = "fight";
    run.active = false;
    expect(getCombatNextStep(run, world, preview)).toBeNull();
    run.active = true;
    world.status = "saved";
    expect(getCombatNextStep(run, world, preview)).toBeNull();
  });
});
