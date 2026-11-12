import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { evaluateFusion } from "../src/systems/fusion-contract.js";

describe("fusion options are truthful and cannot double-spend", () => {
  it("is unavailable before the unlock or without an eligible important battle", () => {
    const first = Engine.fresh("fusion-first", 1, false);
    expect(Engine.previewFusion(first, "zombie").available).toBe(false);
    const second = Engine.fresh("fusion-second", 2, false);
    expect(Engine.previewFusion(second, "zombie").available).toBe(false);
  });

  it("matches a valid two-person finale and spends once", () => {
    const state = Engine.fresh("fusion-contract", 2, false);
    const donor = Engine.byId(state, "lingzai");
    const target = Engine.byId(state, "zombie");
    donor.level = 2;
    target.p = 100;
    target.flags.p65 = true;
    target.flags.p100 = true;
    target.level = 3;
    target.resource = 12;
    const before = JSON.stringify(state);
    const preview = Engine.previewFusion(state, "zombie");
    expect(preview.available).toBe(true);
    expect(preview.kind).toBe("二人之力");
    expect(preview.apCost).toBe(1);
    expect(preview.soulCost).toBe(1);
    expect(preview.donorIds).toEqual(["lingzai"]);
    expect(JSON.stringify(state)).toBe(before);
    expect(Engine.fuse(state, "zombie").ok).toBe(true);
    expect(state.ap).toBe(1);
    expect(state.soul).toBe(7);
    expect(target.status).toBe("saved");
    expect(Engine.fuse(state, "zombie").ok).toBe(false);
  });

  it("does not accept repeated provider IDs for a three-person boost", () => {
    const state = Engine.fresh("fusion-duplicate", 3, false);
    const target = Engine.byId(state, "beast");
    state.worlds.filter((w) => w.id !== "beast").forEach((w) => {
      w.level = 2;
    });
    target.level = 3;
    target.p = 100;
    target.flags.p65 = true;
    target.flags.p100 = true;
    target.resource = 14;
    target.phase = "狂化";
    expect(Engine.previewFusion(state, "beast").available).toBe(true);
    const before = JSON.stringify(state);
    expect(Engine.previewFusion(state, "beast", ["lingzai", "lingzai"]).available).toBe(
      false,
    );
    expect(Engine.fuse(state, "beast", ["lingzai", "lingzai"]).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
    expect(Engine.fuse(state, "beast").ok).toBe(true);
    expect(target.status).toBe("saved");
  });

  it("cannot borrow a retreating world and never spends on invalid fusion", () => {
    const state = Engine.fresh("fusion-retreat", 2, false);
    const donor = Engine.byId(state, "lingzai");
    const target = Engine.byId(state, "zombie");
    donor.level = 2;
    donor.retreat = { remaining: 3, duration: 4 };
    target.p = 100;
    target.level = 3;
    target.resource = 12;
    target.flags.p65 = true;
    target.flags.p100 = true;
    const before = JSON.stringify(state);
    const preview = Engine.previewFusion(state, "zombie");
    expect(preview.available).toBe(false);
    expect(preview.reason).toContain("闭关");
    expect(Engine.fuse(state, "zombie").ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("pure evaluator returns a structured failure without mutation", () => {
    const state = Engine.fresh("fusion-pure", 2, false);
    const world = Engine.byId(state, "zombie");
    const before = JSON.stringify(state);
    const result = evaluateFusion(state, world, {
      definition: Engine.WORLDS.zombie,
      canFinish: false,
      bossRequirement: 4,
      effectiveLevel: 1,
      freeAP: 2,
    });
    expect(result.available).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
});
