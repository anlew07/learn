import { describe, expect, it } from "vitest";
import Engine from "../src/engine.js";
import { canQueueFollowup, followupMitigation, previewFollowup } from "../src/systems/event-chain.js";

function unlocked(id = "lingzai") {
  const state = Engine.fresh("followup-" + id, 3, false);
  const world = Engine.byId(state, id);
  world.flags.sideResolved = true;
  world.flags.p65 = true;
  world.p = 65;
  const trigger = { lingzai: "ancientSeal", zombie: "weakness", beast: "beastTrail" }[id];
  world.flags[trigger] = true;
  return { state, world };
}

function activate(state, world) {
  Engine.step(state);
  expect(world.pendingEvent?.type).toBe("followup");
  expect(world.pendingEvent?.state).toBe("queued");
  Engine.step(state);
  expect(world.pendingEvent?.state).toBe("active");
}

describe("optional world story chains", () => {
  it("queues exactly one follow-up after genuine clue success and P65", () => {
    for (const id of ["lingzai", "zombie", "beast"]) {
      // The risky choice is deterministic for each seed: a success grants the flag.
      let found = false;
      for (let i = 0; i < 60 && !found; i++) {
        const alternative = Engine.fresh("successful-clue-" + i, 3, false);
        const target = Engine.byId(alternative, id);
        target.pendingEvent = {
          id: "clue", type: "clue", title: "线索", state: "active", expiresDay: 4,
        };
        Engine.resolveEvent(alternative, id, "push");
        found = Boolean(target.flags.ancientSeal || target.flags.weakness || target.flags.beastTrail);
        if (!found) continue;
        expect(canQueueFollowup(target)).toBe(false);
        target.p = 65;
        target.flags.p65 = true;
        expect(canQueueFollowup(target)).toBe(true);
        activate(alternative, target);
        expect(target.flags.followupQueued).toBe(true);
        expect(canQueueFollowup(target)).toBe(false);
        expect(Engine.resolveEvent(alternative, id, "safe").ok).toBe(true);
        expect(target.flags.followupResolved).toBe(true);
        expect(target.pendingEvent).toBeNull();
        expect(canQueueFollowup(target)).toBe(false);
      }
      expect(found).toBe(true);
    }
  });

  it("keeps the mainline playable when a clue was ignored or declined", () => {
    const { state, world } = unlocked();
    delete world.flags.ancientSeal;
    expect(canQueueFollowup(world)).toBe(false);
    for (let i = 0; i < 4; i++) Engine.step(state);
    expect(world.pendingEvent?.type).not.toBe("followup");
  });

  it("does not overwrite an already pending boss event", () => {
    const { state, world } = unlocked();
    world.pendingEvent = {
      id: "boss", type: "boss", state: "queued", title: "巢群",
      startDay: state.day + 20, expiresDay: state.day + 22,
    };
    Engine.step(state);
    expect(world.pendingEvent.id).toBe("boss");
    expect(world.flags.followupQueued).not.toBe(true);
  });

  it("the paid Lingzai seal reduces only seven later natural doom ticks", () => {
    const { state, world } = unlocked();
    activate(state, world);
    state.ap = 2;
    world.resource = 8;
    const before = JSON.stringify(state);
    const preview = Engine.previewMajorEvent(state, world);
    expect(preview.options.find((value) => value.id === "commit").available).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    expect(Engine.resolveEvent(state, world.id, "commit").ok).toBe(true);
    expect(state.ap).toBe(1);
    expect(world.resource).toBe(5);
    expect(world.followupEffect.perDay).toBe(0.4);
    expect(followupMitigation(world, state.day, "natural")).toBe(0);
    expect(followupMitigation(world, state.day + 1, "natural")).toBe(0.4);
    expect(followupMitigation(world, state.day + 7, "natural")).toBe(0.4);
    expect(followupMitigation(world, state.day + 8, "natural")).toBe(0);
    const copy = JSON.parse(JSON.stringify(state));
    delete Engine.byId(copy, world.id).followupEffect;
    Engine.step(state);
    Engine.step(copy);
    expect(Number((Engine.byId(copy, world.id).d - world.d).toFixed(2))).toBe(0);
    // Next game day is the first protected one.
    Engine.step(state);
    Engine.step(copy);
    expect(Number((Engine.byId(copy, world.id).d - world.d).toFixed(2))).toBe(0.4);
  });

  it("the Zombie signal protects only active threat pressure", () => {
    const { state, world } = unlocked("zombie");
    activate(state, world);
    state.ap = 2;
    world.resource = 6;
    world.threat = { id: "nest", status: "active", progress: 0, retryDay: 1 };
    expect(Engine.resolveEvent(state, world.id, "commit").ok).toBe(true);
    expect(world.d).toBe(0);
    expect(world.followupEffect.kind).toBe("threat");
    expect(followupMitigation(world, state.day + 1, "threat")).toBe(0.3);
    expect(followupMitigation(world, state.day + 1, "natural")).toBe(0);
    expect(world.resource).toBe(3);
  });

  it("the Beast follow-up completes suppression within the original boss cap", () => {
    const { state, world } = unlocked("beast");
    activate(state, world);
    world.suppression = 1;
    state.ap = 2;
    world.resource = 6;
    world.phase = "狂化";
    expect(Engine.bossRequirement(world)).toBe(5);
    expect(Engine.resolveEvent(state, world.id, "commit").ok).toBe(true);
    expect(world.suppression).toBe(2);
    expect(Engine.bossRequirement(world)).toBe(4);
    expect(world.resource).toBe(3);
    expect(state.ap).toBe(1);
    expect(Engine.resolveEvent(state, world.id, "commit").ok).toBe(false);
  });

  it("rejects paid choices before payment if resources or AP are lacking", () => {
    const { state, world } = unlocked();
    activate(state, world);
    state.ap = 0;
    world.resource = 2;
    const before = JSON.stringify(state);
    const info = previewFollowup(state, world);
    expect(info.options.find((value) => value.id === "commit").available).toBe(false);
    expect(Engine.resolveEvent(state, world.id, "commit").ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("auto-safe expiration resolves only once without AP payment", () => {
    const { state, world } = unlocked();
    activate(state, world);
    const expiry = world.pendingEvent.expiresDay;
    state.day = expiry;
    const before = state.ap;
    const initial = world.p;
    Engine.step(state);
    expect(world.flags.followupOutcome).toBe("safe");
    expect(world.p).toBeGreaterThanOrEqual(initial + 2);
    expect(world.pendingEvent).toBeNull();
    expect(state.ap).toBe(before);
    expect(canQueueFollowup(world)).toBe(false);
  });

  it("already completed suppression cannot spend on an empty commitment", () => {
    const { state, world } = unlocked("beast");
    world.suppression = 2;
    activate(state, world);
    const before = JSON.stringify(state);
    const choice = Engine.previewMajorEvent(state, world).options.find((value) => value.id === "commit");
    expect(choice.available).toBe(false);
    expect(choice.unavailableReason).toContain("无需重复");
    expect(Engine.resolveEvent(state, world.id, "commit").ok).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("follow-up narrative consequences", () => {
  it("keeps a distinct epilogue for each paid world outcome", async () => {
    const { followupEpilogue } = await import("../src/systems/event-chain.js");
    const expected = { lingzai: "古阵回路", zombie: "母巢干扰信标", beast: "巨兽足迹" };
    for (const id of Object.keys(expected)) {
      const { world } = unlocked(id);
      world.flags.followupResolved = true;
      world.flags.followupOutcome = "commit";
      expect(followupEpilogue(world)).toContain(expected[id]);
    }
  });

  it("distinguishes safe, decline, incomplete and unknown clues without mutation", async () => {
    const { followupEpilogue } = await import("../src/systems/event-chain.js");
    const { world } = unlocked();
    const snapshot = JSON.stringify(world);
    expect(followupEpilogue(world)).toContain("未完成");
    expect(JSON.stringify(world)).toBe(snapshot);
    world.flags.followupResolved = true;
    world.flags.followupOutcome = "safe";
    expect(followupEpilogue(world)).toContain("调查记录");
    world.flags.followupOutcome = "decline";
    expect(followupEpilogue(world)).toContain("主动放弃");
    delete world.flags.ancientSeal;
    expect(followupEpilogue(world)).toBe("");
  });

  it("shows committed investigation in the actual successful world log", () => {
    const { state, world } = unlocked("lingzai");
    world.flags.followupResolved = true;
    world.flags.followupOutcome = "commit";
    world.p = 100;
    world.flags.p100 = true;
    world.level = 4;
    world.resource = 100;
    Engine.step(state);
    expect(world.status).toBe("saved");
    expect(state.logs.some((entry) => entry.world === world.id && entry.text.includes("古阵回路"))).toBe(true);
  });
});

describe("boss and optional follow-up scheduling priority", () => {
  it("handles a ready boss before an optional follow-up without consuming the clue", () => {
    const { state, world } = unlocked("zombie");
    world.threat = { id: "threat", status: "awaiting_alpha", progress: 2, retryDay: 1 };
    world.queuedBoss = true;
    Engine.step(state);
    expect(world.pendingEvent?.type).toBe("boss");
    expect(world.flags.followupQueued).not.toBe(true);
    // Resolve without combat to ensure the clue is still pending.
    Engine.step(state);
    expect(world.pendingEvent?.state).toBe("active");
    expect(Engine.resolveEvent(state, world.id, "retreat").ok).toBe(true);
    Engine.step(state);
    expect(world.pendingEvent?.type).toBe("followup");
    expect(world.flags.followupQueued).toBe(true);
  });

  it("does not replace an already queued follow-up with a newly ready boss", () => {
    const { state, world } = unlocked("lingzai");
    Engine.step(state);
    expect(world.pendingEvent?.type).toBe("followup");
    world.threat = { id: "threat", status: "awaiting_alpha", progress: 2, retryDay: 1 };
    world.queuedBoss = true;
    Engine.step(state);
    expect(world.pendingEvent?.type).toBe("followup");
    expect(world.queuedBoss).toBe(true);
  });
});
