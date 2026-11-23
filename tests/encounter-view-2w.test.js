import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { getRecentEncounter } from "../src/presentation/encounter-view.js";
import { getStageView } from "../src/presentation/stage-view.js";

function completedFight() {
  return {
    day: 7, status: "running",
    lastDecision: { day: 6, actionId: "fight" },
    lastCombat: {
      day: 6, spectacle: {
        encountered: 27, defeated: 19, grade: "鏖战",
        waves: [
          { encountered: 7, defeated: 7 },
          { encountered: 9, defeated: 7 },
          { encountered: 11, defeated: 5 },
        ],
      },
    },
  };
}

describe("2W formal-world automatic encounter replay", () => {
  it("shows only an actual completed fight from the previous day", () => {
    const world = completedFight();
    const before = JSON.stringify(world);
    expect(getRecentEncounter(world, 7)).toEqual({
      day: 6, encountered: 27, defeated: 19, grade: "鏖战",
      waves: [
        { encountered: 7, defeated: 7 },
        { encountered: 9, defeated: 7 },
        { encountered: 11, defeated: 5 },
      ],
    });
    expect(JSON.stringify(world)).toBe(before);
    expect(getRecentEncounter(world, 8)).toBeNull();
    world.lastDecision.actionId = "explore";
    expect(getRecentEncounter(world, 7)).toBeNull();
    world.lastDecision.actionId = "fight";
    world.status = "saved";
    expect(getRecentEncounter(world, 7)).toBeNull();
  });

  it("does not invent combat for non-combat actions, disabled waves or corrupt old saves", () => {
    const world = completedFight();
    world.lastCombat.spectacle = null;
    expect(getRecentEncounter(world, 7)).toBeNull();
    world.lastCombat.spectacle = { encountered: 10, defeated: 12 };
    expect(getRecentEncounter(world, 7)).toBeNull();
    world.lastCombat.spectacle = { encountered: 10, defeated: 0, waves: [{ encountered: 0, defeated: 2 }] };
    expect(getRecentEncounter(world, 7).waves).toEqual([]);
    expect(getRecentEncounter(null, 7)).toBeNull();
    expect(getRecentEncounter(world, NaN)).toBeNull();
  });

  it("uses the real formal-world fight transaction without another reward or day", () => {
    const run = Engine.fresh("2w-encounter-integrity", 1, true);
    const selected = Engine.applyCommand(run, {
      operationId: "2w-clear-test", type: "strategy", args: ["lingzai", "clear"],
    });
    expect(selected.ok).toBe(true);
    let fought = false;
    for (let i = 0; i < 100 && run.active; i++) {
      Engine.step(run);
      const target = run.worlds.find((w) =>
        w.status === "running" && w.lastDecision?.actionId === "fight" &&
        w.lastCombat?.day === run.day - 1);
      if (!target) continue;
      const before = JSON.stringify(run);
      const encounter = getStageView(run, target.id).encounter;
      expect(encounter).toBeTruthy();
      expect(encounter.defeated).toBe(target.lastCombat.spectacle.defeated);
      for (let n = 0; n < 10; n++) getStageView(run, target.id);
      expect(JSON.stringify(run)).toBe(before);
      fought = true;
      break;
    }
    expect(fought).toBe(true);
  });
});
