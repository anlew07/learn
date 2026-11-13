import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";

describe("explainable action and wave gameplay integration", () => {
  it("persists the selected action reason without choosing an extra action", () => {
    const state = Engine.fresh("explainable", 1, false);
    Engine.step(state);
    const lingzai = Engine.byId(state, "lingzai");
    const zombie = Engine.byId(state, "zombie");

    expect(lingzai.lastDecision.actionId).toBe("growth");
    expect(lingzai.lastDecision.reason).toContain("成长经验");
    expect(zombie.lastDecision.actionId).toBe("explore");
    expect(zombie.lastDecision.reason).toContain("灾变源");
    expect(lingzai.lastDecision.day).toBe(1);
    expect(lingzai.lastCombat).toBeNull();
  });

  it("writes an actual wave report with source skills and bounded bonus amounts", () => {
    const state = Engine.fresh("wave-report", 1, true);
    const world = Engine.byId(state, "zombie");
    world.level = 2;
    world.strategy = "clear";
    world.d = 20;
    world.threat = { id: "nest", progress: 0, status: "active", retryDay: 1 };
    world.build.attack = [{ id: "blades", lv: 2 }];
    world.build.support = [{ id: "armor", lv: 1 }];
    world.build.count = 2;
    world.build.evolved = true;
    world.build.evolutionName = "钢雨防线";

    Engine.step(state);
    const report = world.lastCombat;
    expect(report.day).toBe(1);
    expect(world.lastDecision.actionId).toBe("fight");
    expect(report.stages).toHaveLength(3);
    expect(report.skills).toContain("碎片飞刃");
    expect(report.evolution).toBe("钢雨防线");
    expect(report.bonus.xp).toBeGreaterThan(0);
    expect(report.bonus.xp).toBeLessThanOrEqual(0.75);
    expect(report.bonus.doomReduced).toBeGreaterThan(0);
    expect(report.bonus.doomReduced).toBeLessThanOrEqual(0.25);
    expect(world.threat.progress).toBe(1);
    expect(JSON.parse(JSON.stringify(state)).worlds[1].lastCombat).toEqual(report);
  });

  it("automatically completes a valid combo over a redundant level-up", () => {
    const state = Engine.fresh("combo-auto", 1, true);
    const world = Engine.byId(state, "zombie");
    world.level = 2;
    world.strategy = "clear";
    world.build.attack = [{ id: "blades", lv: 1 }];
    world.build.count = 1;
    world.build.pending = {
      id: "combo-offer",
      reason: "主线定位完成",
      options: ["blades", "arc", "armor"],
      due: 1,
    };

    Engine.step(state);
    expect(world.build.count).toBe(2);
    expect(world.build.pending).toBeNull();
    expect(world.build.evolved).toBe(true);
    expect(world.build.evolutionName).toBe("钢雨防线");
    expect(world.build.support).toEqual([{ id: "armor", lv: 1 }]);
  });

  it("keeps the optional survivor experiment out of non-wave battles", () => {
    const state = Engine.fresh("wave-disabled", 1, false);
    const world = Engine.byId(state, "zombie");
    world.strategy = "clear";
    world.build.attack = [{ id: "blades", lv: 2 }];
    world.build.support = [{ id: "armor", lv: 2 }];
    world.build.evolved = true;
    Engine.step(state);
    expect(world.lastCombat).toBeNull();
    expect(world.build.count).toBe(0);
  });
});

  it("settles performance-scaled wave effects once in the existing zombie fight", () => {
    const state = Engine.fresh("wave-budget-transaction", 1, true);
    const world = Engine.byId(state, "zombie");
    state.day = 35;
    world.level = 2;
    world.p = 45;
    world.d = 20;
    world.strategy = "clear";
    world.threat = { id: "parking-lot", progress: 0, status: "active", retryDay: 1 };
    world.build.attack = [
      { id: "blades", lv: 2 },
      { id: "arc", lv: 2 },
    ];
    world.build.support = [{ id: "armor", lv: 1 }];
    world.build.count = 3;
    world.build.evolved = true;
    world.build.evolutionName = "钢雨防线";

    expect(Engine.step(state).ok).toBe(true);
    expect(world.lastDecision.actionId).toBe("fight");
    expect(world.lastCombat.spectacle.fullClear).toBe(true);
    expect(world.lastCombat.bonus.waveClearBonus).toBeGreaterThan(0);
    expect(world.lastCombat.bonus.waveLossMitigation).toBeGreaterThan(0);
    expect(world.lastCombat.bonus.waveLootModifier).toBeGreaterThan(0);
    expect(world.metrics.waveCombats).toBe(1);
    expect(world.metrics.waveClearBonus).toBe(world.lastCombat.bonus.waveClearBonus);
    expect(world.metrics.waveLossMitigation).toBe(
      world.lastCombat.bonus.waveLossMitigation,
    );
    expect(world.metrics.waveLootModifier).toBe(
      world.lastCombat.bonus.waveLootModifier,
    );

    const restored = JSON.parse(JSON.stringify(state));
    const savedWorld = Engine.byId(restored, "zombie");
    expect(savedWorld.lastCombat).toEqual(world.lastCombat);
    expect(savedWorld.metrics.waveCombats).toBe(1);
  });

