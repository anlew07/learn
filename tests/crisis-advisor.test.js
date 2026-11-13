import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { assessCrises } from "../src/systems/crisis-advisor.js";

describe("crisis triage reads real contracts without predicting an ending", () => {
  it("does not alarm on the calm first day or finished runs", () => {
    const state = Engine.fresh("crisis-calm", 1, false);
    expect(Engine.advise(state)).toEqual([]);
    state.active = false;
    state.worlds[0].d = 98;
    expect(Engine.advise(state)).toEqual([]);
  });

  it("orders two endangered worlds, chooses a safe donor and never mutates RNG", () => {
    const state = Engine.fresh("crisis-sorting", 3, false);
    const beast = Engine.byId(state, "beast");
    const zombie = Engine.byId(state, "zombie");
    const lingzai = Engine.byId(state, "lingzai");
    beast.d = 92;
    zombie.d = 84;
    lingzai.resource = 20;
    zombie.resource = 15;
    const snapshot = JSON.stringify(state);
    const ordered = Engine.advise(state);
    expect(ordered.map((row) => row.worldId).slice(0, 2)).toEqual(["beast", "zombie"]);
    const suggested = ordered[0].actions.find((action) => action.kind === "aid");
    expect(suggested.sourceId).toBe("lingzai");
    expect(suggested.mode).toBe("d");
    expect(suggested.detail).toContain("实际D−12");
    expect(suggested.detail).toContain("1AP");
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("does not propose an invalid paid aid when all AP is reserved", () => {
    const state = Engine.fresh("crisis-ap", 1, false);
    Engine.byId(state, "zombie").d = 92;
    state.apReserved = state.ap;
    const row = Engine.advise(state).find((entry) => entry.worldId === "zombie");
    expect(row.actions.some((action) => action.kind === "aid")).toBe(false);
    expect(row.blockers.join(" ")).toContain("行动点");
    expect(state.ap).toBe(2);
  });

  it("prioritizes expiring major events and quotes their real safe default", () => {
    const state = Engine.fresh("crisis-event", 1, false);
    const lingzai = Engine.byId(state, "lingzai");
    const zombie = Engine.byId(state, "zombie");
    lingzai.pendingEvent = {
      id: "clue:1", type: "clue", title: "雾谷古碑",
      state: "active", expiresDay: state.day + 1,
    };
    zombie.d = 93;
    const top = Engine.advise(state)[0];
    expect(top.worldId).toBe("lingzai");
    expect(top.actions[0].kind).toBe("event");
    expect(top.actions[0].detail).toContain("P+2");
    expect(top.notes[0]).toContain("自动处理");
  });

  it("does not recommend P aid to solve a material-gated P100 finale", () => {
    const state = Engine.fresh("crisis-material", 1, false);
    const zombie = Engine.byId(state, "zombie");
    zombie.p = 100;
    zombie.flags.p65 = true;
    zombie.flags.p100 = true;
    zombie.level = 3;
    zombie.resource = 4;
    const advice = Engine.advise(state).find((row) => row.worldId === "zombie");
    expect(advice.notes.join(" ")).toContain("终局尚缺");
    expect(advice.blockers.join(" ")).toContain("跨世界援助不会转移材料");
    expect(advice.actions.some((action) => action.kind === "aid")).toBe(false);
    expect(advice.actions.some((action) => action.kind === "fusion")).toBe(false);
  });

  it("exposes legitimate fusion without borrowing or spending on preview", () => {
    const state = Engine.fresh("crisis-fusion", 2, false);
    const zombie = Engine.byId(state, "zombie");
    const lingzai = Engine.byId(state, "lingzai");
    zombie.p = 100;
    zombie.level = 3;
    zombie.resource = 12;
    zombie.flags.p65 = true;
    zombie.flags.p100 = true;
    lingzai.level = 2;
    const before = JSON.stringify(state);
    const advice = Engine.advise(state).find((row) => row.worldId === "zombie");
    const choice = advice.actions.find((action) => action.kind === "fusion");
    expect(choice.detail).toContain("1AP / 1灵魂");
    expect(JSON.stringify(state)).toBe(before);
    expect(Engine.previewFusion(state, "zombie").available).toBe(true);
  });

  it("keeps a late deadline advisory separate from speculative extra survival days", () => {
    const state = Engine.fresh("crisis-deadline", 1, false);
    const zombie = Engine.byId(state, "zombie");
    state.day = zombie.deadline - 2;
    zombie.p = 69;
    const advice = Engine.advise(state).find((row) => row.worldId === "zombie");
    expect(advice.remainingDays).toBe(2);
    expect(advice.actions.some((action) => action.kind === "aid")).toBe(true);
    expect(advice.actions.find((action) => action.kind === "aid").detail).toContain("P+12");
    expect(JSON.stringify(advice)).not.toMatch(/延缓.*天|保证成功/);
  });

  it("never changes the seeded simulation even if guidance is viewed each day", () => {
    for (const runNumber of [1, 3]) {
      for (let seed = 0; seed < 10; seed++) {
        const original = Engine.fresh("advice-determinism-" + seed, runNumber, true);
        const observed = Engine.fresh("advice-determinism-" + seed, runNumber, true);
        for (let day = 0; day < 80 && original.active; day++) {
          Engine.advise(observed);
          expect(JSON.stringify(observed)).toBe(JSON.stringify(original));
          Engine.step(original);
          Engine.step(observed);
        }
        expect(observed).toEqual(original);
      }
    }
  });

  it("can use a pure callback interface and produces stable advice for equal input", () => {
    const state = Engine.fresh("crisis-callback", 1, false);
    Engine.byId(state, "zombie").d = 75;
    const callbacks = {
      info: Engine.info,
      event: Engine.previewMajorEvent,
      fusion: Engine.previewFusion,
      aid: Engine.previewAid,
    };
    expect(assessCrises(state, callbacks)).toEqual(Engine.advise(state));
    expect(Engine.advise(state)).toEqual(Engine.advise(state));
  });
});
