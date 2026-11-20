import { describe, expect, it } from "vitest";
import { SORTIE } from "../src/config/sortie-data.js";
import {
  chooseSortieSkill, createSortie, stepSortie,
} from "../src/systems/sortie-sim.js";
import { previewSortieDeadline } from "../src/ui/sortie-deadline.js";

describe("2P read-only salvage countdown", () => {
  it("only appears in salvage and shows two distinct existing time limits", () => {
    expect(previewSortieDeadline(createSortie("2p-safe"))).toBeNull();
    const battle = createSortie("2p-window", 0, 0, "salvage");
    const untouched = JSON.stringify(battle);
    expect(previewSortieDeadline(battle)).toMatchObject({
      phase: "waiting", seconds: 65,
      text: "回收点 10 秒后开放 · 距截止 65 秒",
    });
    expect(battle).toEqual(JSON.parse(untouched));
    battle.hero.invulnerable = 5000; // Test-only survival guard, no combat rule.
    for (let i = 0; i < 600; i++) stepSortie(battle);
    expect(battle.tick).toBe(600);
    expect(battle.mission.status).toBe("available");
    expect(previewSortieDeadline(battle)).toMatchObject({
      phase: "available", seconds: 55, text: "回收截止剩余 55 秒",
    });
  });

  it("tracks only 60Hz battle ticks and freezes through the 25s skill choice", () => {
    const battle = createSortie("2p-skill", 0, 0, "salvage");
    battle.hero.invulnerable = 5000;
    for (let i = 0; i < 1500; i++) stepSortie(battle);
    expect(battle.skillChoicePending).toBe(true);
    const before = JSON.stringify(battle);
    const view = previewSortieDeadline(battle);
    expect(view).toMatchObject({ phase: "available", seconds: 40 });
    for (let i = 0; i < 120; i++) {
      stepSortie(battle, { x: 1, y: 0 });
    }
    expect(battle).toEqual(JSON.parse(before));
    expect(previewSortieDeadline(battle)).toEqual(view);
    expect(chooseSortieSkill(battle, "rune").ok).toBe(true);
    for (let i = 0; i < 60; i++) stepSortie(battle);
    expect(previewSortieDeadline(battle).seconds).toBe(39);
    expect(SORTIE.skills.choiceSeconds).toBe(25);
  });

  it("shows an urgent 10s deadline and honest completion/expiration", () => {
    const battle = createSortie("2p-urgent", 0, 0, "salvage");
    battle.tick = 55 * SORTIE.ticksPerSecond;
    battle.mission.status = "available";
    const original = JSON.stringify(battle);
    expect(previewSortieDeadline(battle)).toMatchObject({
      phase: "urgent", seconds: 10,
      text: "回收仅剩 10 秒 · 尽快停留 1 秒",
    });
    expect(battle).toEqual(JSON.parse(original));
    battle.tick = 65 * SORTIE.ticksPerSecond - 1;
    expect(previewSortieDeadline(battle).seconds).toBe(1);
    battle.tick = 65 * SORTIE.ticksPerSecond;
    battle.mission.status = "expired";
    expect(previewSortieDeadline(battle)).toMatchObject({
      phase: "expired", seconds: 0,
      text: "回收已截止 · 任务奖金 +0",
    });
    battle.mission.status = "completed";
    expect(previewSortieDeadline(battle)).toMatchObject({
      phase: "completed", text: "回收完成 · 仍需活到 75 秒",
    });
  });
});
