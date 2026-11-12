import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { summarizeFinale } from "../src/systems/finale-readiness.js";

describe("finale readiness is an accurate, side-effect-free preview", () => {
  it("starts with concrete progress, level, and material shortfalls", () => {
    const state = Engine.fresh("finale-view", 1, false);
    const world = Engine.byId(state, "lingzai");
    const preview = Engine.info(state, world).finale;
    expect(preview.ready).toBe(false);
    expect(preview.checks.find((x) => x.id === "progress").detail).toContain("/100");
    expect(preview.checks.find((x) => x.id === "base-level").ready).toBe(false);
    expect(preview.checks.find((x) => x.id === "materials").detail).toContain("尚缺");
    expect(preview.checks.some((x) => x.id === "combat")).toBe(false);
  });

  it("matches the authoritative gate when Lingzai meets all conditions", () => {
    const state = Engine.fresh("finale-ready", 1, false);
    const world = Engine.byId(state, "lingzai");
    world.p = 100;
    world.flags.p65 = true;
    world.flags.p100 = true;
    world.level = 3;
    world.resource = Engine.WORLDS.lingzai.finalCost;

    const before = JSON.stringify(state);
    const preview = Engine.info(state, world).finale;
    expect(preview.ready).toBe(Engine.canFinal(state, world, 0));
    expect(preview.ready).toBe(true);
    expect(preview.checks.every((x) => x.ready)).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("honors zombie weakness and temporary injury while keeping the base Lv3 gate", () => {
    const state = Engine.fresh("finale-zombie", 1, false);
    const world = Engine.byId(state, "zombie");
    world.p = 100;
    world.flags.p65 = true;
    world.flags.p100 = true;
    world.level = 3;
    world.resource = 12;

    expect(Engine.info(state, world).finale.ready).toBe(false);
    world.flags.weakness = true;
    expect(Engine.info(state, world).finale.ready).toBe(true);
    world.injuryUntil = state.day + 2;
    const preview = Engine.info(state, world).finale;
    expect(preview.ready).toBe(false);
    expect(preview.checks.find((x) => x.id === "combat").detail).toContain("受伤");
  });

  it("shows boss requirements without pretending fusion bypasses the base gate", () => {
    const state = Engine.fresh("finale-beast", 3, false);
    const world = Engine.byId(state, "beast");
    world.p = 100;
    world.flags.p65 = true;
    world.flags.p100 = true;
    world.level = 2;
    world.resource = 14;
    const preview = Engine.info(state, world).finale;
    expect(preview.ready).toBe(false);
    expect(preview.checks.find((x) => x.id === "base-level").ready).toBe(false);
    expect(preview.checks.find((x) => x.id === "combat").ready).toBe(false);
  });

  it("tracks retreat as an independent blocker and never writes to the run", () => {
    const state = Engine.fresh("finale-retreat", 1, false);
    const world = Engine.byId(state, "lingzai");
    world.level = 3;
    world.p = 100;
    world.flags.p65 = true;
    world.flags.p100 = true;
    world.resource = 10;
    world.retreat = { remaining: 2, duration: 4 };
    const before = JSON.stringify(state);
    const preview = Engine.info(state, world).finale;
    expect(preview.ready).toBe(false);
    expect(preview.checks.find((x) => x.id === "retreat").detail).toContain("还需2天");
    expect(JSON.stringify(state)).toBe(before);
  });

  it("can be used independently with explicit authoritative inputs", () => {
    const state = Engine.fresh("finale-pure", 1, false);
    const world = Engine.byId(state, "lingzai");
    const preview = summarizeFinale(state, world, {
      definition: Engine.WORLDS.lingzai,
      bossLevel: 0,
      effectiveLevel: 1,
      canFinish: false,
    });
    expect(preview.ready).toBe(false);
    expect(preview.checks).toHaveLength(5);
  });
});
