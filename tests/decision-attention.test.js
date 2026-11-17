import { describe, expect, it } from "vitest";
import { nextNewDecision, pendingDecisions } from "../src/presentation/decision-attention.js";

function world(id) {
  return {
    id,
    status: "running",
    pendingEvent: null,
    build: { pending: null },
  };
}

describe("UI decision attention", () => {
  it("ignores queued events until they become actionable, then interrupts once", () => {
    const run = { active: true, worlds: [world("lingzai"), world("zombie")] };
    run.worlds[1].pendingEvent = {
      id: "zombie/clue/1",
      state: "queued",
      startDay: 12,
    };
    expect(pendingDecisions(run)).toEqual([]);

    const before = new Set(pendingDecisions(run).map((item) => item.key));
    run.worlds[1].pendingEvent.state = "active";
    expect(nextNewDecision(run, before)).toMatchObject({
      kind: "event",
      worldId: "zombie",
    });
    const after = new Set(pendingDecisions(run).map((item) => item.key));
    expect(nextNewDecision(run, after)).toBeNull();
  });

  it("detects build offers, prioritizes major events and preserves every world", () => {
    const run = { active: true, worlds: [world("lingzai"), world("zombie")] };
    run.worlds[0].build.pending = {
      id: "lingzai/build/1",
      due: 9,
      options: ["sword", "rune"],
    };
    run.worlds[1].pendingEvent = {
      id: "zombie/clue/1",
      type: "clue",
      state: "active",
    };
    expect(pendingDecisions(run).map((item) => item.kind)).toEqual(["event", "build"]);
    expect(nextNewDecision(run)?.worldId).toBe("zombie");

    const priorKeys = new Set(pendingDecisions(run).map((item) => item.key));
    run.worlds[0].pendingEvent = {
      id: "lingzai/clue/2",
      type: "clue",
      state: "active",
    };
    expect(nextNewDecision(run, priorKeys)).toMatchObject({
      kind: "event",
      worldId: "lingzai",
    });
  });

  it("does not mutate game state, consume RNG or create alerts for ended worlds", () => {
    const run = { active: true, worlds: [world("lingzai"), world("zombie")] };
    run.worlds[0].pendingEvent = { id: "a", state: "active" };
    run.worlds[1].status = "saved";
    run.worlds[1].build.pending = { id: "b", due: 20, options: ["armor"] };

    const original = JSON.stringify(run);
    expect(pendingDecisions(run)).toHaveLength(1);
    expect(nextNewDecision(run).key).toBe("event:lingzai:a");
    expect(JSON.stringify(run)).toBe(original);

    run.active = false;
    expect(nextNewDecision(run)).toBeNull();
    expect(pendingDecisions(null)).toEqual([]);
  });

  it("supports restored older build offers without an explicit id", () => {
    const run = { active: true, worlds: [world("zombie")] };
    run.worlds[0].build.pending = { due: 7, options: ["arc", "armor"] };
    expect(pendingDecisions(run)).toEqual([
      {
        kind: "build",
        worldId: "zombie",
        key: "build:zombie:7:arc,armor",
      },
    ]);
  });
});
