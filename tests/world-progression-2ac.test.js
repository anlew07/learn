import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";

function prepareWorldForRescue(world) {
  world.p = 100;
  world.d = 0;
  world.level = 3;
  world.resource = 40;
  world.strategy = "rescue";
  world.flags.p65 = true;
  world.flags.p100 = true;
  if (world.id === "zombie") world.flags.weakness = true;
}

function running(state) {
  return state.worlds.filter((world) => world.status === "running");
}

describe("2AC progressive world slots", () => {
  it("starts with one world and permanently grows to two after the first rescue", () => {
    const state = Engine.fresh("slots-first", 1, true, "", 0);
    expect(state.worldSlots).toBe(1);
    expect(running(state).map((world) => world.id)).toEqual(["lingzai"]);

    const first = Engine.byId(state, "lingzai");
    prepareWorldForRescue(first);
    expect(Engine.step(state).ok).toBe(true);

    expect(first.status).toBe("saved");
    expect(state.worldsSavedCount).toBe(1);
    expect(state.worldsSavedThisRun).toBe(1);
    expect(state.worldSlots).toBe(2);
    expect(running(state).map((world) => world.id).sort()).toEqual(["beast", "zombie"]);
    expect(running(state).map((world) => world.worldNumber).sort()).toEqual([2, 3]);
    expect(state.worldsVisitedThisRun).toBe(3);
  });

  it("opens the third slot after the second rescue while preserving the other world's state", () => {
    const state = Engine.fresh("slots-second", 1, true, "", 0);
    prepareWorldForRescue(Engine.byId(state, "lingzai"));
    Engine.step(state);

    const zombie = Engine.byId(state, "zombie");
    const beast = Engine.byId(state, "beast");
    beast.resource = 17;
    beast.p = 43;
    prepareWorldForRescue(zombie);
    expect(Engine.step(state).ok).toBe(true);

    expect(zombie.status).toBe("saved");
    expect(state.worldsSavedCount).toBe(2);
    expect(state.worldSlots).toBe(3);
    expect(running(state)).toHaveLength(3);
    expect(Engine.byId(state, "beast")).toBe(beast);
    expect(beast.resource).toBe(17);
    expect(beast.p).toBe(43);
    expect(running(state).map((world) => world.id).sort()).toEqual(["beast", "lingzai", "zombie"]);
  });

  it("replaces only the rescued slot after reaching the three-world cap", () => {
    const state = Engine.fresh("slots-cap", 1, true, "", 2);
    expect(state.worldSlots).toBe(3);
    expect(running(state).map((world) => world.id).sort()).toEqual(["beast", "lingzai", "zombie"]);

    const lingzai = Engine.byId(state, "lingzai");
    const zombie = Engine.byId(state, "zombie");
    const beast = Engine.byId(state, "beast");
    prepareWorldForRescue(lingzai);
    expect(Engine.step(state).ok).toBe(true);

    expect(state.worldSlots).toBe(3);
    expect(state.worldsSavedCount).toBe(3);
    expect(running(state)).toHaveLength(3);
    expect(Engine.byId(state, "lingzai")).not.toBe(lingzai);
    expect(Engine.byId(state, "zombie")).toBe(zombie);
    expect(Engine.byId(state, "beast")).toBe(beast);
    expect(Engine.byId(state, "lingzai").worldNumber).toBeGreaterThan(lingzai.worldNumber);
  });

  it("restores an old active save with one completed world without double-counting it", () => {
    const old = Engine.fresh("old-world-save", 1, true);
    old.worlds[0].status = "saved";
    old.worlds[1].status = "running";
    for (const key of [
      "worldsSavedCount", "worldsSavedThisRun", "worldsFailedThisRun",
      "worldsVisitedThisRun", "worldSlots", "worldSequence", "nextSlotId",
      "worldTypesSeen", "worldDiscoveryArchive",
    ]) delete old[key];
    old.worlds.forEach((world) => {
      delete world.slotId;
      delete world.worldNumber;
      delete world.transitionSettled;
    });

    const restored = Engine.restore(old, 0);
    expect(restored.worldsSavedCount).toBe(1);
    expect(restored.worldsSavedThisRun).toBe(1);
    expect(restored.worldSlots).toBe(2);
    expect(running(restored)).toHaveLength(2);
    expect(running(restored).map((world) => world.id).sort()).toEqual(["beast", "zombie"]);
  });
});
